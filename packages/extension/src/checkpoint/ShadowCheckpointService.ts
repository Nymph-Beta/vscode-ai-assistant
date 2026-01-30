/**
 * Shadow Git Checkpoint Service
 * 使用独立的 shadow Git 仓库存储检查点
 * 基于 Roo-Code 的实现
 */

import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Checkpoint, CheckpointDiff, FileDiff } from "./types";

/** Git 命令执行结果 */
interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Checkpoint 事件 */
export interface CheckpointEvent {
  fromHash?: string;
  toHash: string;
  suppressMessage?: boolean;
}

/** Diff 模式 */
export type DiffMode = "from-init" | "checkpoint" | "to-current" | "full";

/** 默认的 exclude 模式 */
const DEFAULT_EXCLUDE_PATTERNS = [
  // Build artifacts
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  ".nuxt/",
  "__pycache__/",
  "*.pyc",
  "target/",
  "bin/",
  "obj/",
  
  // IDE
  ".idea/",
  ".vscode/",
  "*.swp",
  "*.swo",
  
  // Media files
  "*.jpg",
  "*.jpeg",
  "*.png",
  "*.gif",
  "*.mp4",
  "*.mp3",
  "*.wav",
  "*.pdf",
  
  // Cache
  ".cache/",
  "*.cache",
  ".turbo/",
  
  // Logs
  "*.log",
  "npm-debug.log*",
  
  // Lock files (optional - might want to track these)
  // "package-lock.json",
  // "pnpm-lock.yaml",
  // "yarn.lock",
];

/**
 * Shadow Git 环境
 * 移除可能干扰 shadow repo 操作的 Git 环境变量
 */
function createSanitizedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const excludeVars = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CEILING_DIRECTORIES",
  ];

  for (const [key, value] of Object.entries(process.env)) {
    if (!excludeVars.includes(key) && value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

/**
 * Shadow Checkpoint Service
 * 使用独立的 Git 仓库存储检查点，与工作区 Git 隔离
 */
export class ShadowCheckpointService extends EventEmitter {
  protected workspaceDir: string;
  protected checkpointsDir: string;
  protected dotGitDir: string;
  protected baseHash: string | undefined;
  private sanitizedEnv: Record<string, string>;
  private checkpoints: string[] = [];
  private log: (message: string) => void;

  constructor(
    workspaceDir: string,
    checkpointsDir: string,
    log?: (message: string) => void
  ) {
    super();
    this.workspaceDir = workspaceDir;
    this.checkpointsDir = checkpointsDir;
    this.dotGitDir = path.join(checkpointsDir, ".git");
    this.sanitizedEnv = createSanitizedEnv();
    this.log = log || console.log;
  }

  /**
   * 初始化 Shadow Git 仓库
   */
  async initShadowGit(): Promise<void> {
    // 确保目录存在
    await fs.mkdir(this.checkpointsDir, { recursive: true });

    // 检查是否已初始化
    try {
      await fs.access(this.dotGitDir);
      // 已存在，加载 base hash
      const result = await this.execGit(["rev-list", "--max-parents=0", "HEAD"]);
      if (result.exitCode === 0) {
        this.baseHash = result.stdout.trim();
        await this.loadCheckpoints();
        this.emit("initialize", { baseHash: this.baseHash });
        return;
      }
    } catch {
      // 不存在，继续初始化
    }

    // 初始化新的 Git 仓库
    await this.execGit(["init"]);

    // 配置 core.worktree 指向工作区
    await this.execGit(["config", "core.worktree", this.workspaceDir]);
    
    // 禁用 GPG 签名
    await this.execGit(["config", "commit.gpgSign", "false"]);
    
    // 设置用户信息
    await this.execGit(["config", "user.name", "VSCode Tools"]);
    await this.execGit(["config", "user.email", "noreply@vscode-tools.local"]);

    // 写入 exclude 文件
    await this.writeExcludeFile();

    // 暂存所有文件
    await this.stageAll();

    // 创建初始 commit
    const result = await this.execGit(["commit", "-m", "initial commit", "--allow-empty"]);
    if (result.exitCode !== 0) {
      throw new Error(`初始化失败: ${result.stderr}`);
    }

    // 获取 base hash
    const hashResult = await this.execGit(["rev-parse", "HEAD"]);
    this.baseHash = hashResult.stdout.trim();
    this.checkpoints = [this.baseHash];

    this.emit("initialize", { baseHash: this.baseHash });
    this.log(`Shadow Git 初始化完成: ${this.baseHash}`);
  }

  /**
   * 写入 exclude 文件
   */
  protected async writeExcludeFile(): Promise<void> {
    const excludeDir = path.join(this.dotGitDir, "info");
    await fs.mkdir(excludeDir, { recursive: true });

    // 读取工作区的 .gitignore
    const patterns = [...DEFAULT_EXCLUDE_PATTERNS];
    try {
      const gitignore = await fs.readFile(path.join(this.workspaceDir, ".gitignore"), "utf-8");
      patterns.push(...gitignore.split("\n").filter((line) => line.trim() && !line.startsWith("#")));
    } catch {
      // .gitignore 不存在
    }

    const excludeFile = path.join(excludeDir, "exclude");
    await fs.writeFile(excludeFile, patterns.join("\n"));
  }

  /**
   * 暂存所有文件
   */
  protected async stageAll(): Promise<void> {
    await this.execGit(["add", "-A"]);
  }

  /**
   * 加载已有的 checkpoints
   */
  private async loadCheckpoints(): Promise<void> {
    const result = await this.execGit(["rev-list", "--all", "--reverse"]);
    if (result.exitCode === 0) {
      this.checkpoints = result.stdout.trim().split("\n").filter(Boolean);
    }
  }

  /**
   * 创建检查点
   */
  async saveCheckpoint(options: { suppressMessage?: boolean } = {}): Promise<string> {
    // 暂存所有更改
    await this.stageAll();

    // 检查是否有更改
    const status = await this.execGit(["status", "--porcelain"]);
    if (!status.stdout.trim()) {
      // 没有更改，返回当前 hash
      const current = await this.execGit(["rev-parse", "HEAD"]);
      return current.stdout.trim();
    }

    const fromHash = this.checkpoints[this.checkpoints.length - 1];

    // 创建 commit
    const timestamp = new Date().toISOString();
    const result = await this.execGit(["commit", "-m", `checkpoint: ${timestamp}`]);
    if (result.exitCode !== 0) {
      throw new Error(`创建检查点失败: ${result.stderr}`);
    }

    // 获取新的 hash
    const hashResult = await this.execGit(["rev-parse", "HEAD"]);
    const toHash = hashResult.stdout.trim();

    this.checkpoints.push(toHash);

    // 发送事件
    this.emit("checkpoint", {
      fromHash,
      toHash,
      suppressMessage: options.suppressMessage,
    } as CheckpointEvent);

    this.log(`检查点已创建: ${toHash}`);
    return toHash;
  }

  /**
   * 恢复到检查点
   */
  async restoreCheckpoint(commitHash: string): Promise<void> {
    // 验证 hash 存在
    const verifyResult = await this.execGit(["cat-file", "-t", commitHash]);
    if (verifyResult.exitCode !== 0) {
      throw new Error(`无效的检查点: ${commitHash}`);
    }

    // 硬重置到目标 commit
    const result = await this.execGit(["reset", "--hard", commitHash]);
    if (result.exitCode !== 0) {
      throw new Error(`恢复检查点失败: ${result.stderr}`);
    }

    // 更新检查点列表
    const idx = this.checkpoints.indexOf(commitHash);
    if (idx !== -1) {
      this.checkpoints = this.checkpoints.slice(0, idx + 1);
    }

    this.log(`已恢复到检查点: ${commitHash}`);
  }

  /**
   * 获取所有检查点
   */
  getCheckpoints(): string[] {
    return [...this.checkpoints];
  }

  /**
   * 获取 diff
   */
  async getDiff(options: {
    from?: string;
    to?: string;
    mode?: DiffMode;
  }): Promise<CheckpointDiff> {
    let { from, to } = options;
    const mode = options.mode || "to-current";

    // 根据模式确定 from 和 to
    switch (mode) {
      case "from-init":
        from = this.checkpoints[0];
        // to 保持不变
        break;
      case "checkpoint": {
        // 从选定 checkpoint 到下一个
        const idx = from ? this.checkpoints.indexOf(from) : -1;
        if (idx !== -1 && idx < this.checkpoints.length - 1) {
          to = this.checkpoints[idx + 1];
        }
        break;
      }
      case "to-current":
        // from 保持不变，to = undefined 表示当前工作区
        to = undefined;
        break;
      case "full":
        from = this.checkpoints[0];
        to = undefined;
        break;
    }

    // 如果没有 from，使用第一个 commit
    if (!from) {
      from = this.checkpoints[0] || this.baseHash;
    }

    // 暂存当前更改以便 diff 显示未跟踪的文件
    await this.stageAll();

    // 获取 diff 概要
    const diffArgs = to ? [`${from}..${to}`] : [from];
    const diffResult = await this.execGit(["diff", ...diffArgs, "--name-status"]);

    const files: FileDiff[] = [];
    for (const line of diffResult.stdout.split("\n")) {
      if (!line.trim()) continue;
      const match = line.match(/^([AMDRC])\t(.+?)(?:\t(.+))?$/);
      if (match) {
        const [, statusCode, filePath, newPath] = match;
        files.push({
          path: newPath || filePath,
          oldPath: newPath ? filePath : undefined,
          status: this.parseStatusCode(statusCode),
          additions: 0,
          deletions: 0,
        });
      }
    }

    // 获取 stat 信息
    const statResult = await this.execGit(["diff", ...diffArgs, "--stat"]);
    const stats = this.parseStats(statResult.stdout);

    return {
      files,
      stats: {
        ...stats,
        filesChanged: files.length,
      },
    };
  }

  /**
   * 获取文件在某个检查点时的内容
   */
  async getFileAtCheckpoint(commitHash: string, filePath: string): Promise<string> {
    const result = await this.execGit(["show", `${commitHash}:${filePath}`]);
    if (result.exitCode !== 0) {
      throw new Error(`无法获取文件内容: ${filePath}`);
    }
    return result.stdout;
  }

  /**
   * 获取当前检查点的 hash
   */
  async getCurrentHash(): Promise<string> {
    const result = await this.execGit(["rev-parse", "HEAD"]);
    return result.stdout.trim();
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    this.removeAllListeners();
  }

  /**
   * 解析状态码
   */
  private parseStatusCode(code: string): FileDiff["status"] {
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
   * 解析 stat 输出
   */
  private parseStats(statOutput: string): { additions: number; deletions: number } {
    const insertMatch = statOutput.match(/(\d+)\s+insertions?\(\+\)/);
    const deleteMatch = statOutput.match(/(\d+)\s+deletions?\(-\)/);

    return {
      additions: insertMatch ? Number.parseInt(insertMatch[1]) : 0,
      deletions: deleteMatch ? Number.parseInt(deleteMatch[1]) : 0,
    };
  }

  /**
   * 执行 Git 命令
   */
  protected async execGit(args: string[]): Promise<GitResult> {
    return new Promise((resolve) => {
      const child = spawn("git", args, {
        cwd: this.checkpointsDir,
        env: this.sanitizedEnv,
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
