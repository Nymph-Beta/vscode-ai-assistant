/**
 * OpenAI Embedder
 * 使用 OpenAI API 生成文本嵌入向量
 */

import type { IEmbedder } from "../types";

/** OpenAI Embedder 配置 */
export interface OpenAIEmbedderConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

/** 模型维度映射 */
const MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

export class OpenAIEmbedder implements IEmbedder {
  private config: OpenAIEmbedderConfig;
  private model: string;
  private dimension: number;

  constructor(config: OpenAIEmbedderConfig) {
    this.config = config;
    this.model = config.model || "text-embedding-3-small";
    this.dimension = MODEL_DIMENSIONS[this.model] || 1536;
  }

  /**
   * 获取向量维度
   */
  getDimension(): number {
    return this.dimension;
  }

  /**
   * 验证配置
   */
  async validateConfiguration(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }

    try {
      // 尝试生成一个测试嵌入
      await this.createEmbeddings(["test"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建嵌入向量
   */
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const baseURL = this.config.baseURL || "https://api.openai.com/v1";
    const url = `${baseURL}/embeddings`;

    // 批量处理，避免超过 API 限制
    const batchSize = 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      // 预处理文本：截断过长的文本
      const processedBatch = batch.map((text) => {
        // OpenAI embedding 模型最大支持 8191 tokens
        // 简单估算：1 token ≈ 4 字符
        const maxChars = 8000 * 4;
        return text.length > maxChars ? text.slice(0, maxChars) : text;
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: processedBatch,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API 错误 (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as { data: { index: number; embedding: number[] }[] };
      
      // 按 index 排序确保顺序正确
      const sortedData = data.data.sort(
        (a: { index: number }, b: { index: number }) => a.index - b.index
      );
      
      for (const item of sortedData) {
        results.push(item.embedding);
      }
    }

    return results;
  }
}
