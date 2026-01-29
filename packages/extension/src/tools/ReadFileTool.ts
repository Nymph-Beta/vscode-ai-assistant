/**
 * 读取文件工具
 * 允许 AI 读取工作区中的文件内容
 */

import * as vscode from "vscode";
import * as path from "node:path";
import { BaseTool, type ToolInput, type ToolInputSchema, type ToolResult } from "./BaseTool";

export interface ReadFileInput extends ToolInput {
  /** 文件路径（相对于工作区根目录或绝对路径） */
  path: string;
  /** 起始行号（从 1 开始，可选） */
  start_line?: number;
  /** 结束行号（包含，可选） */
  end_line?: number;
}

export class ReadFileTool extends BaseTool<ReadFileInput> {
  readonly name = "read_file";
  readonly description =
    "读取指定文件的内容。可以通过 start_line 和 end_line 参数指定要读取的行范围。返回的内容会带有行号前缀，格式为 'LINE_NUMBER|LINE_CONTENT'。";

  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "要读取的文件路径，可以是相对于工作区的相对路径或绝对路径",
      },
      start_line: {
        type: "number",
        description: "起始行号（从 1 开始），不指定则从文件开头读取",
      },
      end_line: {
        type: "number",
        description: "结束行号（包含），不指定则读取到文件末尾",
      },
    },
    required: ["path"],
  };

  async execute(input: ReadFileInput): Promise<ToolResult> {
    try {
      const filePath = this.resolvePath(input.path);
      if (!filePath) {
        return this.failure("无法解析文件路径：未找到工作区");
      }

      // 检查文件是否存在
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      } catch {
        return this.failure(`文件不存在: ${input.path}`);
      }

      // 读取文件内容
      const uri = vscode.Uri.file(filePath);
      const contentBytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(contentBytes).toString("utf-8");

      // 按行分割
      const lines = content.split(/\r?\n/);
      const totalLines = lines.length;

      // 处理行范围
      const startLine = Math.max(1, input.start_line ?? 1);
      const endLine = Math.min(totalLines, input.end_line ?? totalLines);

      if (startLine > endLine) {
        return this.failure(`无效的行范围: start_line (${startLine}) > end_line (${endLine})`);
      }

      // 提取指定行范围的内容，添加行号前缀
      const selectedLines = lines.slice(startLine - 1, endLine);
      const numberedContent = selectedLines
        .map((line, index) => {
          const lineNum = (startLine + index).toString().padStart(6, " ");
          return `${lineNum}|${line}`;
        })
        .join("\n");

      // 构建结果
      const header = `文件: ${input.path}\n行范围: ${startLine}-${endLine} (共 ${totalLines} 行)\n${"─".repeat(50)}\n`;
      return this.success(header + numberedContent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failure(`读取文件失败: ${errorMessage}`);
    }
  }

  /**
   * 解析文件路径
   * 支持相对路径（相对于工作区）和绝对路径
   */
  private resolvePath(inputPath: string): string | null {
    // 如果是绝对路径，直接返回
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }

    // 获取工作区根目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    // 使用第一个工作区作为根目录
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    return path.join(workspaceRoot, inputPath);
  }
}
