/**
 * AI Provider 基类
 */

import type {
  AIProvider,
  ChatMessage,
  CreateMessageOptions,
  ModelInfo,
  ProviderConfig,
  ProviderType,
  StreamResponse,
} from "./types";

/**
 * Provider 基类
 */
export abstract class BaseProvider implements AIProvider {
  abstract readonly type: ProviderType;
  abstract readonly name: string;

  protected config: ProviderConfig;
  protected controller?: AbortController;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * 创建消息流
   */
  abstract createMessage(
    messages: ChatMessage[],
    options?: CreateMessageOptions
  ): StreamResponse;

  /**
   * 获取可用模型列表
   */
  abstract getModels(): Promise<ModelInfo[]>;

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const models = await this.getModels();
      return models.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 取消请求
   */
  abort(): void {
    if (this.controller) {
      this.controller.abort();
      this.controller = undefined;
    }
  }

  /**
   * 创建新的 AbortController
   */
  protected createController(signal?: AbortSignal): AbortController {
    this.controller = new AbortController();

    // 如果有外部信号，链接到我们的控制器
    if (signal) {
      signal.addEventListener("abort", () => {
        this.controller?.abort();
      });
    }

    return this.controller;
  }

  /**
   * 发送 HTTP 请求
   */
  protected async fetch(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    return fetch(url, {
      ...options,
      signal: this.controller?.signal,
    });
  }

  /**
   * 解析 SSE 流
   */
  protected async *parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): AsyncGenerator<string, void, unknown> {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data && data !== "[DONE]") {
            yield data;
          }
        }
      }
    }
  }
}
