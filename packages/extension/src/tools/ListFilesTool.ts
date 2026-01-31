/**
 * 列出文件工具
 * 允许 AI 浏览工作区的目录结构
 */

import * as vscode from "vscode";
import * as path from "node:path";
import { BaseTool, type ToolInput, type ToolInputSchema, type ToolResult } from "./BaseTool";

export interface ListFilesInput extends ToolInput {
  /** 目录路径（相对于工作区根目录或绝对路径） */
  path: string;
  /** 是否递归列出子目录内容 */
  recursive?: boolean;
  /** 最大深度（仅在 recursive 为 true 时有效） */
  max_depth?: number;
  /** 最大条目数（防止输出过长） */
  max_entries?: number;
}

interface FileEntry {
  name: string;
  type: "file" | "directory";
  relativePath: string;
}

export class ListFilesTool extends BaseTool<ListFilesInput> {
  readonly name = "list_files";
  readonly description =
    "列出指定目录中的文件和子目录。可以选择递归列出所有子目录的内容。返回结果会区分文件和目录（目录名后带 /）。";

  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "要列出内容的目录路径，可以是相对于工作区的相对路径或绝对路径。使用 '.' 表示工作区根目录",
      },
      recursive: {
        type: "boolean",
        description: "是否递归列出子目录内容，默认为 false",
      },
      max_depth: {
        type: "number",
        description: "递归的最大深度，默认为 3。仅在 recursive 为 true 时有效",
      },
      max_entries: {
        type: "number",
        description: "最大返回条目数，默认为 200。超过此数量会被截断，建议对大型项目使用较小值或分目录查看",
      },
    },
    required: ["path"],
  };

  // 默认最大条目数
  private readonly defaultMaxEntries = 200;

  // 要忽略的目录和文件
  private readonly ignorePatterns = [
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    ".coverage",
    ".tox",
    ".venv",
    "venv",
    "env",
    ".DS_Store",
    "Thumbs.db",
  ];

  async execute(input: ListFilesInput): Promise<ToolResult> {
    try {
      const dirPath = this.resolvePath(input.path);
      if (!dirPath) {
        return this.failure("无法解析目录路径：未找到工作区");
      }

      // 检查目录是否存在
      const uri = vscode.Uri.file(dirPath);
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.Directory) {
          return this.failure(`路径不是目录: ${input.path}`);
        }
      } catch {
        return this.failure(`目录不存在: ${input.path}`);
      }

      const recursive = input.recursive ?? false;
      const maxDepth = input.max_depth ?? 3;
      const maxEntries = input.max_entries ?? this.defaultMaxEntries;

      // 收集文件列表
      const entries: FileEntry[] = [];
      await this.listDirectory(dirPath, dirPath, entries, recursive, maxDepth, 0);

      // 排序：目录在前，文件在后，按名称排序
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.relativePath.localeCompare(b.relativePath);
      });

      const totalCount = entries.length;
      const isTruncated = totalCount > maxEntries;
      
      // 如果超出限制，截断结果
      const displayEntries = isTruncated ? entries.slice(0, maxEntries) : entries;

      // 格式化输出
      const lines = displayEntries.map((entry) => {
        const suffix = entry.type === "directory" ? "/" : "";
        return entry.relativePath + suffix;
      });

      let header = `目录: ${input.path}\n` +
        `递归: ${recursive ? `是 (最大深度: ${maxDepth})` : "否"}\n` +
        `共 ${totalCount} 项`;
      
      if (isTruncated) {
        header += ` (显示前 ${maxEntries} 项，省略 ${totalCount - maxEntries} 项)`;
      }
      header += `\n${"─".repeat(50)}\n`;

      if (entries.length === 0) {
        return this.success(`${header}(空目录)`);
      }

      let result = `${header}${lines.join("\n")}`;
      
      // 如果被截断，添加提示
      if (isTruncated) {
        result += `\n\n[注意: 结果已截断。如需查看完整列表，请分目录查询或增加 max_entries 参数]`;
      }

      return this.success(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failure(`列出目录失败: ${errorMessage}`);
    }
  }

  /**
   * 递归列出目录内容
   */
  private async listDirectory(
    rootPath: string,
    currentPath: string,
    entries: FileEntry[],
    recursive: boolean,
    maxDepth: number,
    currentDepth: number
  ): Promise<void> {
    if (recursive && currentDepth > maxDepth) {
      return;
    }

    const uri = vscode.Uri.file(currentPath);
    const items = await vscode.workspace.fs.readDirectory(uri);

    for (const [name, type] of items) {
      // 跳过忽略的文件/目录
      if (this.shouldIgnore(name)) {
        continue;
      }

      const fullPath = path.join(currentPath, name);
      const relativePath = path.relative(rootPath, fullPath);

      if (type === vscode.FileType.Directory) {
        entries.push({
          name,
          type: "directory",
          relativePath,
        });

        // 递归处理子目录
        if (recursive) {
          await this.listDirectory(
            rootPath,
            fullPath,
            entries,
            recursive,
            maxDepth,
            currentDepth + 1
          );
        }
      } else if (type === vscode.FileType.File) {
        entries.push({
          name,
          type: "file",
          relativePath,
        });
      }
    }
  }

  /**
   * 检查是否应该忽略此文件/目录
   */
  private shouldIgnore(name: string): boolean {
    return this.ignorePatterns.includes(name) || name.startsWith(".");
  }

  /**
   * 解析目录路径
   */
  private resolvePath(inputPath: string): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // 处理 '.' 表示工作区根目录
    if (inputPath === "." || inputPath === "") {
      return workspaceRoot;
    }

    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }

    return path.join(workspaceRoot, inputPath);
  }
}
