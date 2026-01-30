/**
 * Anthropic Provider - 增强版
 * 支持 Claude 系列模型，包含 Prompt Caching、Beta 标志、分层定价
 * 基于 Roo-Code 的实现
 */

import { BaseProvider } from "./BaseProvider";
import type {
  ChatMessage,
  CreateMessageOptions,
  ModelInfo,
  ProviderType,
  StreamChunk,
  StreamResponse,
} from "./types";

/** Cache Control */
interface CacheControl {
  type: "ephemeral";
}

/** Anthropic 内容块 */
interface AnthropicContent {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  source?: { type: "base64"; media_type: string; data: string };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  cache_control?: CacheControl;
}

/** Anthropic 消息格式 */
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContent[];
}

/** Anthropic 工具定义 */
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** 支持 Prompt Caching 的模型 */
const PROMPT_CACHE_SUPPORTED_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-5",
];

export class AnthropicProvider extends BaseProvider {
  readonly type: ProviderType = "anthropic";
  readonly name = "Anthropic";

  private baseURL = "https://api.anthropic.com/v1";
  private apiVersion = "2023-06-01";

  async *createMessage(messages: ChatMessage[], options?: CreateMessageOptions): StreamResponse {
    this.createController(options?.signal);

    const model = this.config.model;
    const enablePromptCache = PROMPT_CACHE_SUPPORTED_MODELS.some((m) => model.includes(m));
    const { systemPrompt, formattedMessages } = this.formatMessages(messages, enablePromptCache);

    // 构建请求体
    const body: Record<string, unknown> = {
      model,
      messages: formattedMessages,
      max_tokens: options?.maxTokens || 8192,
      stream: true,
    };

    if (systemPrompt) {
      // 系统提示词也添加缓存控制
      if (enablePromptCache) {
        body.system = [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];
      } else {
        body.system = systemPrompt;
      }
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = this.formatTools(options.tools as unknown as { function: { name: string; description: string; parameters: Record<string, unknown> } }[]);
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    // 构建 headers，包含 Beta 标志
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey,
      "anthropic-version": this.apiVersion,
    };

    // 添加 Beta 标志
    const betas = this.getBetaFlags(model, enablePromptCache);
    if (betas.length > 0) {
      headers["anthropic-beta"] = betas.join(",");
    }

    const response = await this.fetch(`${this.baseURL}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", error: `API 错误 (${response.status}): ${errorText}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "无法读取响应流" };
      return;
    }

    // 跟踪 token 使用
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheWriteTokens = 0;
    let cacheReadTokens = 0;

    // 跟踪当前工具调用
    let currentToolId = "";
    let currentToolName = "";
    let currentToolArgs = "";
    let toolIndex = 0;

