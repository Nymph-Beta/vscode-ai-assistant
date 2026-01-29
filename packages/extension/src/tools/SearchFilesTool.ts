/**
 * 搜索文件工具
 * 允许 AI 在工作区中搜索文件内容
 */

import * as vscode from "vscode";
import * as path from "node:path";
import { BaseTool, type ToolInput, type ToolInputSchema, type ToolResult } from "./BaseTool";

export interface SearchFilesInput extends ToolInput {
  /** 搜索模式（正则表达式或纯文本） */
  pattern: string;
  /** 搜索的目录路径（相对于工作区根目录或绝对路径） */
  path?: string;
  /** 文件名匹配模式（glob 格式，如 "*.ts"） */
  file_pattern?: string;
  /** 是否使用正则表达式 */
  regex?: boolean;
  /** 是否区分大小写 */
  case_sensitive?: boolean;
  /** 最大结果数量 */
  max_results?: number;
}

interface SearchMatch {
  file: string;
  line: number;
  column: number;
  content: string;
}

export class SearchFilesTool extends BaseTool<SearchFilesInput> {
  readonly name = "search_files";
  readonly description =
    "在工作区文件中搜索指定的文本或正则表达式模式。返回匹配的文件路径、行号和匹配内容。";

  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "要搜索的文本或正则表达式模式",
      },
      path: {
        type: "string",
        description: "限制搜索的目录路径，不指定则搜索整个工作区",
      },
      file_pattern: {
        type: "string",
        description: "文件名匹配模式（glob 格式），如 '*.ts' 或 '**/*.vue'",
      },
      regex: {
        type: "boolean",
        description: "是否将 pattern 作为正则表达式，默认为 false（纯文本搜索）",
      },
      case_sensitive: {
        type: "boolean",
        description: "是否区分大小写，默认为 false",
      },
      max_results: {
        type: "number",
        description: "最大结果数量，默认为 100",
      },
    },
    required: ["pattern"],
  };

  // 要忽略的目录
  private readonly ignoreDirs = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
  ];

  // 支持搜索的文件扩展名
  private readonly searchableExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".vue",
    ".svelte",
    ".html",
    ".css",
    ".scss",
    ".less",
    ".json",
    ".md",
    ".txt",
    ".yaml",
    ".yml",
    ".xml",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".sh",
    ".bash",
    ".zsh",
    ".sql",
    ".graphql",
    ".prisma",
  ];

  async execute(input: SearchFilesInput): Promise<ToolResult> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return this.failure("未找到工作区");
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const searchPath = input.path
        ? path.isAbsolute(input.path)
          ? input.path
          : path.join(workspaceRoot, input.path)
        : workspaceRoot;

      // 构建搜索正则表达式
      let searchRegex: RegExp;
      try {
        const flags = input.case_sensitive ? "g" : "gi";
        if (input.regex) {
          searchRegex = new RegExp(input.pattern, flags);
        } else {
          // 转义特殊字符用于纯文本搜索
          const escaped = input.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          searchRegex = new RegExp(escaped, flags);
        }
      } catch (error) {
        return this.failure(`无效的搜索模式: ${error instanceof Error ? error.message : String(error)}`);
      }

      const maxResults = input.max_results ?? 100;
      const matches: SearchMatch[] = [];

      // 收集要搜索的文件
      const files = await this.collectFiles(searchPath, input.file_pattern);

      // 搜索每个文件
      for (const file of files) {
        if (matches.length >= maxResults) {
          break;
        }

        const fileMatches = await this.searchInFile(file, searchRegex, workspaceRoot);
        for (const match of fileMatches) {
          if (matches.length >= maxResults) {
            break;
          }
          matches.push(match);
        }
      }

      // 格式化输出
      if (matches.length === 0) {
        return this.success(`未找到匹配项: "${input.pattern}"`);
      }

      const header =
        `搜索: "${input.pattern}"\n` +
        `路径: ${input.path || "."}\n` +
        `找到 ${matches.length} 个匹配${matches.length >= maxResults ? ` (已达到上限 ${maxResults})` : ""}\n` +
        `${"─".repeat(50)}\n`;

      // 按文件分组输出
      const groupedMatches = new Map<string, SearchMatch[]>();
      for (const match of matches) {
        const existing = groupedMatches.get(match.file) || [];
        existing.push(match);
        groupedMatches.set(match.file, existing);
      }

      const lines: string[] = [];
      for (const [file, fileMatches] of groupedMatches) {
        lines.push(`\n📄 ${file}`);
        for (const match of fileMatches) {
          const lineNum = match.line.toString().padStart(4, " ");
          const preview = match.content.length > 100
            ? `${match.content.substring(0, 100)}...`
            : match.content;
          lines.push(`  ${lineNum}: ${preview}`);
        }
      }

      return this.success(header + lines.join("\n"));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failure(`搜索失败: ${errorMessage}`);
    }
  }

  /**
   * 收集要搜索的文件列表
   */
  private async collectFiles(searchPath: string, filePattern?: string): Promise<string[]> {
    const files: string[] = [];
    await this.walkDirectory(searchPath, files, filePattern);
    return files;
  }

  /**
   * 递归遍历目录
   */
  private async walkDirectory(
    dirPath: string,
    files: string[],
    filePattern?: string,
    depth = 0
  ): Promise<void> {
    // 限制递归深度
    if (depth > 10) {
      return;
    }

    try {
      const uri = vscode.Uri.file(dirPath);
      const entries = await vscode.workspace.fs.readDirectory(uri);

      for (const [name, type] of entries) {
        const fullPath = path.join(dirPath, name);

        if (type === vscode.FileType.Directory) {
          // 跳过忽略的目录
          if (this.ignoreDirs.includes(name) || name.startsWith(".")) {
            continue;
          }
          await this.walkDirectory(fullPath, files, filePattern, depth + 1);
        } else if (type === vscode.FileType.File) {
          // 检查文件扩展名
          const ext = path.extname(name).toLowerCase();
          if (!this.searchableExtensions.includes(ext)) {
            continue;
          }

          // 检查文件名模式
          if (filePattern) {
            const pattern = this.globToRegex(filePattern);
            if (!pattern.test(name)) {
              continue;
            }
          }

          files.push(fullPath);
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  /**
   * 在单个文件中搜索
   */
  private async searchInFile(
    filePath: string,
    pattern: RegExp,
    workspaceRoot: string
  ): Promise<SearchMatch[]> {
    const matches: SearchMatch[] = [];

    try {
      const uri = vscode.Uri.file(filePath);
      const contentBytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(contentBytes).toString("utf-8");

      const lines = content.split(/\r?\n/);
      const relativePath = path.relative(workspaceRoot, filePath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 重置正则表达式状态
        pattern.lastIndex = 0;

        const match = pattern.exec(line);
        if (match) {
          matches.push({
            file: relativePath,
            line: i + 1,
            column: match.index + 1,
            content: line.trim(),
          });
        }
      }
    } catch {
      // 忽略无法读取的文件
    }

    return matches;
  }

  /**
   * 简单的 glob 转正则表达式
   */
  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`, "i");
  }
}
