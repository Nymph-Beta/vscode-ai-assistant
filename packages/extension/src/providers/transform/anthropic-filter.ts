/**
 * Anthropic 消息过滤器
 * 过滤掉不被 Anthropic API 支持的内容块类型
 * 基于 Roo-Code 的实现
 */

/** 有效的 Anthropic 内容块类型 */
export const VALID_ANTHROPIC_BLOCK_TYPES = new Set([
  "text",
  "image",
  "tool_use",
  "tool_result",
  "thinking",
  "redacted_thinking",
  "document",
]);

/** Anthropic 消息 */
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

/** Anthropic 内容块 */
interface AnthropicContentBlock {
  type: string;
  [key: string]: unknown;
}

/**
 * 过滤消息中的非 Anthropic 标准内容块
 */
export function filterNonAnthropicBlocks(messages: AnthropicMessage[]): AnthropicMessage[] {
  return messages
    .map((message) => {
      // 字符串内容直接返回
      if (typeof message.content === "string") {
        return message;
      }

      // 过滤内容块
      const filteredContent = message.content.filter((block) => {
        const blockType = block.type;
        return VALID_ANTHROPIC_BLOCK_TYPES.has(blockType);
      });

      // 如果没有有效内容，返回 undefined
      if (filteredContent.length === 0) {
        return undefined;
      }

      return {
        ...message,
        content: filteredContent,
      };
    })
    .filter((message): message is AnthropicMessage => message !== undefined);
}

/**
 * 验证消息是否包含有效的 Anthropic 内容
 */
export function isValidAnthropicMessage(message: AnthropicMessage): boolean {
  if (typeof message.content === "string") {
    return message.content.length > 0;
  }

  return message.content.some((block) => VALID_ANTHROPIC_BLOCK_TYPES.has(block.type));
}

/**
 * 清理空消息
 */
export function removeEmptyMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  return messages.filter((message) => {
    if (typeof message.content === "string") {
      return message.content.trim().length > 0;
    }
    return message.content.length > 0;
  });
}
