/**
 * 工具分类
 * 参考 Roo-Code: src/core/auto-approval/tools.ts
 */

/** 只读工具列表 */
export const READ_ONLY_TOOLS = [
  "read_file",
  "list_files",
  "search_files",
  "codebase_search",
] as const;

/** 写入工具列表 */
export const WRITE_TOOLS = [
  "write_to_file",
  "edit_file",
  "apply_diff",
] as const;

/** 命令执行工具 */
export const EXECUTE_TOOLS = [
  "execute_command",
] as const;

/** 检查点工具 */
export const CHECKPOINT_TOOLS = [
  "checkpoint",
] as const;

/**
 * 检查是否为只读工具
 */
export function isReadOnlyTool(toolName: string): boolean {
  return (READ_ONLY_TOOLS as readonly string[]).includes(toolName);
}

/**
 * 检查是否为写入工具
 */
export function isWriteTool(toolName: string): boolean {
  return (WRITE_TOOLS as readonly string[]).includes(toolName);
}

/**
 * 检查是否为命令执行工具
 */
export function isExecuteTool(toolName: string): boolean {
  return (EXECUTE_TOOLS as readonly string[]).includes(toolName);
}

/**
 * 检查是否为检查点工具
 */
export function isCheckpointTool(toolName: string): boolean {
  return (CHECKPOINT_TOOLS as readonly string[]).includes(toolName);
}
