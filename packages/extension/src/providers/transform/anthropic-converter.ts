/**
 * OpenAI 到 Anthropic 格式转换器
 * 基于 Roo-Code 的实现
 */

/** OpenAI 工具定义 */
interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/** Anthropic 工具定义 */
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** OpenAI Tool Choice */
type OpenAIToolChoice = "none" | "auto" | "required" | { type: "function"; function: { name: string } };

/** Anthropic Tool Choice */
type AnthropicToolChoice =
  | { type: "auto"; disable_parallel_tool_use?: boolean }
  | { type: "any"; disable_parallel_tool_use?: boolean }
  | { type: "tool"; name: string; disable_parallel_tool_use?: boolean }
  | undefined;

/**
 * 将 OpenAI 工具定义转换为 Anthropic 格式
 */
export function convertOpenAIToolToAnthropic(tool: OpenAITool): AnthropicTool {
  if (tool.type !== "function") {
    throw new Error(`不支持的工具类型: ${tool.type}`);
  }

  return {
    name: tool.function.name,
    description: tool.function.description || "",
    input_schema: (tool.function.parameters as Record<string, unknown>) || { type: "object", properties: {} },
  };
}

/**
 * 批量转换工具
 */
export function convertOpenAIToolsToAnthropic(tools: OpenAITool[]): AnthropicTool[] {
  return tools.map(convertOpenAIToolToAnthropic);
}

/**
 * 将 OpenAI tool_choice 转换为 Anthropic 格式
 */
export function convertOpenAIToolChoiceToAnthropic(
  toolChoice: OpenAIToolChoice | undefined,
  parallelToolCalls?: boolean
): AnthropicToolChoice {
  const disableParallelToolUse = !parallelToolCalls;

  if (!toolChoice) {
    return { type: "auto", disable_parallel_tool_use: disableParallelToolUse };
  }

  if (typeof toolChoice === "string") {
    switch (toolChoice) {
      case "none":
        return undefined;
      case "auto":
        return { type: "auto", disable_parallel_tool_use: disableParallelToolUse };
      case "required":
        return { type: "any", disable_parallel_tool_use: disableParallelToolUse };
      default:
        return { type: "auto", disable_parallel_tool_use: disableParallelToolUse };
    }
  }

  if (typeof toolChoice === "object" && "function" in toolChoice) {
    return {
      type: "tool",
      name: toolChoice.function.name,
      disable_parallel_tool_use: disableParallelToolUse,
    };
  }

  return { type: "auto", disable_parallel_tool_use: disableParallelToolUse };
}
