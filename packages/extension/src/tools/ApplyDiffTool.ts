/**
 * 应用 Diff 工具
 * 将 unified diff 格式的补丁应用到文件
 */

import * as vscode from "vscode";
import * as path from "node:path";
import { BaseTool, type ToolInput, type ToolInputSchema, type ToolResult } from "./BaseTool";

export interface ApplyDiffInput extends ToolInput {
  /** 文件路径（相对于工作区根目录或绝对路径） */
  path: string;
  /** unified diff 格式的补丁内容 */
  diff: string;
}

interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: Array<{
    type: "context" | "add" | "remove";
    content: string;
  }>;
}

export class ApplyDiffTool extends BaseTool<ApplyDiffInput> {
  readonly name = "apply_diff";
  readonly description = `将 unified diff 格式的补丁应用到文件。

支持的格式：
- 标准 unified diff 格式（git diff 输出）
- 简化的 diff 格式（只包含 hunk 内容）

示例输入：
\`\`\`
@@ -1,5 +1,6 @@
 line 1
 line 2
+new line
 line 3
 line 4
-old line 5
+new line 5
\`\`\`

使用建议：
- 适合应用已有的补丁或多处修改
- 对于简单的单处修改，可以使用 edit_file`;

  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "要应用补丁的文件路径",
      },
      diff: {
        type: "string",
        description: "unified diff 格式的补丁内容",
      },
    },
    required: ["path", "diff"],
  };

  async execute(input: ApplyDiffInput): Promise<ToolResult> {
    try {
      const filePath = this.resolvePath(input.path);
      if (!filePath) {
        return this.failure("无法解析文件路径：未找到工作区");
      }

      // 安全检查
      if (!this.isPathSafe(filePath)) {
        return this.failure("安全限制：只能修改工作区内的文件");
      }

      // 检查敏感文件
      const sensitivePatterns = [".env", "credentials", "secret", ".key", ".pem"];
      const fileName = path.basename(filePath).toLowerCase();
      if (sensitivePatterns.some((pattern) => fileName.includes(pattern))) {
        return this.failure(`安全警告：拒绝修改可能包含敏感信息的文件: ${fileName}`);
      }

      const uri = vscode.Uri.file(filePath);

      // 读取原始文件内容
      let originalContent: string;
      let isNewFile = false;

      try {
        const contentBytes = await vscode.workspace.fs.readFile(uri);
        originalContent = Buffer.from(contentBytes).toString("utf-8");
      } catch {
        // 文件不存在，创建新文件
        originalContent = "";
        isNewFile = true;
      }

      // 解析 diff
      const hunks = this.parseDiff(input.diff);
      if (hunks.length === 0) {
        return this.failure("无法解析 diff 内容，请确保格式正确");
      }

      // 应用 diff
      const result = this.applyHunks(originalContent, hunks);
      if (!result.success) {
        return this.failure(`应用 diff 失败: ${result.error}`);
      }

      // 确保父目录存在
      if (isNewFile) {
        const parentDir = path.dirname(filePath);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(parentDir));
      }

      // 写入文件
      const resultContent = result.content ?? "";
      const newContentBytes = Buffer.from(resultContent, "utf-8");
      await vscode.workspace.fs.writeFile(uri, newContentBytes);

      // 统计变化
      const stats = this.calculateStats(hunks);

      return this.success(
        `成功应用 diff: ${input.path}\n` +
          `Hunks: ${hunks.length}\n` +
          `添加: +${stats.additions} 行\n` +
          `删除: -${stats.deletions} 行`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failure(`应用 diff 失败: ${errorMessage}`);
    }
  }

  /**
   * 解析 unified diff 格式
   */
  private parseDiff(diff: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const lines = diff.split(/\r?\n/);

    let currentHunk: DiffHunk | null = null;

    for (const line of lines) {
      // 跳过文件头
      if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ")) {
        continue;
      }

      // 解析 hunk 头
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        currentHunk = {
          oldStart: Number.parseInt(hunkMatch[1]),
          oldCount: Number.parseInt(hunkMatch[2] || "1"),
          newStart: Number.parseInt(hunkMatch[3]),
          newCount: Number.parseInt(hunkMatch[4] || "1"),
          lines: [],
        };
        continue;
      }

      // 解析 hunk 内容
      if (currentHunk) {
        if (line.startsWith("+")) {
          currentHunk.lines.push({ type: "add", content: line.slice(1) });
        } else if (line.startsWith("-")) {
          currentHunk.lines.push({ type: "remove", content: line.slice(1) });
        } else if (line.startsWith(" ") || line === "") {
          currentHunk.lines.push({ type: "context", content: line.slice(1) || "" });
        }
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * 应用 hunks 到文件内容
   */
  private applyHunks(
    content: string,
    hunks: DiffHunk[]
  ): { success: boolean; content?: string; error?: string } {
    const lines = content.split(/\r?\n/);

    // 按起始行号排序（从后向前应用，避免行号偏移）
    const sortedHunks = [...hunks].sort((a, b) => b.oldStart - a.oldStart);

    for (const hunk of sortedHunks) {
      const result = this.applyHunk(lines, hunk);
      if (!result.success) {
        return { success: false, error: result.error };
      }
    }

    return { success: true, content: lines.join("\n") };
  }

  /**
   * 应用单个 hunk
   */
  private applyHunk(
    lines: string[],
    hunk: DiffHunk
  ): { success: boolean; error?: string } {
    // 计算起始索引（行号从 1 开始，数组从 0 开始）
    let startIndex = hunk.oldStart - 1;

    // 尝试找到最佳匹配位置（允许一定的偏移）
    const contextLines = hunk.lines
      .filter((l) => l.type === "context" || l.type === "remove")
      .map((l) => l.content);

    // 精确匹配
    if (!this.matchContext(lines, startIndex, contextLines)) {
      // 尝试在附近查找匹配位置
      const searchRange = 50; // 搜索范围
      let found = false;

      for (let offset = 1; offset <= searchRange; offset++) {
        // 向下搜索
        if (startIndex + offset < lines.length && this.matchContext(lines, startIndex + offset, contextLines)) {
          startIndex = startIndex + offset;
          found = true;
          break;
        }
        // 向上搜索
        if (startIndex - offset >= 0 && this.matchContext(lines, startIndex - offset, contextLines)) {
          startIndex = startIndex - offset;
          found = true;
          break;
        }
      }

      if (!found) {
        return {
          success: false,
          error: `无法在第 ${hunk.oldStart} 行附近找到匹配的上下文`,
        };
      }
    }

    // 应用更改
    const newLines: string[] = [];
    let lineIndex = startIndex;

    for (const diffLine of hunk.lines) {
      switch (diffLine.type) {
        case "context":
          // 保留上下文行
          if (lineIndex < lines.length) {
            newLines.push(lines[lineIndex]);
            lineIndex++;
          }
          break;
        case "add":
          // 添加新行
          newLines.push(diffLine.content);
          break;
        case "remove":
          // 跳过被删除的行
          lineIndex++;
          break;
      }
    }

    // 替换原始行
    const removeCount = hunk.lines.filter(
      (l) => l.type === "context" || l.type === "remove"
    ).length;
    lines.splice(startIndex, removeCount, ...newLines);

    return { success: true };
  }

  /**
   * 检查上下文是否匹配
   */
  private matchContext(
    lines: string[],
    startIndex: number,
    contextLines: string[]
  ): boolean {
    if (startIndex < 0 || startIndex + contextLines.length > lines.length) {
      return false;
    }

    for (let i = 0; i < contextLines.length; i++) {
      const actual = lines[startIndex + i];
      const expected = contextLines[i];

      // 精确匹配或空白符容忍匹配
      if (actual !== expected && actual.trim() !== expected.trim()) {
        return false;
      }
    }

    return true;
  }

  /**
   * 计算变更统计
   */
  private calculateStats(hunks: DiffHunk[]): { additions: number; deletions: number } {
    let additions = 0;
    let deletions = 0;

    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === "add") additions++;
        if (line.type === "remove") deletions++;
      }
    }

    return { additions, deletions };
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
   * 检查路径是否安全
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
