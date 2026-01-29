/**
 * 执行命令工具
 * 允许 AI 在终端执行命令
 */

import { BaseTool, type ToolInput, type ToolInputSchema, type ToolResult } from "./BaseTool";
import { terminalManager } from "../terminal";

export interface ExecuteCommandInput extends ToolInput {
  /** 要执行的命令 */
  command: string;
  /** 工作目录（相对于工作区根目录或绝对路径） */
  cwd?: string;
  /** 超时时间（秒），默认 30 */
  timeout?: number;
}

// 危险命令黑名单
const DANGEROUS_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "rm -rf ~",
  "dd if=",
  "mkfs",
  ":(){ :|:& };:",
  "> /dev/sda",
  "chmod -R 777 /",
  "chown -R",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "init 0",
  "init 6",
];

// 需要谨慎的命令模式
const CAUTION_PATTERNS = [
  /rm\s+(-[rf]+\s+)?[^\s]+/i,
  /sudo\s+/i,
  /chmod\s+/i,
  /chown\s+/i,
  /mv\s+[^\s]+\s+\/(?!home|tmp|var)/i,
  />\s*\/[^\s]+/i, // 重定向到根目录下的文件
];

export class ExecuteCommandTool extends BaseTool<ExecuteCommandInput> {
  readonly name = "execute_command";
  readonly description =
    "在终端执行 shell 命令。用于运行构建命令、测试、安装依赖等操作。" +
    "请注意：某些危险命令会被阻止执行。命令输出会被返回，包括 stdout 和 stderr。";

  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "要执行的 shell 命令",
      },
      cwd: {
        type: "string",
        description: "命令执行的工作目录，可以是相对于工作区的相对路径或绝对路径。不指定则使用工作区根目录",
      },
      timeout: {
        type: "number",
        description: "命令超时时间（秒），默认 30 秒",
      },
    },
    required: ["command"],
  };

  async execute(input: ExecuteCommandInput): Promise<ToolResult> {
    const { command, cwd, timeout } = input;

    // 安全检查：危险命令
    const dangerCheck = this.checkDangerousCommand(command);
    if (dangerCheck) {
      return this.failure(`安全限制：${dangerCheck}`);
    }

    // 警告：谨慎命令
    const cautionCheck = this.checkCautionCommand(command);

    try {
      console.log(`[ExecuteCommandTool] 执行: ${command}`);

      const result = await terminalManager.executeCommand(command, {
        cwd,
        timeout: (timeout ?? 30) * 1000,
      });

      // 构建输出
      const parts: string[] = [];

      if (cautionCheck) {
        parts.push(`⚠️ 警告: ${cautionCheck}\n`);
      }

      parts.push(`命令: ${command}`);
      if (cwd) {
        parts.push(`工作目录: ${cwd}`);
      }
      parts.push(`退出码: ${result.exitCode}`);

      if (result.timedOut) {
        parts.push(`⏱️ 命令执行超时（${timeout ?? 30}秒）`);
      }

      parts.push("─".repeat(50));

      if (result.stdout) {
        parts.push("stdout:");
        parts.push(this.truncateOutput(result.stdout, 10000));
      }

      if (result.stderr) {
        parts.push("\nstderr:");
        parts.push(this.truncateOutput(result.stderr, 5000));
      }

      if (!result.stdout && !result.stderr) {
        parts.push("(无输出)");
      }

      const success = result.exitCode === 0 && !result.timedOut;
      return success
        ? this.success(parts.join("\n"))
        : this.failure(parts.join("\n"));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failure(`命令执行失败: ${errorMessage}`);
    }
  }

  /**
   * 检查是否是危险命令
   */
  private checkDangerousCommand(command: string): string | null {
    const normalizedCommand = command.toLowerCase().trim();

    for (const dangerous of DANGEROUS_COMMANDS) {
      if (normalizedCommand.includes(dangerous.toLowerCase())) {
        return `检测到危险命令模式: "${dangerous}"`;
      }
    }

    // 检查是否尝试删除根目录或重要系统目录
    if (/rm\s+(-[rf]+\s+)?\/($|\s|;)/.test(normalizedCommand)) {
      return "禁止删除根目录";
    }

    return null;
  }

  /**
   * 检查是否是需要谨慎的命令
   */
  private checkCautionCommand(command: string): string | null {
    for (const pattern of CAUTION_PATTERNS) {
      if (pattern.test(command)) {
        if (/sudo/.test(command)) {
          return "此命令使用了 sudo，可能需要管理员权限";
        }
        if (/rm/.test(command)) {
          return "此命令包含删除操作，请确认目标正确";
        }
        if (/chmod|chown/.test(command)) {
          return "此命令会修改文件权限/所有者";
        }
        return "此命令可能有风险，请确认";
      }
    }
    return null;
  }

  /**
   * 截断过长的输出
   */
  private truncateOutput(output: string, maxLength: number): string {
    if (output.length <= maxLength) {
      return output;
    }

    const halfLength = Math.floor(maxLength / 2) - 50;
    const start = output.substring(0, halfLength);
    const end = output.substring(output.length - halfLength);

    return `${start}\n\n... [输出已截断，省略 ${output.length - maxLength} 字符] ...\n\n${end}`;
  }
}
