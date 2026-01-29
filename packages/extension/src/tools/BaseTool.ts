/**
 * 工具系统基础类型和抽象类
 * 参考 Roo-Code 的工具系统设计
 */

/** 工具执行结果 */
export interface ToolResult {
  /** 是否执行成功 */
  success: boolean;
  /** 返回内容 */
  content: string;
  /** 错误信息（仅在失败时） */
  error?: string;
}

/** 工具输入参数基础类型 */
export interface ToolInput {
  [key: string]: unknown;
}

/** JSON Schema 属性定义 */
export interface JsonSchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}

/** 工具输入参数的 JSON Schema */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/** OpenAI 格式的工具定义 */
export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolInputSchema;
  };
}

/**
 * 工具基类
 * 所有具体工具都应继承此类
 */
export abstract class BaseTool<T extends ToolInput = ToolInput> {
  /** 工具名称（用于 AI 调用） */
  abstract readonly name: string;

  /** 工具描述（告诉 AI 这个工具的用途） */
  abstract readonly description: string;

  /** 输入参数的 JSON Schema */
  abstract readonly inputSchema: ToolInputSchema;

  /**
   * 执行工具
   * @param input 输入参数
   * @returns 执行结果
   */
  abstract execute(input: T): Promise<ToolResult>;

  /**
   * 获取 OpenAI 格式的工具定义
   * 用于发送给 AI API
   */
  getDefinition(): OpenAIToolDefinition {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.inputSchema,
      },
    };
  }

  /**
   * 创建成功结果
   */
  protected success(content: string): ToolResult {
    return { success: true, content };
  }

  /**
   * 创建失败结果
   */
  protected failure(error: string): ToolResult {
    return { success: false, content: "", error };
  }
}