    for await (const data of this.parseSSEStream(reader)) {
      try {
        const event = JSON.parse(data);

        switch (event.type) {
          case "message_start": {
            const usage = event.message?.usage;
            if (usage) {
              inputTokens = usage.input_tokens || 0;
              outputTokens = usage.output_tokens || 0;
              cacheWriteTokens = usage.cache_creation_input_tokens || 0;
              cacheReadTokens = usage.cache_read_input_tokens || 0;

              yield {
                type: "usage",
                inputTokens,
                outputTokens,
                cacheWriteTokens: cacheWriteTokens || undefined,
                cacheReadTokens: cacheReadTokens || undefined,
              };
            }
            break;
          }

          case "content_block_start":
            if (event.content_block?.type === "tool_use") {
              currentToolId = event.content_block.id || "";
              currentToolName = event.content_block.name || "";
              currentToolArgs = "";
            }
            break;

          case "content_block_delta":
            if (event.delta?.type === "text_delta" && event.delta.text) {
              yield { type: "text", content: event.delta.text };
            } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
              currentToolArgs += event.delta.partial_json;
              yield {
                type: "tool_call_delta",
                index: toolIndex,
                id: currentToolId,
                name: currentToolName,
                arguments: event.delta.partial_json,
              };
            }
            break;

          case "content_block_stop":
            if (currentToolId && currentToolName) {
              yield {
                type: "tool_call",
                toolCall: {
                  id: currentToolId,
                  type: "function",
                  function: { name: currentToolName, arguments: currentToolArgs },
                },
              };
              toolIndex++;
              currentToolId = "";
              currentToolName = "";
              currentToolArgs = "";
            }
            break;

          case "message_delta":
            if (event.usage) {
              outputTokens += event.usage.output_tokens || 0;
            }
            break;
        }
      } catch {
        // 忽略解析错误
      }
    }

    // 发送最终的使用统计和成本
    if (inputTokens > 0 || outputTokens > 0 || cacheWriteTokens > 0 || cacheReadTokens > 0) {
      const modelInfo = await this.getModelInfo(model);
      const totalCost = this.calculateCost(modelInfo, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens);

      yield {
        type: "usage",
        inputTokens: 0,
        outputTokens: 0,
        totalCost,
      };
    }
  }

  /**
   * 获取 Beta 标志
   */
  private getBetaFlags(model: string, enablePromptCache: boolean): string[] {
    const betas: string[] = [];

    // 工具流式支持
    betas.push("fine-grained-tool-streaming-2025-05-14");

    // Prompt Caching
    if (enablePromptCache) {
      betas.push("prompt-caching-2024-07-31");
    }

    // 1M 上下文 (Claude Sonnet 4)
    if (model.includes("claude-sonnet-4") && this.config.options?.anthropicBeta1MContext) {
      betas.push("context-1m-2025-08-07");
    }

    return betas;
  }

  /**
   * 计算 API 成本
   */
  private calculateCost(
    modelInfo: ModelInfo | undefined,
    inputTokens: number,
    outputTokens: number,
    cacheWriteTokens: number,
    cacheReadTokens: number
  ): number {
    if (!modelInfo) return 0;

    const inputCost = ((modelInfo.inputPrice || 0) / 1_000_000) * inputTokens;
    const outputCost = ((modelInfo.outputPrice || 0) / 1_000_000) * outputTokens;
    const cacheWriteCost = ((modelInfo.cacheWritesPrice || 0) / 1_000_000) * cacheWriteTokens;
    const cacheReadCost = ((modelInfo.cacheReadsPrice || 0) / 1_000_000) * cacheReadTokens;

    return inputCost + outputCost + cacheWriteCost + cacheReadCost;
  }

  /**
   * 获取模型信息
   */
  private async getModelInfo(modelId: string): Promise<ModelInfo | undefined> {
    const models = await this.getModels();
    return models.find((m) => m.id === modelId || modelId.includes(m.id));
  }

  /**
   * 格式化消息，支持 Prompt Caching
   */
  private formatMessages(
    messages: ChatMessage[],
    enablePromptCache: boolean
  ): { systemPrompt: string; formattedMessages: AnthropicMessage[] } {
    let systemPrompt = "";
    const formattedMessages: AnthropicMessage[] = [];

    // 找到最后两条 user 消息的索引（用于缓存）
    const userMsgIndices: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.role === "user") userMsgIndices.push(idx);
    });
    const lastUserIdx = userMsgIndices[userMsgIndices.length - 1] ?? -1;
    const secondLastUserIdx = userMsgIndices[userMsgIndices.length - 2] ?? -1;

    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      const msg = messages[msgIdx];

      if (msg.role === "system") {
        systemPrompt = typeof msg.content === "string" ? msg.content : "";
        continue;
      }

      if (msg.role === "tool") {
        formattedMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id,
              content: typeof msg.content === "string" ? msg.content : "",
            },
          ],
        });
        continue;
      }

      const role = msg.role === "assistant" ? "assistant" : "user";
      const shouldCache = enablePromptCache && (msgIdx === lastUserIdx || msgIdx === secondLastUserIdx);

      if (typeof msg.content === "string") {
        if (shouldCache) {
          formattedMessages.push({
            role,
            content: [{ type: "text", text: msg.content, cache_control: { type: "ephemeral" } }],
          });
        } else {
          formattedMessages.push({ role, content: msg.content });
        }
      } else if (Array.isArray(msg.content)) {
        const msgContent = msg.content;
        const content: AnthropicContent[] = msgContent.map((c, cIdx) => {
          const isLastContent = cIdx === msgContent.length - 1;
          const cacheControl = shouldCache && isLastContent ? { type: "ephemeral" as const } : undefined;

          if (c.type === "text") {
            return { type: "text" as const, text: c.text, cache_control: cacheControl };
          }
          if (c.type === "image_url" && c.image_url) {
            const match = c.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              return {
                type: "image" as const,
                source: { type: "base64" as const, media_type: match[1], data: match[2] },
              };
            }
          }
          if (c.type === "image" && c.source) {
            return { type: "image" as const, source: c.source };
          }
          return { type: "text" as const, text: "" };
        });
        formattedMessages.push({ role, content });
      }

      // 处理工具调用
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const lastMsg = formattedMessages[formattedMessages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          const content: AnthropicContent[] = Array.isArray(lastMsg.content)
            ? lastMsg.content
            : [{ type: "text", text: lastMsg.content as string }];

          for (const tc of msg.tool_calls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments || "{}"),
            });
          }
          lastMsg.content = content;
        }
      }
    }

    return { systemPrompt, formattedMessages };
  }

  private formatTools(
    tools: { function: { name: string; description: string; parameters: Record<string, unknown> } }[]
  ): AnthropicTool[] {
    return tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  async getModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
        supportsPromptCache: true,
        inputPrice: 3,
        outputPrice: 15,
        cacheWritesPrice: 3.75, // 1.25x input price
        cacheReadsPrice: 0.3,  // 0.1x input price
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        provider: "anthropic",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
        supportsPromptCache: true,
        inputPrice: 0.8,
        outputPrice: 4,
        cacheWritesPrice: 1,
        cacheReadsPrice: 0.08,
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        provider: "anthropic",
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: true,
        supportsPromptCache: true,
        inputPrice: 15,
        outputPrice: 75,
        cacheWritesPrice: 18.75,
        cacheReadsPrice: 1.5,
      },
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        provider: "anthropic",
        contextWindow: 200000,
        maxOutputTokens: 16384,
        supportsTools: true,
        supportsVision: true,
        supportsPromptCache: true,
        inputPrice: 3,
        outputPrice: 15,
        cacheWritesPrice: 3.75,
        cacheReadsPrice: 0.3,
      },
    ];
  }
}
