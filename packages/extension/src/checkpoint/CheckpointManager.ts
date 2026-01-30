/**
 * 检查点管理器
 * 基于 Git 的状态检查点系统
 */

import * as vscode from "vscode";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type {
  Checkpoint,
  CheckpointDiff,
  CheckpointStorage,
  CreateCheckpointOptions,
  FileDiff,
  RestoreCheckpointOptions,
} from "./types";

/** 执行 Git 命令的结果 */
interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 检查点管理器
 */
export class CheckpointManager {
  private workspaceRoot: string | undefined;
  private storage: CheckpointStorage;
  private shadowBranch = "vscode-tools-checkpoints";
  private originalBranch = "";

  constructor(storage: CheckpointStorage) {
    this.storage = storage;
    this.initWorkspaceRoot();
  }

  /**
   * 初始化工作区根目录
   */
  private initWorkspaceRoot(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      this.workspaceRoot = workspaceFolders[0].uri.fsPath;
    }
  }

  /**
   * 检查是否是 Git 仓库
   */
  async isGitRepository(): Promise<boolean> {
    if (!this.workspaceRoot) return false;

    const result = await this.execGit(["rev-parse", "--is-inside-work-tree"]);
    return result.exitCode === 0 && result.stdout.trim() === "true";
  }

  /**
   * 获取当前分支名称
   */
  async getCurrentBranch(): Promise<string> {
    const result = await this.execGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    return result.stdout.trim();
  }

  /**
   * 创建检查点
   */
  async createCheckpoint(options: CreateCheckpointOptions = {}): Promise<Checkpoint> {
    if (!this.workspaceRoot) {
      throw new Error("未找到工作区");
    }

    if (!(await this.isGitRepository())) {
      throw new Error("当前目录不是 Git 仓库");
    }

    // 保存当前分支
    this.originalBranch = await this.getCurrentBranch();

    // 暂存所有更改
    if (options.includeUnstaged !== false) {
      await this.execGit(["add", "-A"]);
    }

    // 检查是否有更改
    const statusResult = await this.execGit(["status", "--porcelain"]);
    if (!statusResult.stdout.trim()) {
      throw new Error("没有需要保存的更改");
    }

    // 获取变更统计
    const diffStatResult = await this.execGit(["diff", "--cached", "--stat"]);
    const changedFiles = await this.getChangedFiles();
    const stats = this.parseStats(diffStatResult.stdout);

    // 创建检查点 commit
    const checkpointId = this.generateId();
    const checkpointName = options.name || `Checkpoint ${new Date().toLocaleString()}`;
    const commitMessage = `[checkpoint:${checkpointId}] ${checkpointName}`;

    await this.execGit(["commit", "-m", commitMessage]);

    // 获取 commit SHA
    const shaResult = await this.execGit(["rev-parse", "HEAD"]);
    const commitSha = shaResult.stdout.trim();

    // 创建检查点记录
    const checkpoint: Checkpoint = {
      id: checkpointId,
      name: checkpointName,
      timestamp: Date.now(),
      commitSha,
      taskId: options.taskId,
      changedFiles,
      stats: {
        ...stats,
        filesChanged: changedFiles.length,
      },
    };

    // 保存到存储
    await this.storage.save(checkpoint);

    return checkpoint;
  }

  /**
   * 恢复到检查点
   */
  async restoreCheckpoint(
    checkpointId: string,
    options: RestoreCheckpointOptions = {}
  ): Promise<void> {
    if (!this.workspaceRoot) {
      throw new Error("未找到工作区");
    }

    const checkpoint = await this.storage.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`未找到检查点: ${checkpointId}`);
    }

    // 可选：创建备份
    if (options.createBackup !== false) {
      try {
        await this.createCheckpoint({
          name: options.backupName || `Backup before restore to ${checkpoint.name}`,
        });
      } catch {
        // 如果没有更改，忽略错误
      }
    }

    // 重置到检查点
    await this.execGit(["reset", "--hard", checkpoint.commitSha]);
  }

  /**
   * 获取检查点与当前状态的差异
   */
  async getCheckpointDiff(checkpointId: string): Promise<CheckpointDiff> {
    const checkpoint = await this.storage.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`未找到检查点: ${checkpointId}`);
    }

    // 获取 diff
    const diffResult = await this.execGit([
      "diff",
      checkpoint.commitSha,
      "HEAD",
      "--stat",
      "--name-status",
    ]);

    const files = this.parseDiffOutput(diffResult.stdout);
    const stats = {
      additions: 0,
      deletions: 0,
      filesChanged: files.length,
    };

    for (const file of files) {
      stats.additions += file.additions;
      stats.deletions += file.deletions;
    }

    return {
      toCheckpoint: checkpoint,
      files,
      stats,
    };
  }

  /**
   * 获取两个检查点之间的差异
   */
  async getDiffBetweenCheckpoints(
    fromId: string,
    toId: string
  ): Promise<CheckpointDiff> {
    const fromCheckpoint = await this.storage.get(fromId);
    const toCheckpoint = await this.storage.get(toId);

    if (!fromCheckpoint) {
      throw new Error(`未找到检查点: ${fromId}`);
    }
    if (!toCheckpoint) {
      throw new Error(`未找到检查点: ${toId}`);
    }

    const diffResult = await this.execGit([
      "diff",
      fromCheckpoint.commitSha,
      toCheckpoint.commitSha,
      "--stat",
      "--name-status",
    ]);

    const files = this.parseDiffOutput(diffResult.stdout);
    const stats = {
      additions: 0,
      deletions: 0,
      filesChanged: files.length,
    };

    for (const file of files) {
      stats.additions += file.additions;
      stats.deletions += file.deletions;
    }

    return {
      fromCheckpoint,
      toCheckpoint,
      files,
      stats,
    };
  }

  /**
   * 获取文件在检查点时的内容
   */
  async getFileAtCheckpoint(
    checkpointId: string,
    filePath: string
  ): Promise<string> {
    const checkpoint = await this.storage.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`未找到检查点: ${checkpointId}`);
    }

    const result = await this.execGit(["show", `${checkpoint.commitSha}:${filePath}`]);
    if (result.exitCode !== 0) {
      throw new Error(`无法获取文件内容: ${filePath}`);
    }

    return result.stdout;
  }

  /**
   * 获取所有检查点
   */
  async getAllCheckpoints(taskId?: string): Promise<Checkpoint[]> {
    return this.storage.getAll(taskId);
  }

  /**
   * 删除检查点
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    await this.storage.delete(checkpointId);
  }

  /**
   * 清空所有检查点
   */
  async clearCheckpoints(taskId?: string): Promise<void> {
    await this.storage.clear(taskId);
  }

  /**
   * 获取变更的文件列表
   */
  private async getChangedFiles(): Promise<string[]> {
    const result = await this.execGit(["diff", "--cached", "--name-only"]);
    return result.stdout
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
  }

  /**
   * 解析 diff 输出
   */
  private parseDiffOutput(output: string): FileDiff[] {
    const files: FileDiff[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      // 解析 --name-status 输出
      const match = line.match(/^([AMDRC])\t(.+?)(?:\t(.+))?$/);
      if (match) {
        const [, statusCode, filePath, newPath] = match;
        const status = this.parseStatusCode(statusCode);

        files.push({
          path: newPath || filePath,
          oldPath: newPath ? filePath : undefined,
          status,
          additions: 0,
          deletions: 0,
        });
      }
    }

    return files;
  }

  /**
   * 解析状态码
   */
  private parseStatusCode(
    code: string
  ): "added" | "modified" | "deleted" | "renamed" {
    switch (code) {
      case "A":
        return "added";
      case "M":
        return "modified";
      case "D":
        return "deleted";
      case "R":
      case "C":
        return "renamed";
      default:
        return "modified";
    }
  }

  /**
   * 解析统计信息
   */
  private parseStats(statOutput: string): { additions: number; deletions: number } {
    const match = statOutput.match(
      /(\d+)\s+insertions?\(\+\).*?(\d+)\s+deletions?\(-\)/
    );
    if (match) {
      return {
        additions: Number.parseInt(match[1]),
        deletions: Number.parseInt(match[2]),
      };
    }

    // 尝试只匹配 insertions
    const insertMatch = statOutput.match(/(\d+)\s+insertions?\(\+\)/);
    const deleteMatch = statOutput.match(/(\d+)\s+deletions?\(-\)/);

    return {
      additions: insertMatch ? Number.parseInt(insertMatch[1]) : 0,
      deletions: deleteMatch ? Number.parseInt(deleteMatch[1]) : 0,
    };
  }

  /**
   * 生成检查点 ID
   */
  private generateId(): string {
    return crypto.randomBytes(8).toString("hex");
  }

  /**
   * 执行 Git 命令
   */
  private async execGit(args: string[]): Promise<GitResult> {
    return new Promise((resolve) => {
      const { spawn } = require("node:child_process");
      const child = spawn("git", args, {
        cwd: this.workspaceRoot,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code: number) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      child.on("error", (err: Error) => {
        resolve({
          stdout: "",
          stderr: err.message,
          exitCode: 1,
        });
      });
    });
  }
}

