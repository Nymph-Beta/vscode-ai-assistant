/**
 * 上下文收集器
 * 自动收集当前编辑器上下文，为 AI 提供相关信息
 */

import * as vscode from "vscode";
import * as path from "node:path";

/** 文件上下文 */
export interface FileContext {
  /** 文件路径（相对于工作区） */
  path: string;
  /** 文件语言 */
  language: string;
  /** 文件内容（可选，可能很大） */
  content?: string;
  /** 选中的文本 */
  selection?: string;
  /** 选中范围 */
  selectionRange?: {
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
  };
  /** 光标位置 */
  cursorPosition?: {
    line: number;
    column: number;
  };
}

/** 工作区上下文 */
export interface WorkspaceContext {
  /** 工作区根目录 */
  rootPath: string;
  /** 工作区名称 */
  name: string;
  /** 打开的文件列表 */
  openFiles: string[];
  /** 最近修改的文件 */
  recentFiles?: string[];
}

/** 完整的上下文信息 */
export interface FullContext {
  /** 当前活动文件 */
  activeFile?: FileContext;
  /** 工作区信息 */
  workspace?: WorkspaceContext;
  /** 诊断信息（错误/警告） */
  diagnostics?: DiagnosticInfo[];
  /** 时间戳 */
  timestamp: number;
}

/** 诊断信息 */
export interface DiagnosticInfo {
  file: string;
  line: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source?: string;
}

export class ContextCollector {
  /**
   * 获取当前活动文件的上下文
   */
  getActiveFileContext(includeContent = false): FileContext | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const relativePath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
      : document.uri.fsPath;

    const context: FileContext = {
      path: relativePath,
      language: document.languageId,
    };

    // 获取选中内容
    const selection = editor.selection;
    if (!selection.isEmpty) {
      context.selection = document.getText(selection);
      context.selectionRange = {
        startLine: selection.start.line + 1,
        endLine: selection.end.line + 1,
        startColumn: selection.start.character + 1,
        endColumn: selection.end.character + 1,
      };
    }

    // 获取光标位置
    context.cursorPosition = {
      line: selection.active.line + 1,
      column: selection.active.character + 1,
    };

    // 可选：包含文件内容
    if (includeContent) {
      // 限制内容大小，避免过大的上下文
      const maxLines = 500;
      const lines = document.lineCount;
      if (lines <= maxLines) {
        context.content = document.getText();
      } else {
        // 只包含光标附近的内容
        const cursorLine = selection.active.line;
        const startLine = Math.max(0, cursorLine - Math.floor(maxLines / 2));
        const endLine = Math.min(lines, startLine + maxLines);
        const range = new vscode.Range(startLine, 0, endLine, 0);
        context.content = `[显示第 ${startLine + 1}-${endLine} 行，共 ${lines} 行]\n\n${document.getText(range)}`;
      }
    }

    return context;
  }

  /**
   * 获取工作区上下文
   */
  getWorkspaceContext(): WorkspaceContext | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    const rootFolder = workspaceFolders[0];

    // 获取所有打开的文件
    const openFiles = vscode.workspace.textDocuments
      .filter((doc) => !doc.isUntitled && doc.uri.scheme === "file")
      .map((doc) => {
        const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
        return folder
          ? path.relative(folder.uri.fsPath, doc.uri.fsPath)
          : doc.uri.fsPath;
      });

    return {
      rootPath: rootFolder.uri.fsPath,
      name: rootFolder.name,
      openFiles,
    };
  }

  /**
   * 获取当前文件的诊断信息（错误/警告）
   */
  getActiveDiagnostics(): DiagnosticInfo[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [];
    }

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);

    return diagnostics.map((diag) => ({
      file: workspaceFolder
        ? path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath)
        : editor.document.uri.fsPath,
      line: diag.range.start.line + 1,
      severity: this.severityToString(diag.severity),
      message: diag.message,
      source: diag.source,
    }));
  }

  /**
   * 获取完整的上下文信息
   */
  getFullContext(options?: {
    includeFileContent?: boolean;
    includeDiagnostics?: boolean;
  }): FullContext {
    return {
      activeFile: this.getActiveFileContext(options?.includeFileContent ?? false),
      workspace: this.getWorkspaceContext(),
      diagnostics: options?.includeDiagnostics ? this.getActiveDiagnostics() : undefined,
      timestamp: Date.now(),
    };
  }

  /**
   * 将上下文格式化为文本，用于添加到系统提示
   */
  formatContextForPrompt(context: FullContext): string {
    const parts: string[] = [];

    // 工作区信息
    if (context.workspace) {
      parts.push(`工作区: ${context.workspace.name}`);
      if (context.workspace.openFiles.length > 0) {
        parts.push(`打开的文件: ${context.workspace.openFiles.slice(0, 5).join(", ")}${context.workspace.openFiles.length > 5 ? "..." : ""}`);
      }
    }

    // 当前文件信息
    if (context.activeFile) {
      parts.push(`\n当前文件: ${context.activeFile.path} (${context.activeFile.language})`);

      if (context.activeFile.cursorPosition) {
        parts.push(`光标位置: 第 ${context.activeFile.cursorPosition.line} 行, 第 ${context.activeFile.cursorPosition.column} 列`);
      }

      if (context.activeFile.selection) {
        parts.push(`\n选中内容 (第 ${context.activeFile.selectionRange?.startLine}-${context.activeFile.selectionRange?.endLine} 行):`);
        parts.push(`\`\`\`${context.activeFile.language}`);
        parts.push(context.activeFile.selection);
        parts.push("```");
      }

      if (context.activeFile.content) {
        parts.push(`\n文件内容:\n\`\`\`${context.activeFile.language}`);
        // parts.push("```" + context.activeFile.language);
        parts.push(context.activeFile.content);
        parts.push("```");
      }
    }

    // 诊断信息
    if (context.diagnostics && context.diagnostics.length > 0) {
      parts.push("\n当前文件的问题:");
      for (const diag of context.diagnostics.slice(0, 10)) {
        const icon = diag.severity === "error" ? "❌" : diag.severity === "warning" ? "⚠️" : "ℹ️";
        parts.push(`${icon} 第 ${diag.line} 行: ${diag.message}${diag.source ? ` (${diag.source})` : ""}`);
      }
      if (context.diagnostics.length > 10) {
        parts.push(`... 还有 ${context.diagnostics.length - 10} 个问题`);
      }
    }

    return parts.join("\n");
  }

  /**
   * 转换诊断严重性为字符串
   */
  private severityToString(severity: vscode.DiagnosticSeverity): DiagnosticInfo["severity"] {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return "error";
      case vscode.DiagnosticSeverity.Warning:
        return "warning";
      case vscode.DiagnosticSeverity.Information:
        return "info";
      case vscode.DiagnosticSeverity.Hint:
        return "hint";
      default:
        return "info";
    }
  }
}

/** 全局上下文收集器单例 */
export const contextCollector = new ContextCollector();
