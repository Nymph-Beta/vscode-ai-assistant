/**
 * 代码索引管理器
 * 协调索引、搜索和缓存
 */

import * as vscode from "vscode";
import type {
  CodeBlock,
  ICodeParser,
  IEmbedder,
  IVectorStore,
  IndexConfig,
  IndexState,
  SearchResult,
  VectorPoint,
} from "./types";
import { DEFAULT_INDEX_CONFIG } from "./types";
import { CacheManager } from "./CacheManager";

export class CodeIndexManager {
  private static instance: CodeIndexManager | undefined;

  private config: IndexConfig;
  private state: IndexState;
  private cacheManager: CacheManager;

  private embedder: IEmbedder | undefined;
  private vectorStore: IVectorStore | undefined;
  private codeParser: ICodeParser | undefined;

  private workspaceRoot: string | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(context?: vscode.ExtensionContext) {
    this.config = this.loadConfig();
    this.state = {
      initialized: false,
      indexing: false,
      indexedFiles: 0,
      totalBlocks: 0,
    };
    this.cacheManager = new CacheManager(context);
    this.initWorkspaceRoot();
  }

  /**
   * 获取单例实例
   */
  static getInstance(context?: vscode.ExtensionContext): CodeIndexManager {
    if (!CodeIndexManager.instance) {
      CodeIndexManager.instance = new CodeIndexManager(context);
    }
    return CodeIndexManager.instance;
  }