/**
 * 内存存储实现（用于开发/测试）
 */
export class MemoryCheckpointStorage implements CheckpointStorage {
  private checkpoints = new Map<string, Checkpoint>();

  async save(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  async get(id: string): Promise<Checkpoint | undefined> {
    return this.checkpoints.get(id);
  }

  async getAll(taskId?: string): Promise<Checkpoint[]> {
    const all = Array.from(this.checkpoints.values());
    if (taskId) {
      return all.filter((c) => c.taskId === taskId);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  async delete(id: string): Promise<void> {
    this.checkpoints.delete(id);
  }

  async clear(taskId?: string): Promise<void> {
    if (taskId) {
      for (const [id, checkpoint] of this.checkpoints) {
        if (checkpoint.taskId === taskId) {
          this.checkpoints.delete(id);
        }
      }
    } else {
      this.checkpoints.clear();
    }
  }
}

/**
 * 文件存储实现
 */
export class FileCheckpointStorage implements CheckpointStorage {
  private storageUri: vscode.Uri;

  constructor(context: vscode.ExtensionContext) {
    this.storageUri = vscode.Uri.joinPath(
      context.globalStorageUri,
      "checkpoints.json"
    );
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    const checkpoints = await this.loadAll();
    checkpoints[checkpoint.id] = checkpoint;
    await this.saveAll(checkpoints);
  }

  async get(id: string): Promise<Checkpoint | undefined> {
    const checkpoints = await this.loadAll();
    return checkpoints[id];
  }

  async getAll(taskId?: string): Promise<Checkpoint[]> {
    const checkpoints = await this.loadAll();
    let all = Object.values(checkpoints);
    if (taskId) {
      all = all.filter((c) => c.taskId === taskId);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  async delete(id: string): Promise<void> {
    const checkpoints = await this.loadAll();
    delete checkpoints[id];
    await this.saveAll(checkpoints);
  }

  async clear(taskId?: string): Promise<void> {
    if (taskId) {
      const checkpoints = await this.loadAll();
      for (const id of Object.keys(checkpoints)) {
        if (checkpoints[id].taskId === taskId) {
          delete checkpoints[id];
        }
      }
      await this.saveAll(checkpoints);
    } else {
      await this.saveAll({});
    }
  }

  private async loadAll(): Promise<Record<string, Checkpoint>> {
    try {
      const content = await vscode.workspace.fs.readFile(this.storageUri);
      return JSON.parse(Buffer.from(content).toString("utf-8"));
    } catch {
      return {};
    }
  }

  private async saveAll(checkpoints: Record<string, Checkpoint>): Promise<void> {
    const dir = vscode.Uri.joinPath(this.storageUri, "..");
    await vscode.workspace.fs.createDirectory(dir);
    const content = Buffer.from(JSON.stringify(checkpoints, null, 2), "utf-8");
    await vscode.workspace.fs.writeFile(this.storageUri, content);
  }
}
