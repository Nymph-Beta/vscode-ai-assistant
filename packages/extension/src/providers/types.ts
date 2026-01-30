/**
 * AI Provider 类型定义
 */

import type { OpenAIToolDefinition } from "../tools";

/** 支持的 Provider 类型 */
export type ProviderType =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "openrouter"
  | "custom";

/** Provider 配置 */
export interface ProviderConfig {
  /** Provider 类型 */
  type: ProviderType;
  /** API Key */
  apiKey: string;
  /** API Base URL */
  baseURL?: string;
  /** 模型名称 */
  model: string;
  /** 额外配置 */
  options?: Record<string, unknown>;
}

/** 聊天消息 */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | MessageContent[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** 消息内容（支持多模态） */
export interface MessageContent {
  type: "text" | "image_url" | "image";
  text?: string;
  image_url?: {
    url: string;
    detail?: "low" | "high" | "auto";
  };
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/** 流式响应 Chunk 类型 */
export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; arguments?: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; cacheWriteTokens?: number; cacheReadTokens?: number; totalCost?: number }
  | { type: "error"; error: string };

/** 流式响应 Generator */
export type StreamResponse = AsyncGenerator<StreamChunk, void, unknown>;

/** 创建消息选项 */
export interface CreateMessageOptions {
  /** 工具定义列表 */
  tools?: OpenAIToolDefinition[];
  /** 允许的工具名称列表 */
  allowedTools?: string[];
  /** 最大 tokens */
  maxTokens?: number;
  /** 温度 */
  temperature?: number;
  /** 取消信号 */
  signal?: AbortSignal;
}

/** 模型信息 */
export interface ModelInfo {
  /** 模型 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** Provider */
  provider: ProviderType;
  /** 上下文窗口大小 */
  contextWindow: number;
  /** 最大输出 tokens */
  maxOutputTokens?: number;
  /** 是否支持工具 */
  supportsTools: boolean;
  /** 是否支持视觉 */
  supportsVision: boolean;
  /** 是否支持推理 */
  supportsReasoning?: boolean;
  /** 是否支持提示缓存 */
  supportsPromptCache?: boolean;
  /** 输入价格 ($/1M tokens) */
  inputPrice?: number;
  /** 输出价格 ($/1M tokens) */
  outputPrice?: number;
  /** 缓存写入价格 ($/1M tokens) */
  cacheWritesPrice?: number;
  /** 缓存读取价格 ($/1M tokens) */
  cacheReadsPrice?: number;
}

/** Provider 接口 */
export interface AIProvider {
  /** Provider 类型 */
  readonly type: ProviderType;
  /** Provider 名称 */
  readonly name: string;

  /** 创建消息流 */
  createMessage(
    messages: ChatMessage[],
    options?: CreateMessageOptions
  ): StreamResponse;

  /** 获取可用模型列表 */
  getModels(): Promise<ModelInfo[]>;

  /** 测试连接 */
  testConnection(): Promise<boolean>;

  /** 取消请求 */
  abort(): void;
}
