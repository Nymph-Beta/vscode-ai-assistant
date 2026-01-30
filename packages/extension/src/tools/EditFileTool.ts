/**
 * 编辑文件工具
 * 通过搜索替换的方式修改文件内容
 * 基于 Roo-Code 的多策略匹配实现
 */

import * as vscode from "vscode";
import * as path from "node:path";
import { BaseTool, type ToolInput, type ToolInputSchema, type ToolResult } from "./BaseTool";

export interface EditFileInput extends ToolInput {
  /** 文件路径（相对于工作区根目录或绝对路径） */
  path: string;
  /** 要搜索的内容（将被替换） */
  old_string: string;
  /** 替换后的新内容 */
  new_string: string;
  /** 是否使用正则表达式模式 */
  regex?: boolean;
  /** 期望的替换次数（默认为 1） */
  expected_replacements?: number;
}

/** 错误追踪器 */
interface ErrorTracker {
  consecutiveMistakeCount: Map<string, number>;
}

/** 转义正则表达式特殊字符 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 计算字符串出现次数 */
function countOccurrences(content: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let pos = 0;
  let index = content.indexOf(search, pos);
  while (index !== -1) {
    count++;
    pos = index + search.length;
    index = content.indexOf(search, pos);
  }
  return count;
}

/** 计算正则匹配次数 */
function countRegexMatches(content: string, regex: RegExp): number {
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

/** 安全的字面量替换 (处理 $ 符号) */
function safeLiteralReplace(content: string, search: string, replacement: string): string {
  // 转义 replacement 中的 $ 符号，避免正则替换问题
  const safeReplacement = replacement.replace(/\$/g, "$$$$");
  return content.split(search).join(safeReplacement);
}

/**
 * 构建空白符容忍的正则表达式
 * 基于 Roo-Code 的实现
 */
function buildWhitespaceTolerantRegex(oldString: string): RegExp {
  if (oldString === "") {
    // biome-ignore lint/complexity/useRegexLiterals: dynamic pattern
    return new RegExp("(?!)", "g"); // 永不匹配
  }

  const parts = oldString.match(/(\s+|\S+)/g) ?? [];
  
  const whitespacePatternForRun = (run: string): string => {
    // 如果空白包含换行，允许匹配任何空白（包括换行）
    if (run.includes("\n")) {
      return "\\s+";
    }
    // 否则只匹配水平空白，不消耗换行
    return "[\\t ]+";
  };

  const pattern = parts
    .map((part) => {
      if (/^\s+$/.test(part)) {
        return whitespacePatternForRun(part);
      }
      return escapeRegExp(part);
    })
    .join("");

  return new RegExp(pattern, "g");
}

/**
 * 构建 Token-based 正则表达式
 * 将空白分隔的 token 用 \s+ 连接
 */
function buildTokenRegex(oldString: string): RegExp {
  const tokens = oldString.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    // biome-ignore lint/complexity/useRegexLiterals: dynamic pattern
    return new RegExp("(?!)", "g");
  }

  const pattern = tokens.map(escapeRegExp).join("\\s+");
  return new RegExp(pattern, "g");
}

/** 规范化行尾为 LF */
function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

