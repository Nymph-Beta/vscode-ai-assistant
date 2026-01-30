/**
 * AI 服务
 * 支持多供应商的统一 AI 服务接口
 */

import * as vscode from "vscode";
import type { ToolRegistry, OpenAIToolDefinition } from "./tools";
import {
  createProvider,
  type AIProvider,
  type ProviderType,
  type ProviderConfig,
  type ChatMessage,
  type ToolCall,
  type StreamChunk,
  type StreamResponse,
  type CreateMessageOptions,
} from "./providers";

// ============ 重新导出类型供其他模块使用 ============

export type {
  ChatMessage,
  ToolCall,
  StreamChunk as ApiStreamChunk,
  StreamResponse as ApiStream,
  ProviderType,
  ProviderConfig,
};

// ============ 服务配置 ============

export interface AiServiceConfig {
  provider: ProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  thinkTag: boolean;
  /** 额外选项 */
  options?: Record<string, unknown>;
}

// ============ AI 服务类 ============

export class AiService {
  private _provider?: AIProvider;
  private _config: AiServiceConfig;
  private _toolRegistry?: ToolRegistry;

  constructor(config?: AiServiceConfig) {
    this._config = config ?? this._loadConfig();
    this._initProvider();
  }

  /** 设置工具注册表 */
  public setToolRegistry(registry: ToolRegistry): void {
    this._toolRegistry = registry;
  }

  /** 从 VSCode 加载配置 */
  private _loadConfig(): AiServiceConfig {
    const config = vscode.workspace.getConfiguration("vscode-tools.ai");
    return {
      provider: config.get<ProviderType>("provider", "openai"),
      apiKey: config.get<string>("apiKey", ""),
      baseURL: config.get<string>("baseURL", "https://api.openai.com/v1"),
      model: config.get<string>("model", "gpt-4o-mini"),
      thinkTag: config.get<boolean>("thinkTag", false),
    };
  }

  /** 初始化 Provider */
  private _initProvider(): void {
    const providerConfig: ProviderConfig = {
      type: this._config.provider,
      apiKey: this._config.apiKey,
      baseURL: this._config.baseURL,
      model: this._config.model,
      options: this._config.options,
    };

    try {
      this._provider = createProvider(providerConfig);
      console.log(`[AiService] 已初始化 Provider: ${this._provider.name}`);
    } catch (error) {
      console.error("[AiService] 初始化 Provider 失败:", error);
    }
  }

  /** 刷新配置 */
  public refreshConfig(): void {
    this._config = this._loadConfig();
    this._initProvider();
  }

  /** 获取当前配置 */
  public getConfig(): AiServiceConfig {
    return this._config;
  }

  /** 获取工具注册表 */
  public getToolRegistry(): ToolRegistry | undefined {
    return this._toolRegistry;
  }

  /** 获取当前 Provider */
  public getProvider(): AIProvider | undefined {
    return this._provider;
  }

  /**
   * 创建消息流 (Generator 模式)
   * 逐块 yield StreamChunk，实现真正的流式输出
   */
  public async *createMessage(
    messages: ChatMessage[],
    options?: {
      tools?: OpenAIToolDefinition[];
      allowedTools?: string[];
      maxTokens?: number;
      temperature?: number;
    }
  ): StreamResponse {
    console.log("========== AI createMessage 开始 ==========");
    console.log("Provider:", this._provider?.name);
    console.log("Model:", this._config.model);

    if (!this._provider) {
      yield { type: "error", error: "Provider 未初始化" };
      return;
    }

    if (!this._config.apiKey) {
      yield { type: "error", error: "请先配置 API Key: 设置 → vscode-tools.ai.apiKey" };
      return;
    }

    // 获取工具定义
    let tools: OpenAIToolDefinition[] | undefined;
    if (options?.tools) {
      tools = options.tools;
    } else if (this._toolRegistry && this._toolRegistry.size > 0) {
      tools = this._toolRegistry.getToolDefinitions(options?.allowedTools);
    }

    // 构建创建消息选项
    const createOptions: CreateMessageOptions = {
      tools,
      allowedTools: options?.allowedTools,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    };

    console.log("工具数量:", tools?.length || 0);

    // 调用 Provider 创建消息
    try {
      for await (const chunk of this._provider.createMessage(messages, createOptions)) {
        yield chunk;
      }
    } catch (error) {
      console.error("[AiService] createMessage 错误:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    console.log("========== AI createMessage 结束 ==========");
  }

  /** 取消当前请求 */
  public abort(): void {
    this._provider?.abort();
  }

  /** 测试连接 */
  public async testConnection(): Promise<boolean> {
    if (!this._provider) {
      return false;
    }
    return this._provider.testConnection();
  }

  /** 获取可用模型列表 */
  public async getModels(): Promise<Array<{ id: string; name: string }>> {
    if (!this._provider) {
      return [];
    }
    try {
      const models = await this._provider.getModels();
      return models.map((m) => ({ id: m.id, name: m.name }));
    } catch {
      return [];
    }
  }
}

// ============ 单例导出 ============

export const aiService = new AiService();
