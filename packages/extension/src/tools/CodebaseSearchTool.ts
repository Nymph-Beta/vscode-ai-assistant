/**
 * 代码库搜索工具
 * 使用语义搜索在代码库中查找相关代码
 */

import { BaseTool, type ToolInput, type ToolInputSchema, type ToolResult } from "./BaseTool";
import type { CodeIndexManager } from "../code-index";

export interface CodebaseSearchInput extends ToolInput {
  /** 搜索查询 */
  query: string;
  /** 目录前缀（可选，用于限制搜索范围） */
  path?: string;
}

export class CodebaseSearchTool extends BaseTool<CodebaseSearchInput> {
  readonly name = "codebase_search";
  readonly description = `在代码库中进行语义搜索，查找与查询相关的代码片段。

适用场景：
- 查找实现某个功能的代码
- 搜索相关的函数、类或模块
- 了解代码库中某个概念的使用方式

参数：
- query: 搜索查询，描述你要查找的内容
- path: 可选，限制搜索到特定目录

返回：
- 相关的代码片段列表，包含文件路径、行号和代码内容`;

  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索查询，描述你要查找的代码内容",
      },
      path: {
        type: "string",
        description: "可选的目录路径前缀，用于限制搜索范围",
      },
    },
    required: ["query"],
  };

  private indexManager: CodeIndexManager | undefined;

  /**
   * 设置代码索引管理器
   */
  setIndexManager(manager: CodeIndexManager): void {
    this.indexManager = manager;
  }

  async execute(input: CodebaseSearchInput): Promise<ToolResult> {
    if (!this.indexManager) {
      return this.failure("代码索引未初始化。请先启用代码索引功能。");
    }

    const state = this.indexManager.getState();
    if (!state.initialized) {
      return this.failure("代码索引未初始化。请先运行索引命令。");
    }

    if (state.totalBlocks === 0) {
      return this.failure("代码索引为空。请先索引工作区。");
    }

    try {
      const results = await this.indexManager.search(input.query, input.path);

      if (results.length === 0) {
        return this.success(
          `未找到与 "${input.query}" 相关的代码。
提示：尝试使用不同的关键词或更具体的描述。`
        );
      }

      // 格式化结果
      const formattedResults = results.map((result, index) => {
        const header = `[${index + 1}] ${result.filePath}:${result.startLine}-${result.endLine}`;
        const score = `相关度: ${(result.score * 100).toFixed(1)}%`;
        const identifier = result.identifier !== `chunk_${result.startLine}` 
          ? `标识符: ${result.identifier} (${result.type})`
          : "";
        
        return [
          header,
          score,
          identifier,
          "```",
          result.codeChunk,
          "```",
        ].filter(Boolean).join("\n");
      });

      return this.success(
        `找到 ${results.length} 个相关结果：\n\n${formattedResults.join("\n\n---\n\n")}`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failure(`搜索失败: ${errorMessage}`);
    }
  }
}
