/**
 * 写入文件工具
 * 允许 AI 创建或覆写工作区中的文件
 */

import * as vscode from "vscode";
import * as path from "node:path";
import { BaseTool, type ToolInput, type ToolInputSchema, type ToolResult } from "./BaseTool";

export interface WriteToFileInput extends ToolInput {
  /** 文件路径（相对于工作区根目录或绝对路径） */
  path: string;
  /** 要写入的内容 */
  content: string;
}

export class WriteToFileTool extends BaseTool<WriteToFileInput> {
  readonly name = "write_to_file";
  readonly description =
    "创建新文件或覆写现有文件的全部内容。如果文件的父目录不存在，会自动创建。使用此工具时请确保提供完整的文件内容。";

  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "要写入的文件路径，可以是相对于工作区的相对路径或绝对路径",
      },
      content: {
        type: "string",
        description: "要写入文件的完整内容",
      },
    },
    required: ["path", "content"],
  };

  async execute(input: WriteToFileInput): Promise<ToolResult> {
    try {
      const filePath = this.resolvePath(input.path);
      if (!filePath) {
        return this.failure("无法解析文件路径：未找到工作区");
      }

      // 安全检查：确保路径在工作区内
      if (!this.isPathSafe(filePath)) {
        return this.failure("安全限制：只能写入工作区内的文件");
      }

      // 检查是否是敏感文件
      const sensitivePatterns = [".env", "credentials", "secret", ".key", ".pem"];
      const fileName = path.basename(filePath).toLowerCase();
      if (sensitivePatterns.some((pattern) => fileName.includes(pattern))) {
        return this.failure(`安全警告：拒绝写入可能包含敏感信息的文件: ${fileName}`);
      }

      const uri = vscode.Uri.file(filePath);

      // 检查文件是否已存在
      let isNewFile = true;
      try {
        await vscode.workspace.fs.stat(uri);
        isNewFile = false;
      } catch {
        // 文件不存在，这是正常的
      }

      // 确保父目录存在
      const parentDir = path.dirname(filePath);
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(parentDir));

      // 写入文件
      const contentBytes = Buffer.from(input.content, "utf-8");
      await vscode.workspace.fs.writeFile(uri, contentBytes);

      // 统计信息
      const lines = input.content.split(/\r?\n/).length;
      const bytes = contentBytes.length;

      const action = isNewFile ? "创建" : "更新";
      return this.success(
        `成功${action}文件: ${input.path}\n` +
          `大小: ${bytes} 字节\n` +
          `行数: ${lines} 行`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failure(`写入文件失败: ${errorMessage}`);
    }
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
