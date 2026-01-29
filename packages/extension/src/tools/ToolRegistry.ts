/**
 * 工具注册表
 * 管理所有可用工具的注册、查找和定义导出
 */

import type { BaseTool, OpenAIToolDefinition, ToolInput, ToolResult } from "./BaseTool";

export class ToolRegistry {
  private tools = new Map<string, BaseTool>();

  /**
   * 注册工具
   * @param tool 工具实例
   */
  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool "${tool.name}" is already registered, overwriting.`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 批量注册工具
   * @param tools 工具实例数组
   */
  registerAll(tools: BaseTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取工具
   * @param name 工具名称
   */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   * @param name 工具名称
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有已注册的工具
   */
  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取所有工具名称
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取 OpenAI 格式的工具定义列表
   * 用于发送给 AI API
   * @param allowedTools 可选，限制返回的工具列表
   */
  getToolDefinitions(allowedTools?: string[]): OpenAIToolDefinition[] {
    const tools = allowedTools
      ? Array.from(this.tools.values()).filter((t) => allowedTools.includes(t.name))
      : Array.from(this.tools.values());

    return tools.map((tool) => tool.getDefinition());
  }

  /**
   * 执行工具
   * @param name 工具名称
   * @param input 输入参数
   */
  async execute(name: string, input: ToolInput): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return {
        success: false,
        content: "",
        error: `Tool "${name}" not found`,
      };
    }

    try {
      return await tool.execute(input);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: "",
        error: `Tool execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * 移除工具
   * @param name 工具名称
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size;
  }
}

/** 全局工具注册表单例 */
export const toolRegistry = new ToolRegistry();
