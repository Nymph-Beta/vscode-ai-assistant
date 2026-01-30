/**
 * API 成本计算工具
 * 基于 Roo-Code 的实现
 */

import type { ModelInfo } from "./types";

/** 成本计算结果 */
export interface ApiCostResult {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

/**
 * 计算 Anthropic API 成本
 * 对于 Anthropic: inputTokens 不包含缓存的 tokens
 * 总输入 = 基础输入 + 缓存写入 + 缓存读取
 */
export function calculateApiCostAnthropic(
  modelInfo: ModelInfo,
  inputTokens: number,
  outputTokens: number,
  cacheCreationInputTokens?: number,
  cacheReadInputTokens?: number
): ApiCostResult {
  const cacheCreation = cacheCreationInputTokens || 0;
  const cacheRead = cacheReadInputTokens || 0;
  const totalInputTokens = inputTokens + cacheCreation + cacheRead;

  return calculateApiCostInternal(
    modelInfo,
    inputTokens,
    outputTokens,
    cacheCreation,
    cacheRead,
    totalInputTokens,
    outputTokens
  );
}

/**
 * 计算 OpenAI API 成本
 */
export function calculateApiCostOpenAI(
  modelInfo: ModelInfo,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens?: number
): ApiCostResult {
  const cached = cachedInputTokens || 0;
  const totalInputTokens = inputTokens; // OpenAI 的 inputTokens 已包含缓存

  // OpenAI 的缓存读取价格通常是输入价格的 50%
  const cacheReadsCost = cached > 0 ? ((modelInfo.inputPrice || 0) / 1_000_000) * cached * 0.5 : 0;
  const baseInputCost = ((modelInfo.inputPrice || 0) / 1_000_000) * (inputTokens - cached);
  const outputCost = ((modelInfo.outputPrice || 0) / 1_000_000) * outputTokens;

  return {
    totalInputTokens,
    totalOutputTokens: outputTokens,
    totalCost: cacheReadsCost + baseInputCost + outputCost,
  };
}

/**
 * 内部成本计算
 */
function calculateApiCostInternal(
  modelInfo: ModelInfo,
  inputTokens: number,
  outputTokens: number,
  cacheCreationInputTokens: number,
  cacheReadInputTokens: number,
  totalInputTokens: number,
  totalOutputTokens: number
): ApiCostResult {
  const cacheWritesCost = ((modelInfo.cacheWritesPrice || 0) / 1_000_000) * cacheCreationInputTokens;
  const cacheReadsCost = ((modelInfo.cacheReadsPrice || 0) / 1_000_000) * cacheReadInputTokens;
  const baseInputCost = ((modelInfo.inputPrice || 0) / 1_000_000) * inputTokens;
  const outputCost = ((modelInfo.outputPrice || 0) / 1_000_000) * outputTokens;
  const totalCost = cacheWritesCost + cacheReadsCost + baseInputCost + outputCost;

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCost,
  };
}

/**
 * 格式化成本显示
 */
export function formatCost(cost: number): string {
  if (cost >= 1) {
    return `$${cost.toFixed(2)}`;
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(3)}`;
  }
  if (cost >= 0.001) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(6)}`;
}

/**
 * 格式化 token 数量
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}
