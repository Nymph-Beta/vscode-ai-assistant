/**
 * 代码解析器
 * 将源代码文件解析为语义代码块
 */

import * as crypto from "node:crypto";
import * as path from "node:path";
import type { CodeBlock, CodeBlockType, ICodeParser } from "../types";

/** 代码解析模式 */
interface ParsePattern {
  type: CodeBlockType;
  pattern: RegExp;
  identifierGroup: number;
}

/** 语言特定的解析模式 */
const LANGUAGE_PATTERNS: Record<string, ParsePattern[]> = {
  typescript: [
    // 函数声明
    {
      type: "function",
      pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
      identifierGroup: 1,
    },
    // 箭头函数变量
    {
      type: "function",
      pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*\w+)?\s*=>/gm,
      identifierGroup: 1,
    },
    // 类声明
    {
      type: "class",
      pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm,
      identifierGroup: 1,
    },
    // 接口声明
    {
      type: "interface",
      pattern: /^(?:export\s+)?interface\s+(\w+)/gm,
      identifierGroup: 1,
    },
    // 类型声明
    {
      type: "type",
      pattern: /^(?:export\s+)?type\s+(\w+)/gm,
      identifierGroup: 1,
    },
    // 枚举声明
    {
      type: "enum",
      pattern: /^(?:export\s+)?enum\s+(\w+)/gm,
      identifierGroup: 1,
    },
  ],
  python: [
    // 函数定义
    {
      type: "function",
      pattern: /^(?:async\s+)?def\s+(\w+)\s*\(/gm,
      identifierGroup: 1,
    },
    // 类定义
    {
      type: "class",
      pattern: /^class\s+(\w+)/gm,
      identifierGroup: 1,
    },
  ],
  java: [
    // 方法定义
    {
      type: "method",
      pattern: /^\s*(?:public|private|protected)?\s*(?:static)?\s*(?:\w+)\s+(\w+)\s*\(/gm,
      identifierGroup: 1,
    },
    // 类定义
    {
      type: "class",
      pattern: /^(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)/gm,
      identifierGroup: 1,
    },
    // 接口定义
    {
      type: "interface",
      pattern: /^(?:public\s+)?interface\s+(\w+)/gm,
      identifierGroup: 1,
    },
  ],
  go: [
    // 函数定义
    {
      type: "function",
      pattern: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/gm,
      identifierGroup: 1,
    },
    // 类型定义
    {
      type: "type",
      pattern: /^type\s+(\w+)\s+(?:struct|interface)/gm,
      identifierGroup: 1,
    },
  ],
  rust: [
    // 函数定义
    {
      type: "function",
      pattern: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm,
      identifierGroup: 1,
    },
    // 结构体定义
    {
      type: "class",
      pattern: /^(?:pub\s+)?struct\s+(\w+)/gm,
      identifierGroup: 1,
    },
    // trait 定义
    {
      type: "interface",
      pattern: /^(?:pub\s+)?trait\s+(\w+)/gm,
      identifierGroup: 1,
    },
    // 枚举定义
    {
      type: "enum",
      pattern: /^(?:pub\s+)?enum\s+(\w+)/gm,
      identifierGroup: 1,
    },
  ],
};

// 扩展名到语言的映射
const EXT_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "typescript",
  ".jsx": "typescript",
  ".mjs": "typescript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".vue": "typescript",
  ".svelte": "typescript",
};

export class CodeParser implements ICodeParser {
  private minBlockChars: number;
  private maxBlockChars: number;

  constructor(minBlockChars = 50, maxBlockChars = 1000) {
    this.minBlockChars = minBlockChars;
    this.maxBlockChars = maxBlockChars;
  }

  /**
   * 检查是否支持该文件
   */
  supportsFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext in EXT_TO_LANGUAGE;
  }

  /**
   * 解析文件为代码块
   */
  async parseFile(filePath: string, content: string): Promise<CodeBlock[]> {
    const ext = path.extname(filePath).toLowerCase();
    const language = EXT_TO_LANGUAGE[ext];

    if (!language) {
      // 不支持的语言，使用分块策略
      return this.chunkContent(filePath, content);
    }

    const patterns = LANGUAGE_PATTERNS[language];
    if (!patterns) {
      return this.chunkContent(filePath, content);
    }

    const fileHash = this.computeHash(content);
    const blocks: CodeBlock[] = [];
    const lines = content.split(/\r?\n/);

    // 收集所有匹配
    const matches: Array<{
      type: CodeBlockType;
      identifier: string;
      startLine: number;
    }> = [];

    for (const { type, pattern, identifierGroup } of patterns) {
      // 重置 lastIndex
      pattern.lastIndex = 0;

      let match = pattern.exec(content);
      while (match !== null) {
        const startLine = this.getLineNumber(content, match.index);
        const identifier = match[identifierGroup];

        matches.push({ type, identifier, startLine });
        match = pattern.exec(content);
      }
    }

    // 按行号排序
    matches.sort((a, b) => a.startLine - b.startLine);

    // 为每个匹配提取代码块
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const next = matches[i + 1];

      // 确定结束行
      const endLine = next
        ? Math.min(next.startLine - 1, current.startLine + 50)
        : Math.min(current.startLine + 50, lines.length);

      // 提取内容
      const blockLines = lines.slice(current.startLine - 1, endLine);
      const blockContent = blockLines.join("\n");

      // 检查大小限制
      if (blockContent.length < this.minBlockChars) {
        continue;
      }

      const trimmedContent =
        blockContent.length > this.maxBlockChars
          ? `${blockContent.slice(0, this.maxBlockChars)}\n// ... (truncated)`
          : blockContent;

      blocks.push({
        filePath,
        identifier: current.identifier,
        type: current.type,
        startLine: current.startLine,
        endLine,
        content: trimmedContent,
        hash: this.computeHash(trimmedContent),
        fileHash,
      });
    }

    // 如果没有找到任何匹配，使用分块策略
    if (blocks.length === 0) {
      return this.chunkContent(filePath, content);
    }

    return blocks;
  }

  /**
   * 对内容进行分块（用于不支持的语言或无法解析的文件）
   */
  private chunkContent(filePath: string, content: string): CodeBlock[] {
    const fileHash = this.computeHash(content);
    const blocks: CodeBlock[] = [];
    const lines = content.split(/\r?\n/);
    const chunkSize = 30; // 每块 30 行

    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunkLines = lines.slice(i, i + chunkSize);
      const chunkContent = chunkLines.join("\n");

      if (chunkContent.length < this.minBlockChars) {
        continue;
      }

      const trimmedContent =
        chunkContent.length > this.maxBlockChars
          ? chunkContent.slice(0, this.maxBlockChars)
          : chunkContent;

      blocks.push({
        filePath,
        identifier: `chunk_${i + 1}`,
        type: "other",
        startLine: i + 1,
        endLine: Math.min(i + chunkSize, lines.length),
        content: trimmedContent,
        hash: this.computeHash(trimmedContent),
        fileHash,
      });
    }

    return blocks;
  }

  /**
   * 获取字符位置对应的行号
   */
  private getLineNumber(content: string, charIndex: number): number {
    const lines = content.slice(0, charIndex).split(/\r?\n/);
    return lines.length;
  }

  /**
   * 计算内容哈希
   */
  private computeHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
}
