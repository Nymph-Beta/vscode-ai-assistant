import * as vscode from 'vscode';
import type { ToolRegistry, OpenAIToolDefinition, ToolResult } from './tools';

// ============ 类型定义 ============

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ============ 流式 API 类型 ============

/** 流式响应的 chunk 类型 */
export type ApiStreamChunk =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_call_delta'; index: number; id?: string; name?: string; arguments?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

/** 流式响应的 Generator 类型 */
export type ApiStream = AsyncGenerator<ApiStreamChunk, void, unknown>;

/** SSE delta 数据结构 */
export interface SSEDelta {
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

export interface AiServiceConfig {
  provider: 'openai' | 'local' | 'custom';
  apiKey: string;
  baseURL: string;
  model: string;
  thinkTag: boolean;
}

/** 流式响应中的工具调用累积器 */
interface ToolCallAccumulator {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ============ AI 服务类 ============

export class AiService {
  private controller?: AbortController;
  private config: AiServiceConfig;
  private toolRegistry?: ToolRegistry;

  constructor(config?: AiServiceConfig) {
    this.config = config ?? this.loadConfig();
  }

  /** 设置工具注册表 */
  public setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  /** 从 VSCode 加载配置 */
  private loadConfig(): AiServiceConfig {
    const config = vscode.workspace.getConfiguration('vscode-tools.ai');
    return {
      provider: config.get<"openai" | "local" | "custom">("provider", "openai"),
      apiKey: config.get<string>("apiKey", ""),
      baseURL: config.get<string>("baseURL", "https://api.openai.com/v1"),
      model: config.get<string>("model", "gpt-4o-mini"),
      thinkTag: config.get<boolean>("thinkTag", false),
    };
  }

  /** 刷新配置 */
  public refreshConfig(): void {
    this.config = this.loadConfig();
  }

  /** 获取当前配置 */
  public getConfig(): AiServiceConfig {
    return this.config;
  }

  /** 获取工具注册表 */
  public getToolRegistry(): ToolRegistry | undefined {
    return this.toolRegistry;
  }

  /**
   * 创建消息流 (Generator 模式)
   * 逐块 yield ApiStreamChunk，实现真正的流式输出
   */
  public async *createMessage(
    messages: ChatMessage[],
    options?: {
      tools?: OpenAIToolDefinition[];
      allowedTools?: string[];
    }
  ): ApiStream {
    const { apiKey, baseURL, model } = this.config;

    console.log("========== AI createMessage 开始 ==========");
    console.log("API URL:", `${baseURL}/chat/completions`);
    console.log("Model:", model);

    if (!apiKey) {
      throw new Error("请先配置 API Key: 设置 → vscode-tools.ai.apiKey");
    }

    this.controller = new AbortController();

    // 获取工具定义
    let tools: OpenAIToolDefinition[] | undefined;
    if (options?.tools) {
      tools = options.tools;
    } else if (this.toolRegistry && this.toolRegistry.size > 0) {
      tools = this.toolRegistry.getToolDefinitions(options?.allowedTools);
    }

    const response = await this.sendRequest(baseURL, apiKey, model, messages, tools);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 错误 (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法读取响应流");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

    console.log("SSE 流已打开，开始 yield chunks...");

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("SSE 流结束");
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        console.log("SSE 行:", line);  // 添加这行
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        // 解析并 yield chunks
        const chunks = this.parseSSEToChunks(data, toolCallAccumulators);
        console.log("解析得到", chunks.length, "个 chunks");
        for (const chunk of chunks) {
          console.log("Yielding chunk:", chunk.type);
          yield chunk;
        }
      }
    }

    // 处理完成的工具调用
    for (const acc of toolCallAccumulators.values()) {
      if (acc.id && acc.function.name) {
        yield {
          type: 'tool_call',
          toolCall: {
            id: acc.id,
            type: 'function',
            function: {
              name: acc.function.name,
              arguments: acc.function.arguments,
            },
          },
        };
      }
    }

    console.log("========== AI createMessage 结束 ==========");
  }

  /**
   * 解析 SSE 数据为 chunks
   */
  private parseSSEToChunks(
    data: string,
    toolCallAccumulators: Map<number, ToolCallAccumulator>
  ): ApiStreamChunk[] {
    const chunks: ApiStreamChunk[] = [];

    try {
      console.log("原始 SSE 数据:", data);  // 添加这行
      const json = JSON.parse(data);
      console.log("解析后的 JSON:", JSON.stringify(json, null, 2));  // 添加这行
      const delta: SSEDelta = json.choices?.[0]?.delta;
      console.log("Delta 内容:", delta);  // 添加这行
      const usage = json.usage;

      if (!delta && !usage) return chunks;

      // 处理 reasoning/reasoning_content (思考内容)
      const reasoningContent = delta?.reasoning_content || delta?.reasoning;
      if (reasoningContent) {
        console.log("添加 reasoning chunk:", reasoningContent);
        chunks.push({ type: 'reasoning', content: reasoningContent });
      }

      // 处理 content (回答内容)
      if (delta?.content) {
        console.log("添加 text chunk:", delta.content);
        chunks.push({ type: 'text', content: delta.content });
      }

      // 处理 tool_calls (工具调用增量)
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index;

          if (!toolCallAccumulators.has(index)) {
            // 新的工具调用
            toolCallAccumulators.set(index, {
              id: tc.id || "",
              type: "function",
              function: {
                name: tc.function?.name || "",
                arguments: tc.function?.arguments || "",
              },
            });
          } else {
            // 累积工具调用参数
            const acc = toolCallAccumulators.get(index);
            if (acc) {
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.function.name += tc.function.name;
              if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
            }
          }

          // yield 工具调用增量
          chunks.push({
            type: 'tool_call_delta',
            index: tc.index,
            id: tc.id,
            name: tc.function?.name,
            arguments: tc.function?.arguments,
          });
        }
      }

      // 处理 usage (token 使用量)
      if (usage) {
        chunks.push({
          type: 'usage',
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        });
      }

      return chunks;
    } catch (error) {
      console.warn("JSON parse error:", data, error);
      return chunks;
    }
  }

  /** 发送 API 请求 */
  private sendRequest(
    baseURL: string,
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    tools?: OpenAIToolDefinition[]
  ): Promise<Response> {
    const startTime = Date.now();

    const timeoutId = setTimeout(() => {
      console.warn("请求已超过 10 秒，仍在等待响应...");
    }, 10000);

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
    };

    // 添加工具定义
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    return fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: this.controller?.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
      console.log(`请求耗时: ${Date.now() - startTime}ms`);
    });
  }

  /** 取消当前请求 */
  public abort(): void {
    if (this.controller) {
      this.controller.abort();
      this.controller = undefined;
    }
  }
}

// ============ 单例导出 ============

export const aiService = new AiService();
