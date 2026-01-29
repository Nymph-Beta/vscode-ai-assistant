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

// 工具初始化辅助函数
import { ToolRegistry } from "./ToolRegistry";
import { ReadFileTool } from "./ReadFileTool";
import { WriteToFileTool } from "./WriteToFileTool";
import { ListFilesTool } from "./ListFilesTool";
import { SearchFilesTool } from "./SearchFilesTool";
import { ExecuteCommandTool } from "./ExecuteCommandTool";

/**
 * 创建并注册所有默认工具的注册表
 */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.registerAll([
    new ReadFileTool(),
    new WriteToFileTool(),
    new ListFilesTool(),
    new SearchFilesTool(),
    new ExecuteCommandTool(),
  ]);

  return registry;
}
