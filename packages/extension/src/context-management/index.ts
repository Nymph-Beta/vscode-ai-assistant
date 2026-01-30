/**
 * 上下文管理系统
 */

export * from "./types";
export * from "./TokenCounter";
export * from "./FileContextTracker";
export * from "./ConversationTruncator";
export * from "./ContextCondenser";

import type {
  ApiMessage,
  ContextConfig,
  ContextManagementResult,
  ContextState,
} from "./types";
import { DEFAULT_CONTEXT_CONFIG } from "./types";
import { tokenCounter } from "./TokenCounter";
import { truncateConversation, getEffectiveHistory } from "./ConversationTruncator";
import { condenseConversation, generateSummaryPrompt } from "./ContextCondenser";

/** 上下文管理选项 */
export interface ManageContextOptions {
  /** 消息列表 */
  messages: ApiMessage[];
  /** 配置 */
  config?: Partial<ContextConfig>;
  /** 摘要函数 (用于压缩) */
  summarize?: (messages: ApiMessage[]) => Promise<string>;
  /** 任务 ID */
  taskId?: string;
}

/**
 * 检查是否需要管理上下文
 */
export function needsContextManagement(
  messages: ApiMessage[],
  config: Partial<ContextConfig> = {}
): boolean {
  const fullConfig = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  const effectiveMessages = getEffectiveHistory(messages);
  
  return tokenCounter.isOverThreshold(
    effectiveMessages,
    fullConfig.contextWindow,
    fullConfig.condenseThreshold
  );
}

/**
 * 获取上下文状态
 */
export function getContextState(
  messages: ApiMessage[],
  config: Partial<ContextConfig> = {}
): ContextState {
  const fullConfig = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  const effectiveMessages = getEffectiveHistory(messages);
  const currentTokens = tokenCounter.countMessages(effectiveMessages);
  const usagePercent = (currentTokens / fullConfig.contextWindow) * 100;

  return {
    currentTokens,
    contextWindow: fullConfig.contextWindow,
    usagePercent,
    nearThreshold: usagePercent >= fullConfig.condenseThreshold - 10,
    filesRead: 0, // TODO: 从 FileContextTracker 获取
    filesEdited: 0,
  };
}

/**
 * 管理上下文
 * 根据配置自动压缩或截断对话
 */
export async function manageContext(
  options: ManageContextOptions
): Promise<ContextManagementResult> {
  const { messages, taskId = "" } = options;
  const config = { ...DEFAULT_CONTEXT_CONFIG, ...options.config };

  const effectiveMessages = getEffectiveHistory(messages);
  const tokensBefore = tokenCounter.countMessages(effectiveMessages);

  // 检查是否需要管理
  if (!needsContextManagement(messages, config)) {
    return {
      managed: false,
      action: "none",
      tokensBefore,
      tokensAfter: tokensBefore,
      messages,
    };
  }

  // 尝试压缩
  if (config.enableCondensation && options.summarize) {
    try {
      const result = await condenseConversation(messages, {
        summarize: options.summarize,
        maxMessagesToKeep: 10,
      });

      if (result.condensedCount > 0) {
        const tokensAfter = tokenCounter.countMessages(
          getEffectiveHistory(result.messages)
        );

        return {
          managed: true,
          action: "condensed",
          tokensBefore,
          tokensAfter,
          messages: result.messages,
        };
      }
    } catch (error) {
      console.warn("Condensation failed, falling back to truncation:", error);
    }
  }

  // 回退到截断
  const truncateResult = truncateConversation(
    messages,
    1 - config.truncationRetainRatio,
    taskId
  );

  if (truncateResult.removedCount > 0) {
    const tokensAfter = tokenCounter.countMessages(
      getEffectiveHistory(truncateResult.messages)
    );

    return {
      managed: true,
      action: "truncated",
      tokensBefore,
      tokensAfter,
      messages: truncateResult.messages,
    };
  }

  return {
    managed: false,
    action: "none",
    tokensBefore,
    tokensAfter: tokensBefore,
    messages,
  };
}