export class EditFileTool extends BaseTool<EditFileInput> {
  readonly name = "edit_file";
  readonly description = `在文件中搜索并替换内容。此工具适用于对现有文件进行小范围的修改。

特点：
- 多策略匹配：精确匹配 → 空白容忍匹配 → Token 匹配
- 支持正则表达式模式
- 支持验证替换次数

使用建议：
- 对于小范围修改使用此工具
- 对于创建新文件或完全重写，使用 write_to_file
- old_string 应该足够长以确保唯一匹配`;

  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "要编辑的文件路径，可以是相对于工作区的相对路径或绝对路径",
      },
      old_string: {
        type: "string",
        description: "要搜索的原始内容，将被替换。应提供足够的上下文以确保唯一匹配",
      },
      new_string: {
        type: "string",
        description: "替换后的新内容。如果为空字符串，则删除匹配的内容",
      },
      regex: {
        type: "boolean",
        description: "是否将 old_string 作为正则表达式处理。默认为 false",
      },
      expected_replacements: {
        type: "number",
        description: "期望的替换次数。默认为 1。用于验证匹配数量是否正确",
      },
    },
    required: ["path", "old_string", "new_string"],
  };

  /** 错误追踪 - 每个文件路径独立追踪连续错误数 */
  private errorTracker: ErrorTracker = {
    consecutiveMistakeCount: new Map(),
  };

  async execute(input: EditFileInput): Promise<ToolResult> {
    const relPath = input.path;
    const expectedReplacements = Math.max(1, input.expected_replacements ?? 1);
    
    try {
      const filePath = this.resolvePath(input.path);
      if (!filePath) {
        return this.handleError(relPath, "无法解析文件路径：未找到工作区");
      }

      // 安全检查：确保路径在工作区内
      if (!this.isPathSafe(filePath)) {
        return this.handleError(relPath, "安全限制：只能编辑工作区内的文件");
      }

      // 检查是否是敏感文件
      const sensitivePatterns = [".env", "credentials", "secret", ".key", ".pem"];
      const fileName = path.basename(filePath).toLowerCase();
      if (sensitivePatterns.some((pattern) => fileName.includes(pattern))) {
        return this.handleError(relPath, `安全警告：拒绝编辑可能包含敏感信息的文件: ${fileName}`);
      }

      const uri = vscode.Uri.file(filePath);

      // 检查文件是否存在
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        // 如果 old_string 为空，表示创建新文件
        if (input.old_string === "") {
          return await this.createNewFile(uri, input.new_string, relPath);
        }
        return this.handleError(relPath, `文件不存在: ${input.path}`);
      }

      // 读取文件内容
      const contentBytes = await vscode.workspace.fs.readFile(uri);
      const originalContent = Buffer.from(contentBytes).toString("utf-8");

      // 执行替换
      let result: { content: string; count: number; strategy: string };

      if (input.regex) {
        result = this.replaceWithRegex(originalContent, input.old_string, input.new_string, expectedReplacements);
      } else {
        result = this.replaceWithMultiStrategy(originalContent, input.old_string, input.new_string, expectedReplacements);
      }

      if (result.count === 0) {
        const suggestion = this.getSuggestionForNoMatch(originalContent, input.old_string, expectedReplacements);
        return this.handleError(relPath, `未找到匹配的内容。${suggestion}`);
      }

      if (result.count !== expectedReplacements) {
        return this.handleError(
          relPath,
          `匹配数量不符：期望 ${expectedReplacements} 次，实际找到 ${result.count} 次。请调整 old_string 使其更具体。`
        );
      }

      if (result.content === originalContent) {
        this.resetErrorCount(relPath);
        return this.success("内容未发生变化（old_string 和 new_string 相同）");
      }

      // 写入文件
      const newContentBytes = Buffer.from(result.content, "utf-8");
      await vscode.workspace.fs.writeFile(uri, newContentBytes);

      // 重置错误计数
      this.resetErrorCount(relPath);

      // 计算变化统计
      const oldLines = originalContent.split(/\r?\n/).length;
      const newLines = result.content.split(/\r?\n/).length;
      const lineDiff = newLines - oldLines;
      const lineDiffStr = lineDiff > 0 ? `+${lineDiff}` : lineDiff < 0 ? `${lineDiff}` : "±0";

      const replacementInfo = expectedReplacements > 1 ? ` (${expectedReplacements} 次替换)` : "";

      return this.success(
        `成功编辑文件: ${input.path}${replacementInfo}
匹配策略: ${result.strategy}
行数变化: ${lineDiffStr} (${oldLines} → ${newLines})`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.handleError(relPath, `编辑文件失败: ${errorMessage}`);
    }
  }

  /**
   * 创建新文件
   */
  private async createNewFile(uri: vscode.Uri, content: string, relPath: string): Promise<ToolResult> {
    try {
      // 确保目录存在
      const dir = vscode.Uri.file(path.dirname(uri.fsPath));
      try {
        await vscode.workspace.fs.stat(dir);
      } catch {
        await vscode.workspace.fs.createDirectory(dir);
      }

      const contentBytes = Buffer.from(content, "utf-8");
      await vscode.workspace.fs.writeFile(uri, contentBytes);

      this.resetErrorCount(relPath);

      const lineCount = content.split(/\r?\n/).length;
      return this.success(`成功创建新文件: ${relPath}\n行数: ${lineCount}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.handleError(relPath, `创建文件失败: ${errorMessage}`);
    }
  }

  /**
   * 多策略替换
   * 策略顺序：精确匹配 → 空白容忍匹配 → Token 匹配
   */
  private replaceWithMultiStrategy(
    content: string,
    oldString: string,
    newString: string,
    expectedReplacements: number
  ): { content: string; count: number; strategy: string } {
    // 规范化行尾
    const contentLF = normalizeLineEndings(content);
    const oldLF = normalizeLineEndings(oldString);
    const newLF = normalizeLineEndings(newString);

    // 策略 1: 精确字面匹配
    const exactCount = countOccurrences(contentLF, oldLF);
    if (exactCount === expectedReplacements) {
      const result = safeLiteralReplace(contentLF, oldLF, newLF);
      return { content: result, count: exactCount, strategy: "精确匹配" };
    }

    // 策略 2: 空白容忍正则
    const wsRegex = buildWhitespaceTolerantRegex(oldLF);
    const wsCount = countRegexMatches(contentLF, wsRegex);
    if (wsCount === expectedReplacements) {
      let replaceCount = 0;
      const result = contentLF.replace(wsRegex, () => {
        replaceCount++;
        return newLF;
      });
      return { content: result, count: replaceCount, strategy: "空白容忍匹配" };
    }

    // 策略 3: Token-based 正则
    const tokenRegex = buildTokenRegex(oldLF);
    const tokenCount = countRegexMatches(contentLF, tokenRegex);
    if (tokenCount === expectedReplacements) {
      let replaceCount = 0;
      const result = contentLF.replace(tokenRegex, () => {
        replaceCount++;
        return newLF;
      });
      return { content: result, count: replaceCount, strategy: "Token 匹配" };
    }

    // 所有策略都未能匹配期望次数
    // 返回精确匹配的结果（即使次数不对）用于错误报告
    if (exactCount > 0) {
      return { content: content, count: exactCount, strategy: "精确匹配 (次数不符)" };
    }
    if (wsCount > 0) {
      return { content: content, count: wsCount, strategy: "空白容忍匹配 (次数不符)" };
    }
    if (tokenCount > 0) {
      return { content: content, count: tokenCount, strategy: "Token 匹配 (次数不符)" };
    }

    return { content: content, count: 0, strategy: "无匹配" };
  }

  /**
   * 使用正则表达式替换
   */
  private replaceWithRegex(
    content: string,
    pattern: string,
    replacement: string,
    expectedReplacements: number
  ): { content: string; count: number; strategy: string } {
    try {
      const regex = new RegExp(pattern, "g");
      const matchCount = countRegexMatches(content, regex);

      if (matchCount !== expectedReplacements) {
        return { content, count: matchCount, strategy: "正则表达式 (次数不符)" };
      }

      let count = 0;
      const newContent = content.replace(regex, (...args) => {
        count++;
        // 支持 $1, $2 等捕获组
        return replacement.replace(/\$(\d+)/g, (_, n) => args[Number.parseInt(n)] || "");
      });

      return { content: newContent, count, strategy: "正则表达式" };
    } catch (error) {
      throw new Error(`无效的正则表达式: ${pattern}`);
    }
  }

  /**
   * 处理错误并追踪连续错误
   */
  private handleError(relPath: string, message: string): ToolResult {
    const currentCount = (this.errorTracker.consecutiveMistakeCount.get(relPath) || 0) + 1;
    this.errorTracker.consecutiveMistakeCount.set(relPath, currentCount);

    // 2 次以上错误时添加升级提示
    if (currentCount >= 2) {
      return this.failure(`${message}\n\n⚠️ 这是对该文件的第 ${currentCount} 次连续错误。建议：
1. 使用 read_file 重新读取文件内容
2. 确保 old_string 与文件内容完全一致
3. 检查是否有隐藏的空白符或换行符差异`);
    }

    return this.failure(message);
  }

  /**
   * 重置错误计数
   */
  private resetErrorCount(relPath: string): void {
    this.errorTracker.consecutiveMistakeCount.delete(relPath);
  }

  /**
   * 当找不到匹配时提供建议
   */
  private getSuggestionForNoMatch(content: string, searchStr: string, expectedReplacements: number): string {
    const suggestions: string[] = [];
    const contentLF = normalizeLineEndings(content);
    const searchLF = normalizeLineEndings(searchStr);

    // 检查各策略的匹配数量
    const exactCount = countOccurrences(contentLF, searchLF);
    const wsCount = countRegexMatches(contentLF, buildWhitespaceTolerantRegex(searchLF));
    const tokenCount = countRegexMatches(contentLF, buildTokenRegex(searchLF));

    if (exactCount > 0) {
      suggestions.push(`精确匹配找到 ${exactCount} 次，但期望 ${expectedReplacements} 次`);
    }
    if (wsCount > 0 && wsCount !== exactCount) {
      suggestions.push(`空白容忍匹配找到 ${wsCount} 次`);
    }
    if (tokenCount > 0 && tokenCount !== wsCount) {
      suggestions.push(`Token 匹配找到 ${tokenCount} 次`);
    }

    // 检查换行符差异
    if (searchStr.includes("\r\n") && !content.includes("\r\n")) {
      suggestions.push("文件使用 LF 换行符，但 old_string 使用 CRLF");
    } else if (!searchStr.includes("\r\n") && content.includes("\r\n")) {
      suggestions.push("文件使用 CRLF 换行符，但 old_string 使用 LF");
    }

    // 检查部分匹配
    const searchWords = searchStr.split(/\s+/).filter(Boolean);
    if (searchWords.length > 3) {
      const firstWords = searchWords.slice(0, 3).join("\\s+");
      if (new RegExp(firstWords).test(content)) {
        suggestions.push("找到了部分匹配，old_string 可能有细微差异");
      }
    }

    if (suggestions.length > 0) {
      return `\n提示：\n- ${suggestions.join("\n- ")}`;
    }

    return "\n请确保 old_string 与文件中的内容完全匹配";
  }

  /**
   * 解析文件路径
   */
  private resolvePath(inputPath: string): string | null {
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    return path.join(workspaceRoot, inputPath);
  }

  /**
   * 检查路径是否安全（在工作区内）
   */
  private isPathSafe(filePath: string): boolean {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    const normalizedPath = path.normalize(filePath);
    return workspaceFolders.some((folder) => {
      const workspaceRoot = path.normalize(folder.uri.fsPath);
      return normalizedPath.startsWith(workspaceRoot);
    });
  }
}