  /**
   * 初始化工作区根目录
   */
  private initWorkspaceRoot(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.workspaceRoot = workspaceFolders[0].uri.fsPath;
    }
  }

  /**
   * 加载配置
   */
  private loadConfig(): IndexConfig {
    const config = vscode.workspace.getConfiguration("vscode-tools.codeIndex");
    return {
      ...DEFAULT_INDEX_CONFIG,
      enabled: config.get<boolean>("enabled", false),
      embeddingProvider: config.get<"openai" | "ollama" | "custom">(
        "embeddingProvider",
        "openai"
      ),
      embeddingModel: config.get<string>("embeddingModel", "text-embedding-3-small"),
      apiKey: config.get<string>("apiKey"),
      baseURL: config.get<string>("baseURL"),
      minSearchScore: config.get<number>("minSearchScore", 0.3),
      maxSearchResults: config.get<number>("maxSearchResults", 10),
    };
  }

  /**
   * 设置服务
   */
  setServices(
    embedder: IEmbedder,
    vectorStore: IVectorStore,
    codeParser: ICodeParser
  ): void {
    this.embedder = embedder;
    this.vectorStore = vectorStore;
    this.codeParser = codeParser;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<boolean> {
    if (this.state.initialized) return true;

    try {
      // 加载缓存
      await this.cacheManager.load();

      // 初始化向量存储
      if (this.vectorStore) {
        await this.vectorStore.initialize();
      }

      // 验证 embedder 配置
      if (this.embedder) {
        const valid = await this.embedder.validateConfiguration();
        if (!valid) {
          this.state.error = "Embedder 配置无效";
          return false;
        }
      }

      // 设置文件监听
      this.setupFileWatcher();

      this.state.initialized = true;
      this.state.totalBlocks = await this.vectorStore?.getPointCount() ?? 0;

      return true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /**
   * 设置文件监听器
   */
  private setupFileWatcher(): void {
    if (!this.workspaceRoot) return;

    // 监听支持的文件类型
    const pattern = `**/*{${this.config.supportedExtensions.join(",")}}`;
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.fileWatcher.onDidCreate((uri) => this.onFileChanged(uri, "create"));
    this.fileWatcher.onDidChange((uri) => this.onFileChanged(uri, "change"));
    this.fileWatcher.onDidDelete((uri) => this.onFileChanged(uri, "delete"));

    this.disposables.push(this.fileWatcher);
  }

  /**
   * 文件变化处理
   */
  private async onFileChanged(
    uri: vscode.Uri,
    type: "create" | "change" | "delete"
  ): Promise<void> {
    if (!this.config.enabled || this.state.indexing) return;

    const filePath = uri.fsPath;

    // 检查是否应该忽略
    if (this.shouldIgnore(filePath)) return;

    if (type === "delete") {
      // 删除文件的索引
      const blockIds = this.cacheManager.delete(filePath);
      if (this.vectorStore && blockIds.length > 0) {
        await this.vectorStore.deletePoints(blockIds);
      }
    } else {
      // 重新索引文件
      await this.indexFile(filePath);
    }
  }

  /**
   * 检查文件是否应该被忽略
   */
  private shouldIgnore(filePath: string): boolean {
    const relativePath = this.workspaceRoot
      ? filePath.replace(this.workspaceRoot, "").replace(/\\/g, "/")
      : filePath;

    for (const pattern of this.config.ignorePatterns) {
      // 简单的 glob 匹配
      const regex = new RegExp(
        pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".")
      );
      if (regex.test(relativePath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 索引单个文件
   */
  async indexFile(filePath: string): Promise<void> {
    if (!this.embedder || !this.vectorStore || !this.codeParser) {
      throw new Error("服务未初始化");
    }

    try {
      // 读取文件内容
      const uri = vscode.Uri.file(filePath);
      const contentBytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(contentBytes).toString("utf-8");

      // 检查是否需要重新索引
      if (!this.cacheManager.needsReindex(filePath, content)) {
        return;
      }

      // 删除旧的索引
      const oldEntry = this.cacheManager.get(filePath);
      if (oldEntry && oldEntry.blockIds.length > 0) {
        await this.vectorStore.deletePoints(oldEntry.blockIds);
      }

      // 解析代码块
      const blocks = await this.codeParser.parseFile(filePath, content);
      if (blocks.length === 0) return;

      // 生成嵌入向量
      const texts = blocks.map((b) => `${b.type} ${b.identifier}\n${b.content}`);
      const embeddings = await this.embedder.createEmbeddings(texts);

      // 创建向量点
      const points: VectorPoint[] = blocks.map((block, i) => ({
        id: `${block.hash}-${i}`,
        vector: embeddings[i],
        payload: {
          filePath: block.filePath,
          identifier: block.identifier,
          type: block.type,
          startLine: block.startLine,
          endLine: block.endLine,
          content: block.content,
          pathSegments: this.getPathSegments(block.filePath),
        },
      }));

      // 存储向量
      await this.vectorStore.upsertPoints(points);

      // 更新缓存
      const blockIds = points.map((p) => p.id);
      this.cacheManager.set(filePath, content, blockIds);

      this.state.indexedFiles = this.cacheManager.size;
      this.state.totalBlocks = await this.vectorStore.getPointCount();
    } catch (error) {
      console.error(`Failed to index file ${filePath}:`, error);
    }
  }

  /**
   * 获取路径段
   */
  private getPathSegments(filePath: string): string[] {
    const relativePath = this.workspaceRoot
      ? filePath.replace(this.workspaceRoot, "").replace(/\\/g, "/")
      : filePath;
    return relativePath.split("/").filter(Boolean);
  }

  /**
   * 索引整个工作区
   */
  async indexWorkspace(
    progress?: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<void> {
    if (!this.workspaceRoot) {
      throw new Error("未找到工作区");
    }

    if (!this.embedder || !this.vectorStore || !this.codeParser) {
      throw new Error("服务未初始化");
    }

    if (this.state.indexing) {
      throw new Error("正在索引中");
    }

    this.state.indexing = true;
    this.state.error = undefined;

    try {
      // 收集文件
      const files = await this.collectFiles();
      const total = files.length;
      let indexed = 0;

      progress?.report({ message: `找到 ${total} 个文件` });

      // 批量索引
      for (const filePath of files) {
        await this.indexFile(filePath);
        indexed++;

        if (progress) {
          const percent = Math.round((indexed / total) * 100);
          progress.report({
            message: `索引中 (${indexed}/${total})`,
            increment: 100 / total,
          });
        }
      }

      // 保存缓存
      await this.cacheManager.save();

      this.state.lastIndexTime = Date.now();
    } finally {
      this.state.indexing = false;
    }
  }

  /**
   * 收集工作区文件
   */
  private async collectFiles(): Promise<string[]> {
    if (!this.workspaceRoot) return [];

    const files: string[] = [];
    const pattern = `**/*{${this.config.supportedExtensions.join(",")}}`;

    const uris = await vscode.workspace.findFiles(
      pattern,
      `{${this.config.ignorePatterns.join(",")}}`
    );

    for (const uri of uris) {
      files.push(uri.fsPath);
    }

    return files;
  }

  /**
   * 搜索索引
   */
  async search(
    query: string,
    directoryPrefix?: string
  ): Promise<SearchResult[]> {
    if (!this.embedder || !this.vectorStore) {
      throw new Error("服务未初始化");
    }

    // 生成查询向量
    const [queryVector] = await this.embedder.createEmbeddings([query]);

    // 搜索
    const results = await this.vectorStore.search(
      queryVector,
      this.config.maxSearchResults,
      directoryPrefix,
      this.config.minSearchScore
    );

    return results;
  }

  /**
   * 获取状态
   */
  getState(): IndexState {
    return { ...this.state };
  }

  /**
   * 获取配置
   */
  getConfig(): IndexConfig {
    return { ...this.config };
  }

  /**
   * 刷新配置
   */
  refreshConfig(): void {
    this.config = this.loadConfig();
  }

  /**
   * 清空索引
   */
  async clearIndex(): Promise<void> {
    if (this.vectorStore) {
      await this.vectorStore.clear();
    }
    this.cacheManager.clear();
    await this.cacheManager.save();

    this.state.indexedFiles = 0;
    this.state.totalBlocks = 0;
    this.state.lastIndexTime = undefined;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    CodeIndexManager.instance = undefined;
  }
}
