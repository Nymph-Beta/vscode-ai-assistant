/**
 * 代码索引系统类型定义
 */

/** 代码块类型 */
export type CodeBlockType =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "variable"
  | "enum"
  | "module"
  | "other";

/** 代码块 */
export interface CodeBlock {
  /** 文件路径 */
  filePath: string;
  /** 标识符名称 */
  identifier: string;
  /** 代码块类型 */
  type: CodeBlockType;
  /** 起始行 */
  startLine: number;
  /** 结束行 */
  endLine: number;
  /** 代码内容 */
  content: string;
  /** 内容哈希 (用于去重和变更检测) */
  hash: string;
  /** 文件哈希 */
  fileHash: string;
}

/** 向量存储点 */
export interface VectorPoint {
  /** 唯一 ID */
  id: string;
  /** 向量 */
  vector: number[];
  /** 元数据 */
  payload: {
    filePath: string;
    identifier: string;
    type: CodeBlockType;
    startLine: number;
    endLine: number;
    content: string;
    pathSegments: string[];
  };
}

/** 搜索结果 */
export interface SearchResult {
  /** 文件路径 */
  filePath: string;
  /** 相关性分数 */
  score: number;
  /** 起始行 */
  startLine: number;
  /** 结束行 */
  endLine: number;
  /** 代码片段 */
  codeChunk: string;
  /** 标识符 */
  identifier: string;
  /** 类型 */
  type: CodeBlockType;
}

/** 索引配置 */
export interface IndexConfig {
  /** 是否启用索引 */
  enabled: boolean;
  /** Embedding Provider */
  embeddingProvider: "openai" | "ollama" | "custom";
  /** Embedding 模型 */
  embeddingModel: string;
  /** API Key (OpenAI) */
  apiKey?: string;
  /** Base URL */
  baseURL?: string;
  /** 向量维度 */
  vectorDimension: number;
  /** 最小代码块字符数 */
  minBlockChars: number;
  /** 最大代码块字符数 */
  maxBlockChars: number;
  /** 搜索时的最小分数 */
  minSearchScore: number;
  /** 最大搜索结果数 */
  maxSearchResults: number;
  /** 忽略的文件模式 */
  ignorePatterns: string[];
  /** 支持的文件扩展名 */
  supportedExtensions: string[];
}

/** 索引状态 */
export interface IndexState {
  /** 是否已初始化 */
  initialized: boolean;
  /** 是否正在索引 */
  indexing: boolean;
  /** 已索引文件数 */
  indexedFiles: number;
  /** 总代码块数 */
  totalBlocks: number;
  /** 上次索引时间 */
  lastIndexTime?: number;
  /** 错误信息 */
  error?: string;
}

/** 文件缓存条目 */
export interface FileCacheEntry {
  /** 文件路径 */
  path: string;
  /** 文件哈希 */
  hash: string;
  /** 上次索引时间 */
  lastIndexed: number;
  /** 代码块 IDs */
  blockIds: string[];
}

/** Embedder 接口 */
export interface IEmbedder {
  /** 创建嵌入向量 */
  createEmbeddings(texts: string[]): Promise<number[][]>;
  /** 验证配置 */
  validateConfiguration(): Promise<boolean>;
  /** 获取向量维度 */
  getDimension(): number;
}

/** 向量存储接口 */
export interface IVectorStore {
  /** 初始化 */
  initialize(): Promise<boolean>;
  /** 插入/更新点 */
  upsertPoints(points: VectorPoint[]): Promise<void>;
  /** 搜索 */
  search(
    queryVector: number[],
    limit: number,
    directoryPrefix?: string,
    minScore?: number
  ): Promise<SearchResult[]>;
  /** 删除点 */
  deletePoints(ids: string[]): Promise<void>;
  /** 清空 */
  clear(): Promise<void>;
  /** 获取点数量 */
  getPointCount(): Promise<number>;
}

/** 代码解析器接口 */
export interface ICodeParser {
  /** 解析文件为代码块 */
  parseFile(filePath: string, content: string): Promise<CodeBlock[]>;
  /** 是否支持该文件类型 */
  supportsFile(filePath: string): boolean;
}

/** 默认配置 */
export const DEFAULT_INDEX_CONFIG: IndexConfig = {
  enabled: false,
  embeddingProvider: "openai",
  embeddingModel: "text-embedding-3-small",
  vectorDimension: 1536,
  minBlockChars: 50,
  maxBlockChars: 1000,
  minSearchScore: 0.3,
  maxSearchResults: 10,
  ignorePatterns: [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/*.min.js",
    "**/*.map",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/yarn.lock",
  ],
  supportedExtensions: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".vue",
    ".svelte",
  ],
};
