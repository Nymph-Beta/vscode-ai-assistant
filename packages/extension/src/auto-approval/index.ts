/**
 * 自动批准模块
 * 参考 Roo-Code: src/core/auto-approval/index.ts
 */

import { isReadOnlyTool, isWriteTool, isExecuteTool, isCheckpointTool } from "./tools";

/**
 * 自动批准决策结果
 */
export type AutoApprovalDecision =
  | { decision: "approve" }
  | { decision: "deny" }
  | { decision: "ask" }
  | { decision: "timeout"; timeout: number };

/**
 * 自动批准配置状态
 */
export interface AutoApprovalState {
  /** 是否启用自动批准 */
  autoApprovalEnabled: boolean;
  /** 自动批准只读工具 */
  alwaysAllowReadOnly: boolean;
  /** 自动批准写入工具 */
  alwaysAllowWrite: boolean;
  /** 自动批准命令执行 */
  alwaysAllowExecute: boolean;
  /** 允许的命令列表（正则或前缀匹配） */
  allowedCommands: string[];
  /** 拒绝的命令列表（正则或前缀匹配） */
  deniedCommands: string[];
  /** 超时自动批准时间（毫秒），0 表示禁用 */
  autoApproveTimeoutMs: number;
}

/**
 * 获取默认的自动批准配置
 */
export function getDefaultAutoApprovalState(): AutoApprovalState {
  return {
    autoApprovalEnabled: false,
    alwaysAllowReadOnly: true,
    alwaysAllowWrite: false,
    alwaysAllowExecute: false,
    allowedCommands: [],
    deniedCommands: ["rm -rf", "sudo", "rm -r /", "mkfs", "dd if="],
    autoApproveTimeoutMs: 0,
  };
}

/**
 * 检查命令是否在允许/拒绝列表中
 */
function getCommandDecision(
  command: string,
  allowedCommands: string[],
  deniedCommands: string[]
): "auto_approve" | "auto_deny" | "ask" {
  const normalizedCommand = command.trim().toLowerCase();

  // 首先检查拒绝列表
  for (const denied of deniedCommands) {
    const pattern = denied.trim().toLowerCase();
    if (pattern && normalizedCommand.includes(pattern)) {
      return "auto_deny";
    }
  }

  // 然后检查允许列表
  for (const allowed of allowedCommands) {
    const pattern = allowed.trim().toLowerCase();
    if (pattern && normalizedCommand.startsWith(pattern)) {
      return "auto_approve";
    }
  }

  return "ask";
}

/**
 * 检查工具是否应该自动批准
 * 
 * @param state 自动批准配置状态
 * @param toolName 工具名称
 * @param args 工具参数
 * @returns 自动批准决策
 */
export function checkAutoApproval(
  state: AutoApprovalState,
  toolName: string,
  args: Record<string, unknown>
): AutoApprovalDecision {
  // 如果未启用自动批准，返回 ask（但支持超时）
  if (!state.autoApprovalEnabled) {
    if (state.autoApproveTimeoutMs > 0) {
      return { decision: "timeout", timeout: state.autoApproveTimeoutMs };
    }
    return { decision: "ask" };
  }

  // 检查点工具总是自动批准
  if (isCheckpointTool(toolName)) {
    return { decision: "approve" };
  }

  // 只读工具
  if (isReadOnlyTool(toolName)) {
    if (state.alwaysAllowReadOnly) {
      return { decision: "approve" };
    }
    return getTimeoutOrAsk(state);
  }

  // 写入工具
  if (isWriteTool(toolName)) {
    if (state.alwaysAllowWrite) {
      return { decision: "approve" };
    }
    return getTimeoutOrAsk(state);
  }

  // 命令执行工具
  if (isExecuteTool(toolName)) {
    if (state.alwaysAllowExecute) {
      const command = (args.command as string) || "";
      const decision = getCommandDecision(
        command,
        state.allowedCommands,
        state.deniedCommands
      );

      if (decision === "auto_approve") {
        return { decision: "approve" };
      }
      if (decision === "auto_deny") {
        return { decision: "deny" };
      }
    }
    return getTimeoutOrAsk(state);
  }

  // 其他工具默认询问
  return getTimeoutOrAsk(state);
}

/**
 * 根据配置返回超时或询问决策
 */
function getTimeoutOrAsk(state: AutoApprovalState): AutoApprovalDecision {
  if (state.autoApproveTimeoutMs > 0) {
    return { decision: "timeout", timeout: state.autoApproveTimeoutMs };
  }
  return { decision: "ask" };
}

// 导出工具分类函数
export { isReadOnlyTool, isWriteTool, isExecuteTool, isCheckpointTool } from "./tools";
export { READ_ONLY_TOOLS, WRITE_TOOLS, EXECUTE_TOOLS, CHECKPOINT_TOOLS } from "./tools";
