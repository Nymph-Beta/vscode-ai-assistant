/**
 * 目录扫描器
 * 扫描工作区中需要索引的文件
 */

import * as vscode from "vscode";
import * as path from "node:path";
import type { IndexConfig } from "../types";

/** 扫描结果 */
export interface ScanResult {
  /** 文件路径列表 */
  files: string[];
  /** 扫描的目录数 */
  directoriesScanned: number;
  /** 跳过的文件数 */
  filesSkipped: number;
  /** 扫描耗时 (ms) */
  duration: number;
}

export class DirectoryScanner {
  private config: IndexConfig;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, config: IndexConfig) {
    this.workspaceRoot = workspaceRoot;
    this.config = config;
  }

  /**
   * 扫描工作区
   */
  async scan(
    progress?: vscode.Progress<{ message?: string }>
  ): Promise<ScanResult> {
    const startTime = Date.now();
    const files: string[] = [];
    let directoriesScanned = 0;
    let filesSkipped = 0;

    progress?.report({ message: "扫描文件中..." });

    // 构建文件扩展名模式
    const extensionPattern = this.config.supportedExtensions
      .map((ext) => ext.replace(".", ""))
      .join(",");

    // 构建忽略模式
    const excludePattern = `{${this.config.ignorePatterns.join(",")}}`;

    try {
      // 使用 VS Code API 扫描文件
      const uris = await vscode.workspace.findFiles(
        `**/*.{${extensionPattern}}`,
        excludePattern,
        undefined // 不限制数量
      );

      for (const uri of uris) {
        const filePath = uri.fsPath;

        // 额外检查文件大小
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          
          // 跳过超过 1MB 的文件
          if (stat.size > 1024 * 1024) {
            filesSkipped++;
            continue;
          }

          files.push(filePath);
        } catch {
          filesSkipped++;
        }
      }

      // 统计目录数
      const directories = new Set<string>();
      for (const file of files) {
        directories.add(path.dirname(file));
      }
      directoriesScanned = directories.size;
    } catch (error) {
      console.error("Scan error:", error);
    }

    const duration = Date.now() - startTime;

    return {
      files,
      directoriesScanned,
      filesSkipped,
      duration,
    };
  }

  /**
   * 检查文件是否应该被索引
   */
  shouldIndex(filePath: string): boolean {
    // 检查扩展名
    const ext = path.extname(filePath).toLowerCase();
    if (!this.config.supportedExtensions.includes(ext)) {
      return false;
    }

    // 检查忽略模式
    const relativePath = filePath
      .replace(this.workspaceRoot, "")
      .replace(/\\/g, "/");

    for (const pattern of this.config.ignorePatterns) {
      if (this.matchGlob(relativePath, pattern)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 简单的 glob 匹配
   */
  private matchGlob(path: string, pattern: string): boolean {
    // 转换 glob 为正则表达式
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // 转义特殊字符
      .replace(/\*\*/g, "{{DOUBLE_STAR}}") // 临时替换 **
      .replace(/\*/g, "[^/]*") // * 匹配非斜杠字符
      .replace(/{{DOUBLE_STAR}}/g, ".*") // ** 匹配任意字符
      .replace(/\?/g, "."); // ? 匹配单个字符

    return new RegExp(`^${regex}$`).test(path);
  }

  /**
   * 获取目录下的文件列表（用于增量扫描）
   */
  async getFilesInDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const uri = vscode.Uri.file(dirPath);
      const entries = await vscode.workspace.fs.readDirectory(uri);

      for (const [name, type] of entries) {
        const fullPath = path.join(dirPath, name);

        if (type === vscode.FileType.File) {
          if (this.shouldIndex(fullPath)) {
            files.push(fullPath);
          }
        } else if (type === vscode.FileType.Directory) {
          // 递归扫描子目录
          const subFiles = await this.getFilesInDirectory(fullPath);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return files;
  }
}
