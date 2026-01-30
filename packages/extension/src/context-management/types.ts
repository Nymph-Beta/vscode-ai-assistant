/**
 * 上下文管理类型定义
 */

/** 消息角色 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** API 消息 */
export interface ApiMessage {
  /** 消息 ID */
  id?: string;
  /** 角色 */
  role: MessageRole;
  /** 内容 */
  content: string | null;
  /** 工具调用 */
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  /** 工具调用 ID (tool 角色时) */
  tool_call_id?: string;
  /** 压缩父消息 ID */
  condenseParent?: string;
  /** 截断父消息 ID */
  truncationParent?: string;
  /** Token 数量 */
  tokens?: number;
}

/** 文件元数据 */
export interface FileMetadata {
  /** 文件路径 */
  path: string;
  /** 最后读取时间 */
  lastRead?: number;
  /** 最后编辑时间 */
  lastEdited?: number;
  /** 操作来源 */
  source: "ai" | "user";
  /** Token 估算 */
  estimatedTokens?: number;
}

/** 上下文配置 */
export interface ContextConfig {
  /** 上下文窗口大小 (tokens) */
  contextWindow: number;
  /** 压缩阈值 (百分比) */
  condenseThreshold: number;
  /** 截断时保留的比例 */
  truncationRetainRatio: number;
  /** 是否启用压缩 */
  enableCondensation: boolean;
  /** Token 缓冲比例 */
  tokenBufferPercentage: number;
}

/** 上下文状态 */
export interface ContextState {
  /** 当前 token 数量 */
  currentTokens: number;
  /** 上下文窗口大小 */
  contextWindow: number;
  /** 使用百分比 */
  usagePercent: number;
  /** 是否接近阈值 */
  nearThreshold: boolean;
  /** 已读文件数 */
  filesRead: number;
  /** 已编辑文件数 */
  filesEdited: number;
}

/** 上下文管理结果 */
export interface ContextManagementResult {
  /** 是否执行了管理操作 */
  managed: boolean;
  /** 操作类型 */
  action?: "condensed" | "truncated" | "none";
  /** 处理前 token 数 */
  tokensBefore: number;
  /** 处理后 token 数 */
  tokensAfter: number;
  /** 处理的消息 */
  messages: ApiMessage[];
  /** 错误信息 */
  error?: string;
}

/** 截断结果 */
export interface TruncationResult {
  /** 截断后的消息 */
  messages: ApiMessage[];
  /** 截断标记 ID */
  truncationMarkerId?: string;
  /** 移除的消息数 */
  removedCount: number;
}

/** 默认配置 */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  contextWindow: 128000,
  condenseThreshold: 80,
  truncationRetainRatio: 0.5,
  enableCondensation: true,
  tokenBufferPercentage: 0.1,
};
