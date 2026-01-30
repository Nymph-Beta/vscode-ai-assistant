/**
 * 对话截断器
 * 使用滑动窗口策略截断对话历史
 */

import * as crypto from "node:crypto";
import type { ApiMessage, TruncationResult } from "./types";

/**
 * 截断对话
 * 非破坏性：标记消息的 truncationParent 而不是删除
 * 
 * @param messages 消息列表
 * @param fracToRemove 要移除的比例 (0-1)
 * @param taskId 任务 ID (用于生成截断标记)
 */
export function truncateConversation(
  messages: ApiMessage[],
  fracToRemove = 0.5,
  taskId = ""
): TruncationResult {
  if (messages.length <= 2) {
    // 太少的消息，不截断
    return {
      messages: [...messages],
      removedCount: 0,
    };
  }

  // 过滤掉已经截断的消息
  const activeMessages = messages.filter(
    (m) => !m.truncationParent && !m.condenseParent
  );

  if (activeMessages.length <= 2) {
    return {
      messages: [...messages],
      removedCount: 0,
    };
  }

  // 计算要移除的消息数量
  // 始终保留第一条消息（通常是 system）和最后几条消息
  const preserveStart = 1; // 保留第一条
  const preserveEnd = Math.ceil(activeMessages.length * (1 - fracToRemove));
  
  const removeStart = preserveStart;
  const removeEnd = activeMessages.length - preserveEnd;
  
  if (removeEnd <= removeStart) {
    return {
      messages: [...messages],
      removedCount: 0,
    };
  }

  // 生成截断标记 ID
  const truncationMarkerId = crypto.randomBytes(8).toString("hex");

  // 标记要截断的消息
  const newMessages: ApiMessage[] = [];
  let removedCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // 已经被截断或压缩的消息，保持原样
    if (msg.truncationParent || msg.condenseParent) {
      newMessages.push(msg);
      continue;
    }

    // 检查是否在要移除的范围内
    const activeIndex = activeMessages.indexOf(msg);
    if (activeIndex >= removeStart && activeIndex < removeEnd) {
      // 标记为截断
      newMessages.push({
        ...msg,
        truncationParent: truncationMarkerId,
      });
      removedCount++;
    } else {
      newMessages.push(msg);
    }
  }

  // 在截断位置插入标记
  if (removedCount > 0) {
    const markerIndex = newMessages.findIndex(
      (m) => m.truncationParent === truncationMarkerId
    );
    
    if (markerIndex > 0) {
      // 插入一条标记消息，表明这里有截断
      const marker: ApiMessage = {
        id: truncationMarkerId,
        role: "system",
        content: `[${removedCount} 条消息已被截断以节省上下文空间]`,
      };
      newMessages.splice(markerIndex, 0, marker);
    }
  }

  return {
    messages: newMessages,
    truncationMarkerId: removedCount > 0 ? truncationMarkerId : undefined,
    removedCount,
  };
}

/**
 * 获取有效的 API 历史
 * 过滤掉被截断和被压缩的消息
 */
export function getEffectiveHistory(messages: ApiMessage[]): ApiMessage[] {
  return messages.filter(
    (m) => !m.truncationParent && !m.condenseParent
  );
}

/**
 * 恢复截断的消息
 * 移除 truncationParent 标记
 */
export function restoreTruncation(
  messages: ApiMessage[],
  truncationMarkerId: string
): ApiMessage[] {
  return messages
    .filter((m) => m.id !== truncationMarkerId) // 移除标记消息
    .map((m) => {
      if (m.truncationParent === truncationMarkerId) {
        const { truncationParent, ...rest } = m;
        return rest;
      }
      return m;
    });
}

/**
 * 清理孤立的截断标记
 * 当父消息不存在时，移除相关的截断标记
 */
export function cleanupOrphanedTruncations(messages: ApiMessage[]): ApiMessage[] {
  // 收集所有截断标记 ID
  const markerIds = new Set<string>();
  const usedMarkerIds = new Set<string>();

  for (const msg of messages) {
    if (msg.id && msg.role === "system" && msg.content?.includes("已被截断")) {
      markerIds.add(msg.id);
    }
    if (msg.truncationParent) {
      usedMarkerIds.add(msg.truncationParent);
    }
  }

  // 移除没有被使用的标记
  return messages.filter((m) => {
    if (m.id && markerIds.has(m.id) && !usedMarkerIds.has(m.id)) {
      return false;
    }
    return true;
  });
}
