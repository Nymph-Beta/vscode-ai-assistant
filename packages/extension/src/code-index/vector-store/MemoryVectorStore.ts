/**
 * 内存向量存储
 * 简单的内存实现，适用于小型代码库
 */

import type { IVectorStore, SearchResult, VectorPoint } from "../types";

export class MemoryVectorStore implements IVectorStore {
  private points = new Map<string, VectorPoint>();

  /**
   * 初始化
   */
  async initialize(): Promise<boolean> {
    return true;
  }

  /**
   * 插入/更新点
   */
  async upsertPoints(points: VectorPoint[]): Promise<void> {
    for (const point of points) {
      this.points.set(point.id, point);
    }
  }

  /**
   * 搜索
   */
  async search(
    queryVector: number[],
    limit: number,
    directoryPrefix?: string,
    minScore = 0.3
  ): Promise<SearchResult[]> {
    const results: Array<{ point: VectorPoint; score: number }> = [];

    for (const point of this.points.values()) {
      // 目录前缀过滤
      if (directoryPrefix) {
        const pathMatches = point.payload.pathSegments.some((segment, i) => {
          const prefixSegments = directoryPrefix.split("/").filter(Boolean);
          return prefixSegments.every(
            (prefix, j) => point.payload.pathSegments[j] === prefix
          );
        });
        if (!pathMatches && !point.payload.filePath.includes(directoryPrefix)) {
          continue;
        }
      }

      // 计算余弦相似度
      const score = this.cosineSimilarity(queryVector, point.vector);

      if (score >= minScore) {
        results.push({ point, score });
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    // 返回前 N 个结果
    return results.slice(0, limit).map(({ point, score }) => ({
      filePath: point.payload.filePath,
      score,
      startLine: point.payload.startLine,
      endLine: point.payload.endLine,
      codeChunk: point.payload.content,
      identifier: point.payload.identifier,
      type: point.payload.type,
    }));
  }

  /**
   * 删除点
   */
  async deletePoints(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.points.delete(id);
    }
  }

  /**
   * 清空
   */
  async clear(): Promise<void> {
    this.points.clear();
  }

  /**
   * 获取点数量
   */
  async getPointCount(): Promise<number> {
    return this.points.size;
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("向量维度不匹配");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }
}
