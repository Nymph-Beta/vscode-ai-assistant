/**
 * Diff 查看服务 - 增强版
 * 支持流式更新、装饰可视化、用户编辑检测、诊断集成
 */

import * as vscode from "vscode";
import * as path from "node:path";
import { type DecorationController, createDecorationControllers } from "./DecorationController";

export interface DiffViewOptions {
  leftTitle?: string;
  rightTitle?: string;
  newGroup?: boolean;
  preserveFocus?: boolean;
}

export interface SaveResult {
  newProblemsMessage: string;
  userEdits?: string;
  finalContent: string;
}

const DEFAULT_WRITE_DELAY_MS = 300;

export class DiffViewerService {
  private static readonly SCHEME = "vscode-tools-diff";
  private contentProvider: DiffContentProvider;
  private disposables: vscode.Disposable[] = [];
  private activeDiffEditor: vscode.TextEditor | undefined;
  private fadedOverlayController: DecorationController | undefined;
  private activeLineController: DecorationController | undefined;
  private streamedLines: string[] = [];
  private originalContent: string | undefined;
  private newContent: string | undefined;
  private relPath: string | undefined;
  private preDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [];

  constructor() {
    this.contentProvider = new DiffContentProvider();
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(DiffViewerService.SCHEME, this.contentProvider)
    );
  }

  async open(relPath: string): Promise<void> {
    const absolutePath = this.resolvePath(relPath);
    if (!absolutePath) throw new Error("无法解析文件路径");

    this.relPath = relPath;
    const uri = vscode.Uri.file(absolutePath);
    this.preDiagnostics = vscode.languages.getDiagnostics();

    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      this.originalContent = Buffer.from(bytes).toString("utf-8").replace(/^\uFEFF/, "");
    } catch {
      this.originalContent = "";
    }

    const doc = await vscode.workspace.openTextDocument(uri);
    this.activeDiffEditor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });

    const ctrl = createDecorationControllers(this.activeDiffEditor);
    this.fadedOverlayController = ctrl.fadedOverlay;
    this.activeLineController = ctrl.activeLine;
    this.fadedOverlayController.addLines(0, this.activeDiffEditor.document.lineCount);
    this.streamedLines = [];
  }

  async update(content: string, isFinal: boolean): Promise<void> {
    if (!this.activeLineController || !this.fadedOverlayController) throw new Error("请先调用 open()");

    this.newContent = content;
    const lines = content.split("\n");
    if (!isFinal) lines.pop();

    const editor = this.activeDiffEditor;
    const doc = editor?.document;
    if (!editor || !doc) throw new Error("编辑器已关闭");

    const endLine = lines.length;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(0, 0, endLine, 0), lines.join("\n") + (lines.length > 0 ? "\n" : ""));
    await vscode.workspace.applyEdit(edit);

    this.activeLineController.setActiveLine(endLine);
    this.fadedOverlayController.updateOverlayAfterLine(endLine, doc.lineCount);
    this.streamedLines = lines;

    if (isFinal) {
      if (this.streamedLines.length < doc.lineCount) {
        const del = new vscode.WorkspaceEdit();
        del.delete(doc.uri, new vscode.Range(this.streamedLines.length, 0, doc.lineCount, 0));
        await vscode.workspace.applyEdit(del);
      }
      this.fadedOverlayController.clear();
      this.activeLineController.clear();
    }
  }

  async saveChanges(diagnosticsEnabled = true, delayMs = DEFAULT_WRITE_DELAY_MS): Promise<SaveResult> {
    const doc = this.activeDiffEditor?.document;
    if (!doc) throw new Error("编辑器已关闭");

    const editedContent = doc.getText();
    await doc.save();

    let newProblemsMessage = "";
    if (diagnosticsEnabled) {
      await new Promise((r) => setTimeout(r, Math.max(0, delayMs)));
      const postDiag = vscode.languages.getDiagnostics();
      const newProblems = this.getNewDiagnostics(this.preDiagnostics, postDiag);
      const errors = newProblems.filter(([, d]) => d.some((x) => x.severity === vscode.DiagnosticSeverity.Error));
      if (errors.length > 0) {
        newProblemsMessage = `\n\n保存后检测到新问题:\n${errors.map(([u, d]) => {
          const p = vscode.workspace.asRelativePath(u);
          return `${p}:\n${d.filter((x) => x.severity === vscode.DiagnosticSeverity.Error).slice(0, 5).map((x) => `  L${x.range.start.line + 1}: ${x.message}`).join("\n")}`;
        }).join("\n")}`;
      }
    }

    const eol = this.newContent?.includes("\r\n") ? "\r\n" : "\n";
    const normEdited = editedContent.replace(/\r\n|\n/g, eol);
    const normNew = (this.newContent || "").replace(/\r\n|\n/g, eol);
    const userEdits = normEdited !== normNew ? "用户在批准前修改了内容" : undefined;

    return { newProblemsMessage, userEdits, finalContent: normEdited };
  }

  async revertChanges(): Promise<void> {
    if (!this.activeDiffEditor || !this.originalContent) return;
    const doc = this.activeDiffEditor.document;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), this.originalContent);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
  }

  async reset(): Promise<void> {
    this.fadedOverlayController?.clear();
    this.activeLineController?.clear();
    this.activeDiffEditor = undefined;
    this.fadedOverlayController = undefined;
    this.activeLineController = undefined;
    this.streamedLines = [];
    this.originalContent = undefined;
    this.newContent = undefined;
    this.relPath = undefined;
    this.preDiagnostics = [];
  }

  async showDiff(oldContent: string, newContent: string, filePath: string, options: DiffViewOptions = {}): Promise<void> {
    const name = path.basename(filePath);
    const leftUri = this.createUri(filePath, "old", oldContent);
    const rightUri = this.createUri(filePath, "new", newContent);
    await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, `${name}: ${options.leftTitle || "原始"} ↔ ${options.rightTitle || "修改后"}`, {
      preview: true, preserveFocus: options.preserveFocus, viewColumn: options.newGroup ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
    });
  }

  getDiffStats(oldContent: string, newContent: string): { additions: number; deletions: number } {
    const oldLines = new Set(oldContent.split(/\r?\n/));
    const newLines = new Set(newContent.split(/\r?\n/));
    let additions = 0;
    let deletions = 0;
    for (const l of newContent.split(/\r?\n/)) if (!oldLines.has(l)) additions++;
    for (const l of oldContent.split(/\r?\n/)) if (!newLines.has(l)) deletions++;
    return { additions, deletions };
  }

  private createUri(filePath: string, version: string, content: string): vscode.Uri {
    const id = this.contentProvider.addContent(content);
    return vscode.Uri.parse(`${DiffViewerService.SCHEME}:${filePath}?version=${version}&id=${id}`);
  }

  private resolvePath(inputPath: string): string | null {
    if (path.isAbsolute(inputPath)) return inputPath;
    const ws = vscode.workspace.workspaceFolders;
    return ws && ws.length > 0 ? path.join(ws[0].uri.fsPath, inputPath) : null;
  }

  private getNewDiagnostics(before: [vscode.Uri, vscode.Diagnostic[]][], after: [vscode.Uri, vscode.Diagnostic[]][]): [vscode.Uri, vscode.Diagnostic[]][] {
    const beforeMap = new Map<string, Set<string>>();
    for (const [uri, diags] of before) {
      const key = uri.toString();
      if (!beforeMap.has(key)) beforeMap.set(key, new Set());
      const set = beforeMap.get(key);
      if (set) {
        for (const d of diags) set.add(`${d.range.start.line}:${d.message}`);
      }
    }
    const result: [vscode.Uri, vscode.Diagnostic[]][] = [];
    for (const [uri, diags] of after) {
      const key = uri.toString();
      const bs = beforeMap.get(key) || new Set();
      const newD = diags.filter((d) => !bs.has(`${d.range.start.line}:${d.message}`));
      if (newD.length > 0) result.push([uri, newD]);
    }
    return result;
  }

  dispose(): void {
    this.reset();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private contents = new Map<string, string>();
  private counter = 0;

  addContent(content: string): string {
    const id = `c-${++this.counter}`;
    this.contents.set(id, content);
    return id;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const id = new URLSearchParams(uri.query).get("id");
    return id && this.contents.has(id) ? this.contents.get(id) || "" : "";
  }
}
