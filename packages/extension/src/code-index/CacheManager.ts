/**
 * 文件缓存管理器
 * 用于跟踪文件变化，支持增量索引
 */

import * as vscode from "vscode";
import * as crypto from "node:crypto";
import type { FileCacheEntry } from "./types";

export class CacheManager {
  private cache = new Map<string, FileCacheEntry>();
  private storageUri: vscode.Uri | undefined;
  private dirty = false;

  constructor(context?: vscode.ExtensionContext) {
    if (context) {
      this.storageUri = vscode.Uri.joinPath(
        context.globalStorageUri,
        "code-index-cache.json"
      );
    }
  }

  /**
   * 加载缓存
   */
  async load(): Promise<void> {
    if (!this.storageUri) return;

    try {
      const content = await vscode.workspace.fs.readFile(this.storageUri);
      const data = JSON.parse(Buffer.from(content).toString("utf-8"));
      this.cache = new Map(Object.entries(data));
    } catch {
      // 缓存文件不存在或解析失败，使用空缓存
      this.cache = new Map();
    }
  }

  /**
   * 保存缓存
   */
  async save(): Promise<void> {
    if (!this.storageUri || !this.dirty) return;

    try {
      const dir = vscode.Uri.joinPath(this.storageUri, "..");
      await vscode.workspace.fs.createDirectory(dir);

      const data = Object.fromEntries(this.cache);
      const content = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
      await vscode.workspace.fs.writeFile(this.storageUri, content);
      this.dirty = false;
    } catch (error) {
      console.error("Failed to save cache:", error);
    }
  }

  /**
   * 计算文件内容哈希
   */
  computeHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  /**
   * 检查文件是否需要重新索引
   */
  needsReindex(filePath: string, content: string): boolean {
    const entry = this.cache.get(filePath);
    if (!entry) return true;

    const currentHash = this.computeHash(content);
    return entry.hash !== currentHash;
  }

  /**
   * 获取文件缓存条目
   */
  get(filePath: string): FileCacheEntry | undefined {
    return this.cache.get(filePath);
  }

  /**
   * 更新文件缓存条目
   */
  set(filePath: string, content: string, blockIds: string[]): void {
    this.cache.set(filePath, {
      path: filePath,
      hash: this.computeHash(content),
      lastIndexed: Date.now(),
      blockIds,
    });
    this.dirty = true;
  }

  /**
   * 删除文件缓存条目
   */
  delete(filePath: string): string[] {
    const entry = this.cache.get(filePath);
    const blockIds = entry?.blockIds || [];
    this.cache.delete(filePath);
    this.dirty = true;
    return blockIds;
  }

  /**
   * 获取所有缓存的文件路径
   */
  getAllPaths(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取所有代码块 IDs
   */
  getAllBlockIds(): string[] {
    const ids: string[] = [];
    for (const entry of this.cache.values()) {
      ids.push(...entry.blockIds);
    }
    return ids;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.dirty = true;
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }
}
