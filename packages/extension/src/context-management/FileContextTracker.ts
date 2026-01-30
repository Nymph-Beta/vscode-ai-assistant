/**
 * 文件上下文追踪器
 * 追踪读取和编辑的文件
 */

import * as vscode from "vscode";
import type { FileMetadata } from "./types";

export class FileContextTracker {
  private files = new Map<string, FileMetadata>();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.setupWatchers();
  }

  /**
   * 设置文件监听器
   */
  private setupWatchers(): void {
    // 监听文件保存
    const saveWatcher = vscode.workspace.onDidSaveTextDocument((doc) => {
      const existing = this.files.get(doc.uri.fsPath);
      if (existing) {
        // 如果文件是我们正在追踪的，更新为用户编辑
        existing.lastEdited = Date.now();
        existing.source = "user";
      }
    });

    this.disposables.push(saveWatcher);
  }

  /**
   * 记录文件读取
   */
  trackRead(filePath: string, source: "ai" | "user" = "ai"): void {
    const existing = this.files.get(filePath);
    if (existing) {
      existing.lastRead = Date.now();
    } else {
      this.files.set(filePath, {
        path: filePath,
        lastRead: Date.now(),
        source,
      });
    }
  }

  /**
   * 记录文件编辑
   */
  trackEdit(filePath: string, source: "ai" | "user" = "ai"): void {
    const existing = this.files.get(filePath);
    if (existing) {
      existing.lastEdited = Date.now();
      existing.source = source;
    } else {
      this.files.set(filePath, {
        path: filePath,
        lastEdited: Date.now(),
        source,
      });
    }
  }

  /**
   * 获取文件元数据
   */
  getFile(filePath: string): FileMetadata | undefined {
    return this.files.get(filePath);
  }

  /**
   * 获取所有追踪的文件
   */
  getAllFiles(): FileMetadata[] {
    return Array.from(this.files.values());
  }

  /**
   * 获取 AI 读取的文件
   */
  getFilesReadByAI(sinceTimestamp?: number): string[] {
    const result: string[] = [];
    for (const file of this.files.values()) {
      if (file.source === "ai" && file.lastRead) {
        if (!sinceTimestamp || file.lastRead >= sinceTimestamp) {
          result.push(file.path);
        }
      }
    }
    return result;
  }

  /**
   * 获取 AI 编辑的文件
   */
  getFilesEditedByAI(sinceTimestamp?: number): string[] {
    const result: string[] = [];
    for (const file of this.files.values()) {
      if (file.source === "ai" && file.lastEdited) {
        if (!sinceTimestamp || file.lastEdited >= sinceTimestamp) {
          result.push(file.path);
        }
      }
    }
    return result;
  }

  /**
   * 获取最近访问的文件
   */
  getRecentFiles(limit = 10): FileMetadata[] {
    const files = Array.from(this.files.values());
    files.sort((a, b) => {
      const aTime = Math.max(a.lastRead || 0, a.lastEdited || 0);
      const bTime = Math.max(b.lastRead || 0, b.lastEdited || 0);
      return bTime - aTime;
    });
    return files.slice(0, limit);
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalFiles: number; readCount: number; editedCount: number } {
    let readCount = 0;
    let editedCount = 0;

    for (const file of this.files.values()) {
      if (file.lastRead) readCount++;
      if (file.lastEdited) editedCount++;
    }

    return {
      totalFiles: this.files.size,
      readCount,
      editedCount,
    };
  }

  /**
   * 清除追踪
   */
  clear(): void {
    this.files.clear();
  }

  /**
   * 清理资源
   */
  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
