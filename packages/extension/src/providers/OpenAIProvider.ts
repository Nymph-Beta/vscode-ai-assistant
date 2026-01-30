/**
 * OpenAI Provider
 * 支持 OpenAI 及兼容 API (如 DeepSeek, OpenRouter 等)
 */

import { BaseProvider } from "./BaseProvider";
import type {
  ChatMessage,
  CreateMessageOptions,
  ModelInfo,
  ProviderConfig,
  ProviderType,
  StreamChunk,
  StreamResponse,
  ToolCall,
} from "./types";

/** OpenAI SSE Delta */
interface OpenAIDelta {
  content?: string;
  reasoning?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

/** 工具调用累积器 */
interface ToolCallAccumulator {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export class OpenAIProvider extends BaseProvider {
  readonly type: ProviderType = "openai";
  readonly name = "OpenAI";

  private defaultBaseURL = "https://api.openai.com/v1";

  constructor(config: ProviderConfig) {
    super(config);
    if (!config.baseURL) {
      this.config.baseURL = this.defaultBaseURL;
    }
  }

  async *createMessage(
    messages: ChatMessage[],
    options?: CreateMessageOptions
  ): StreamResponse {
    this.createController(options?.signal);

    const url = `${this.config.baseURL}/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.formatMessages(messages),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = "auto";
    }

    if (options?.maxTokens) {
      body.max_tokens = options.maxTokens;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
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

    const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

    for await (const data of this.parseSSEStream(reader)) {
      const chunks = this.parseSSEData(data, toolCallAccumulators);
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    // 处理完成的工具调用
    for (const acc of toolCallAccumulators.values()) {
      if (acc.id && acc.function.name) {
        yield {
          type: "tool_call",
          toolCall: {
            id: acc.id,
            type: "function",
            function: {
              name: acc.function.name,
              arguments: acc.function.arguments,
            },
          },
        };
      }
    }
  }

  private parseSSEData(
    data: string,
    toolCallAccumulators: Map<number, ToolCallAccumulator>
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    try {
      const json = JSON.parse(data);
      const delta: OpenAIDelta = json.choices?.[0]?.delta;
      const usage = json.usage;

      if (!delta && !usage) return chunks;

      // 处理 reasoning/reasoning_content
      const reasoningContent = delta?.reasoning_content || delta?.reasoning;
      if (reasoningContent) {
        chunks.push({ type: "reasoning", content: reasoningContent });
      }

      // 处理 content
      if (delta?.content) {
        chunks.push({ type: "text", content: delta.content });
      }

      // 处理 tool_calls
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index;

          if (!toolCallAccumulators.has(index)) {
            toolCallAccumulators.set(index, {
              id: tc.id || "",
              type: "function",
              function: {
                name: tc.function?.name || "",
                arguments: tc.function?.arguments || "",
              },
            });
          } else {
            const acc = toolCallAccumulators.get(index);
            if (acc) {
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.function.name += tc.function.name;
              if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
            }
          }

          chunks.push({
            type: "tool_call_delta",
            index: tc.index,
            id: tc.id,
            name: tc.function?.name,
            arguments: tc.function?.arguments,
          });
        }
      }

      // 处理 usage
      if (usage) {
        chunks.push({
          type: "usage",
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        });
      }

      return chunks;
    } catch {
      return chunks;
    }
  }

  private formatMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((msg) => {
      // 确保 content 格式正确
      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((c) => {
            if (c.type === "image" && c.source) {
              // 转换 Anthropic 格式到 OpenAI 格式
              return {
                type: "image_url" as const,
                image_url: {
                  url: `data:${c.source.media_type};base64,${c.source.data}`,
                },
              };
            }
            return c;
          }),
        };
      }
      return msg;
    });
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.fetch(`${this.config.baseURL}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        return this.getDefaultModels();
      }

      const data = await response.json();
      return data.data.map((m: { id: string }) => ({
        id: m.id,
        name: m.id,
        provider: "openai" as ProviderType,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: m.id.includes("vision") || m.id.includes("gpt-4"),
      }));
    } catch {
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ModelInfo[] {
    return [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsTools: true,
        supportsVision: true,
        inputPrice: 2.5,
        outputPrice: 10,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "openai",
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsTools: true,
        supportsVision: true,
        inputPrice: 0.15,
        outputPrice: 0.6,
      },
      {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        provider: "openai",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: true,
        inputPrice: 10,
        outputPrice: 30,
      },
    ];
  }
}
