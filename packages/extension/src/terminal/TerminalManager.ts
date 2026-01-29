/**
 * 终端管理器
 * 提供命令执行能力，使用 Node.js child_process
 */

import * as vscode from "vscode";
import { exec, spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";

export interface CommandResult {
  /** 命令输出（stdout） */
  stdout: string;
  /** 错误输出（stderr） */
  stderr: string;
  /** 退出码 */
  exitCode: number;
  /** 是否超时 */
  timedOut: boolean;
}

export interface CommandOptions {
  /** 工作目录 */
  cwd?: string;
  /** 超时时间（毫秒），默认 30000 */
  timeout?: number;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 最大输出大小（字节），默认 1MB */
  maxBuffer?: number;
}

export class TerminalManager {
  private runningProcesses = new Map<string, ChildProcess>();
  private processCounter = 0;

  /**
   * 执行命令
   * @param command 要执行的命令
   * @param options 执行选项
   * @returns 命令执行结果
   */
  async executeCommand(command: string, options?: CommandOptions): Promise<CommandResult> {
    const cwd = this.resolveCwd(options?.cwd);
    const timeout = options?.timeout ?? 30000;
    const maxBuffer = options?.maxBuffer ?? 1024 * 1024; // 1MB

    console.log(`[TerminalManager] 执行命令: ${command}`);
    console.log(`[TerminalManager] 工作目录: ${cwd}`);

    return new Promise((resolve) => {
      const processId = `cmd_${++this.processCounter}`;

      const childProcess = exec(
        command,
        {
          cwd,
          timeout,
          maxBuffer,
          env: {
            ...process.env,
            ...options?.env,
            // 确保颜色输出被禁用，避免 ANSI 转义码
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
          shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
        },
        (error, stdout, stderr) => {
          this.runningProcesses.delete(processId);

          let exitCode = 0;
          let timedOut = false;

          if (error) {
            if (error.killed) {
              timedOut = true;
              exitCode = -1;
            } else {
              exitCode = error.code ?? 1;
            }
          }

          console.log(`[TerminalManager] 命令完成，退出码: ${exitCode}`);

          resolve({
            stdout: this.cleanOutput(stdout),
            stderr: this.cleanOutput(stderr),
            exitCode,
            timedOut,
          });
        }
      );

      if (childProcess) {
        this.runningProcesses.set(processId, childProcess);
      }
    });
  }

  /**
   * 执行命令并实时返回输出（流式）
   * @param command 要执行的命令
   * @param onOutput 输出回调
   * @param options 执行选项
   */
  async executeCommandStreaming(
    command: string,
    onOutput: (type: "stdout" | "stderr", data: string) => void,
    options?: CommandOptions
  ): Promise<CommandResult> {
    const cwd = this.resolveCwd(options?.cwd);
    const timeout = options?.timeout ?? 30000;

    console.log(`[TerminalManager] 流式执行命令: ${command}`);

    return new Promise((resolve) => {
      const processId = `cmd_${++this.processCounter}`;

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      // 解析命令和参数
      const { cmd, args } = this.parseCommand(command);

      const childProcess = spawn(cmd, args, {
        cwd,
        shell: true,
        env: {
          ...process.env,
          ...options?.env,
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
      });

      this.runningProcesses.set(processId, childProcess);

      // 设置超时
      const timeoutId = setTimeout(() => {
        timedOut = true;
        childProcess.kill("SIGTERM");
      }, timeout);

      childProcess.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        onOutput("stdout", text);
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        onOutput("stderr", text);
      });

      childProcess.on("close", (code) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(processId);

        resolve({
          stdout: this.cleanOutput(stdout),
          stderr: this.cleanOutput(stderr),
          exitCode: code ?? 0,
          timedOut,
        });
      });

      childProcess.on("error", (error) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(processId);

        resolve({
          stdout: this.cleanOutput(stdout),
          stderr: this.cleanOutput(`${stderr}\n${error.message}`),
          exitCode: 1,
          timedOut: false,
        });
      });
    });
  }

  /**
   * 终止所有运行中的进程
   */
  killAll(): void {
    for (const [id, process] of this.runningProcesses) {
      console.log(`[TerminalManager] 终止进程: ${id}`);
      process.kill("SIGTERM");
    }
    this.runningProcesses.clear();
  }

  /**
   * 获取运行中的进程数量
   */
  get runningCount(): number {
    return this.runningProcesses.size;
  }

  /**
   * 解析工作目录
   */
  private resolveCwd(cwd?: string): string {
    if (cwd && path.isAbsolute(cwd)) {
      return cwd;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return process.cwd();
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    return cwd ? path.join(workspaceRoot, cwd) : workspaceRoot;
  }

  /**
   * 解析命令字符串为命令和参数
   */
  private parseCommand(command: string): { cmd: string; args: string[] } {
    // 简单实现：在 Windows 上使用 cmd，其他系统使用 bash
    if (process.platform === "win32") {
      return { cmd: "cmd.exe", args: ["/c", command] };
    }
    return { cmd: "/bin/bash", args: ["-c", command] };
  }

  /**
   * 清理输出中的 ANSI 转义码
   */
  private cleanOutput(output: string): string {
    // 移除 ANSI 转义码
    // biome-ignore lint/suspicious/noControlCharactersInRegex: need to remove ANSI escape codes
    return output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
  }
}

/** 全局终端管理器单例 */
export const terminalManager = new TerminalManager();
