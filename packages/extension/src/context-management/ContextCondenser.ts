/**
 * 上下文压缩器
 * 使用 LLM 总结对话历史
 */

import * as crypto from "node:crypto";
import type { ApiMessage } from "./types";
import { tokenCounter } from "./TokenCounter";

/** 压缩选项 */
export interface CondenseOptions {
  /** 创建摘要的函数 */
  summarize: (messages: ApiMessage[]) => Promise<string>;
  /** 最大保留的消息数 */
  maxMessagesToKeep?: number;
  /** 目标 token 数 */
  targetTokens?: number;
}

/** 压缩结果 */
export interface CondenseResult {
  /** 压缩后的消息 */
  messages: ApiMessage[];
  /** 压缩标记 ID */
  condenseMarkerId?: string;
  /** 摘要内容 */
  summary?: string;
  /** 压缩的消息数 */
  condensedCount: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 压缩对话历史
 * 非破坏性：标记消息的 condenseParent 而不是删除
 */
export async function condenseConversation(
  messages: ApiMessage[],
  options: CondenseOptions
): Promise<CondenseResult> {
  const { summarize, maxMessagesToKeep = 10 } = options;

  // 过滤掉已经压缩或截断的消息
  const activeMessages = messages.filter(
    (m) => !m.condenseParent && !m.truncationParent
  );

  if (activeMessages.length <= maxMessagesToKeep) {
    // 消息数量不足，不需要压缩
    return {
      messages: [...messages],
      condensedCount: 0,
    };
  }

  // 分离要保留的消息和要压缩的消息
  // 保留第一条（system）和最后几条消息
  const systemMessage = activeMessages.find((m) => m.role === "system");
  const nonSystemMessages = activeMessages.filter((m) => m.role !== "system");
  
  const keepCount = Math.max(maxMessagesToKeep - 1, 2);
  const toCondense = nonSystemMessages.slice(0, -keepCount);
  const toKeep = nonSystemMessages.slice(-keepCount);

  if (toCondense.length === 0) {
    return {
      messages: [...messages],
      condensedCount: 0,
    };
  }

  try {
    // 生成摘要
    const summary = await summarize(toCondense);
    const condenseMarkerId = crypto.randomBytes(8).toString("hex");

    // 构建新的消息列表
    const newMessages: ApiMessage[] = [];

    // 遍历原始消息，标记被压缩的消息
    for (const msg of messages) {
      // 已经被压缩或截断的消息，保持原样
      if (msg.condenseParent || msg.truncationParent) {
        newMessages.push(msg);
        continue;
      }

      // 检查是否是要压缩的消息
      if (toCondense.includes(msg)) {
        newMessages.push({
          ...msg,
          condenseParent: condenseMarkerId,
        });
      } else {
        newMessages.push(msg);
      }
    }

    // 在压缩位置插入摘要消息
    const condensedIndex = newMessages.findIndex(
      (m) => m.condenseParent === condenseMarkerId
    );

    if (condensedIndex >= 0) {
      const summaryMessage: ApiMessage = {
        id: condenseMarkerId,
        role: "assistant",
        content: `[对话摘要]\n${summary}\n\n[以上是之前 ${toCondense.length} 条消息的摘要]`,
      };

      // 插入到第一条被压缩的消息之前
      // 如果有 system 消息，摘要应该在 system 之后
      const insertIndex = systemMessage
        ? Math.max(condensedIndex, newMessages.indexOf(systemMessage) + 1)
        : condensedIndex;

      newMessages.splice(insertIndex, 0, summaryMessage);
    }

    return {
      messages: newMessages,
      condenseMarkerId,
      summary,
      condensedCount: toCondense.length,
    };
  } catch (error) {
    return {
      messages: [...messages],
      condensedCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 生成摘要提示
 */
export function generateSummaryPrompt(messages: ApiMessage[]): string {
  const conversation = messages
    .map((m) => {
      const role = m.role === "assistant" ? "AI" : m.role === "user" ? "用户" : m.role;
      const content = m.content || "";
      
      // 工具调用
      if (m.tool_calls) {
        const tools = m.tool_calls
          .map((tc) => `调用 ${tc.function.name}`)
          .join(", ");
        return `${role}: ${content}\n[工具调用: ${tools}]`;
      }
      
      return `${role}: ${content}`;
    })
    .join("\n\n");

  return `请总结以下对话的关键信息，保留重要的上下文和决策：

${conversation}

请提供一个简洁但完整的摘要，包括：
1. 主要讨论的问题或任务
2. 已完成的操作
3. 重要的决策和原因
4. 当前状态`;
}

/**
 * 恢复压缩的消息
 */
export function restoreCondensation(
  messages: ApiMessage[],
  condenseMarkerId: string
): ApiMessage[] {
  return messages
    .filter((m) => m.id !== condenseMarkerId) // 移除摘要消息
    .map((m) => {
      if (m.condenseParent === condenseMarkerId) {
        const { condenseParent, ...rest } = m;
        return rest;
      }
      return m;
    });
}
