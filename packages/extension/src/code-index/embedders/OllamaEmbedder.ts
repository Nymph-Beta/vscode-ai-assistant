/**
 * Ollama Embedder
 * 使用本地 Ollama 生成文本嵌入向量
 */

import type { IEmbedder } from "../types";

/** Ollama Embedder 配置 */
export interface OllamaEmbedderConfig {
  baseURL?: string;
  model?: string;
}

export class OllamaEmbedder implements IEmbedder {
  private baseURL: string;
  private model: string;
  private dimension: number;

  constructor(config: OllamaEmbedderConfig = {}) {
    this.baseURL = config.baseURL || "http://localhost:11434";
    this.model = config.model || "nomic-embed-text";
    this.dimension = 768; // 默认维度，会在验证时更新
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
    try {
      // 尝试生成一个测试嵌入来验证配置并获取维度
      const embeddings = await this.createEmbeddings(["test"]);
      if (embeddings.length > 0) {
        this.dimension = embeddings[0].length;
        return true;
      }
      return false;
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

    const results: number[][] = [];

    // Ollama 不支持批量嵌入，需要逐个处理
    for (const text of texts) {
      const response = await fetch(`${this.baseURL}/api/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API 错误 (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      results.push(data.embedding);
    }

    return results;
  }
}
