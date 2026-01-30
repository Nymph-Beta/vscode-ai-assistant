/**
 * Decoration Controller
 * 管理 VS Code 编辑器的装饰（用于流式更新可视化）
 * 基于 Roo-Code 的实现
 */

import * as vscode from "vscode";

/** 装饰类型 */
export type DecorationType = "fadedOverlay" | "activeLine";

/** 已淡化的叠加层装饰 */
const fadedOverlayDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: "rgba(255, 255, 0, 0.1)",
  opacity: "0.4",
  isWholeLine: true,
});

/** 活动行装饰 */
const activeLineDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: "rgba(255, 255, 0, 0.3)",
  opacity: "1",
  isWholeLine: true,
  border: "1px solid rgba(255, 255, 0, 0.5)",
});

/**
 * Decoration Controller
 * 管理编辑器装饰的添加、更新和清除
 */
export class DecorationController {
  private decorationType: DecorationType;
  private editor: vscode.TextEditor;
  private ranges: vscode.Range[] = [];

  constructor(type: DecorationType, editor: vscode.TextEditor) {
    this.decorationType = type;
    this.editor = editor;
  }

  /**
   * 获取装饰类型
   */
  private getDecoration(): vscode.TextEditorDecorationType {
    return this.decorationType === "fadedOverlay"
      ? fadedOverlayDecorationType
      : activeLineDecorationType;
  }

  /**
   * 添加行范围的装饰
   */
  addLines(startLine: number, endLine: number): void {
    if (startLine >= endLine) return;

    const range = new vscode.Range(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine - 1, Number.MAX_SAFE_INTEGER)
    );

    this.ranges.push(range);
    this.editor.setDecorations(this.getDecoration(), this.ranges);
  }

  /**
   * 设置活动行（单行高亮）
   */
  setActiveLine(line: number): void {
    this.ranges = [
      new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER),
    ];
    this.editor.setDecorations(this.getDecoration(), this.ranges);
  }

  /**
   * 更新叠加层到指定行之后
   * 用于流式更新：已处理的内容正常显示，未处理的内容淡化
   */
  updateOverlayAfterLine(line: number, totalLines: number): void {
    // 移除当前行之后的所有现有范围
    this.ranges = this.ranges.filter((range) => range.end.line < line);

    // 添加当前行之后所有行的新范围
    if (line < totalLines - 1) {
      this.ranges.push(
        new vscode.Range(
          new vscode.Position(line + 1, 0),
          new vscode.Position(totalLines - 1, Number.MAX_SAFE_INTEGER)
        )
      );
    }

    // 应用更新后的装饰
    this.editor.setDecorations(this.getDecoration(), this.ranges);
  }

  /**
   * 清除所有装饰
   */
  clear(): void {
    this.ranges = [];
    this.editor.setDecorations(this.getDecoration(), []);
  }

  /**
   * 更新编辑器引用
   */
  setEditor(editor: vscode.TextEditor): void {
    this.editor = editor;
  }
}

/**
 * 创建两个装饰控制器（fadedOverlay 和 activeLine）
 */
export function createDecorationControllers(
  editor: vscode.TextEditor
): {
  fadedOverlay: DecorationController;
  activeLine: DecorationController;
} {
  return {
    fadedOverlay: new DecorationController("fadedOverlay", editor),
    activeLine: new DecorationController("activeLine", editor),
  };
}
