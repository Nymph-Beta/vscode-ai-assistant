/**
 * 工具系统导出
 */

export * from "./BaseTool";
export * from "./ToolRegistry";

// 具体工具
export * from "./ReadFileTool";
export * from "./WriteToFileTool";
export * from "./ListFilesTool";
export * from "./SearchFilesTool";
export * from "./ExecuteCommandTool";
export * from "./EditFileTool";
export * from "./ApplyDiffTool";
export * from "./CheckpointTool";
export * from "./CodebaseSearchTool";

// 工具初始化辅助函数
import { ToolRegistry } from "./ToolRegistry";
import { ReadFileTool } from "./ReadFileTool";
import { WriteToFileTool } from "./WriteToFileTool";
import { ListFilesTool } from "./ListFilesTool";
import { SearchFilesTool } from "./SearchFilesTool";
import { ExecuteCommandTool } from "./ExecuteCommandTool";
import { EditFileTool } from "./EditFileTool";
import { ApplyDiffTool } from "./ApplyDiffTool";
import { CheckpointTool } from "./CheckpointTool";
import { CodebaseSearchTool } from "./CodebaseSearchTool";
import type { CheckpointManager } from "../checkpoint";
import type { CodeIndexManager } from "../code-index";

/** 工具注册选项 */
export interface ToolRegistryOptions {
  checkpointManager?: CheckpointManager;
  codeIndexManager?: CodeIndexManager;
}

/**
 * 创建并注册所有默认工具的注册表
 * @param options 可选的管理器实例
 */
export function createDefaultToolRegistry(options?: ToolRegistryOptions): ToolRegistry {
  const registry = new ToolRegistry();

  registry.registerAll([
    new ReadFileTool(),
    new WriteToFileTool(),
    new ListFilesTool(),
    new SearchFilesTool(),
    new ExecuteCommandTool(),
    new EditFileTool(),
    new ApplyDiffTool(),
  ]);

  // 如果提供了检查点管理器，注册检查点工具
  if (options?.checkpointManager) {
    const checkpointTool = new CheckpointTool();
    checkpointTool.setCheckpointManager(options.checkpointManager);
    registry.register(checkpointTool);
  }

  // 如果提供了代码索引管理器，注册搜索工具
  if (options?.codeIndexManager) {
    const searchTool = new CodebaseSearchTool();
    searchTool.setIndexManager(options.codeIndexManager);
    registry.register(searchTool);
  }

  return registry;
}
