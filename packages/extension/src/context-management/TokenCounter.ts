/**
 * Token 计数器
 * 用于估算消息的 token 数量
 */

import type { ApiMessage } from "./types";

/**
 * 简单的 token 估算
 * 使用启发式方法估算，适用于大多数情况
 * 准确度约为 ±10%
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // 基于字符的估算
  // 英文: ~4 字符/token
  // 中文: ~1.5 字符/token
  // 代码: ~3 字符/token

  // 统计不同类型的字符
  let englishChars = 0;
  let chineseChars = 0;
  let codeChars = 0;
  let otherChars = 0;

  for (const char of text) {
    const code = char.charCodeAt(0);

    if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK 字符
      chineseChars++;
    } else if (/[a-zA-Z]/.test(char)) {
      englishChars++;
    } else if (/[0-9\[\]{}()<>\/\\=+\-*&|^%$#@!~`]/.test(char)) {
      codeChars++;
    } else {
      otherChars++;
    }
  }

  // 计算估算 token 数
  const tokens =
    englishChars / 4 +
    chineseChars / 1.5 +
    codeChars / 3 +
    otherChars / 4;

  // 添加 10% 的缓冲
  return Math.ceil(tokens * 1.1);
}

/**
 * 计算消息的 token 数
 */
export function countMessageTokens(message: ApiMessage): number {
  let tokens = 0;

  // 角色标记 (~4 tokens)
  tokens += 4;

  // 内容
  if (message.content) {
    tokens += estimateTokens(message.content);
  }

  // 工具调用
  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      tokens += estimateTokens(tc.function.name);
      tokens += estimateTokens(tc.function.arguments);
      tokens += 10; // 结构开销
    }
  }

  // 工具结果
  if (message.tool_call_id) {
    tokens += estimateTokens(message.tool_call_id);
    tokens += 5; // 结构开销
  }

  return tokens;
}

/**
 * 计算消息列表的总 token 数
 */
export function countTotalTokens(messages: ApiMessage[]): number {
  return messages.reduce((total, msg) => total + countMessageTokens(msg), 0);
}

/**
 * Token 计数器类
 */
export class TokenCounter {
  private cache = new Map<string, number>();

  /**
   * 估算文本的 token 数
   */
  estimate(text: string): number {
    // 使用缓存
    const cached = this.cache.get(text);
    if (cached !== undefined) {
      return cached;
    }

    const tokens = estimateTokens(text);

    // 只缓存较短的文本
    if (text.length < 10000) {
      this.cache.set(text, tokens);
    }

    return tokens;
  }

  /**
   * 计算消息的 token 数
   */
  countMessage(message: ApiMessage): number {
    // 如果消息已有缓存的 token 数，直接返回
    if (message.tokens !== undefined) {
      return message.tokens;
    }

    const tokens = countMessageTokens(message);
    message.tokens = tokens;
    return tokens;
  }

  /**
   * 计算消息列表的总 token 数
   */
  countMessages(messages: ApiMessage[]): number {
    return messages.reduce((total, msg) => total + this.countMessage(msg), 0);
  }

  /**
   * 检查是否超过阈值
   */
  isOverThreshold(
    messages: ApiMessage[],
    contextWindow: number,
    thresholdPercent: number
  ): boolean {
    const tokens = this.countMessages(messages);
    const threshold = contextWindow * (thresholdPercent / 100);
    return tokens >= threshold;
  }

  /**
   * 获取上下文使用百分比
   */
  getUsagePercent(messages: ApiMessage[], contextWindow: number): number {
    const tokens = this.countMessages(messages);
    return (tokens / contextWindow) * 100;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// 单例
export const tokenCounter = new TokenCounter();
