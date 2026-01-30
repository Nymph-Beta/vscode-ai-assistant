/**
 * Ollama Provider
 * 支持本地运行的 Ollama 模型
 */

import { BaseProvider } from "./BaseProvider";
import type {
  ChatMessage,
  CreateMessageOptions,
  ModelInfo,
  ProviderConfig,
  ProviderType,
  StreamChunk,
  StreamResponse,
} from "./types";

export class OllamaProvider extends BaseProvider {
  readonly type: ProviderType = "ollama";
  readonly name = "Ollama";

  private baseURL: string;

  constructor(config: ProviderConfig) {
    super(config);
    // 处理可能带有 /v1 后缀的 URL（兼容 OpenAI 格式配置）
    let url = config.baseURL || "http://localhost:11434";
    // 移除尾部的 /v1、/v1/、/ 等
    url = url.replace(/\/v1\/?$/, "").replace(/\/$/, "");
    // 确保是 Ollama 默认端口
    if (!url.includes(":")) {
      url = "http://localhost:11434";
    }
    this.baseURL = url;
    console.log(`[OllamaProvider] baseURL: ${this.baseURL}`);
  }

  async *createMessage(
    messages: ChatMessage[],
    options?: CreateMessageOptions
  ): StreamResponse {
    this.createController(options?.signal);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.formatMessages(messages),
      stream: true,
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: t.function,
      }));
    }

    const response = await this.fetch(`${this.baseURL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", error: `API 错误 (${response.status}): ${errorText}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "无法读取响应流" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let toolCallIndex = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const chunks = this.parseLine(line, toolCallIndex);
        for (const chunk of chunks) {
          if (chunk.type === "tool_call") {
            toolCallIndex++;
          }
          yield chunk;
        }
      }
    }
  }

  private parseLine(line: string, toolCallIndex: number): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    try {
      const json = JSON.parse(line);

      // 处理消息内容
      if (json.message?.content) {
        chunks.push({ type: "text", content: json.message.content });
      }

      // 处理工具调用
      if (json.message?.tool_calls) {
        for (const tc of json.message.tool_calls) {
          chunks.push({
            type: "tool_call",
            toolCall: {
              id: `ollama-${toolCallIndex}`,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: JSON.stringify(tc.function.arguments),
              },
            },
          });
        }
      }

      // 处理完成
      if (json.done && json.eval_count !== undefined) {
        chunks.push({
          type: "usage",
          inputTokens: json.prompt_eval_count || 0,
          outputTokens: json.eval_count || 0,
        });
      }

      return chunks;
    } catch {
      return chunks;
    }
  }

  private formatMessages(messages: ChatMessage[]): Array<{
    role: string;
    content: string;
    images?: string[];
  }> {
    return messages.map((msg) => {
      const formatted: { role: string; content: string; images?: string[] } = {
        role: msg.role === "tool" ? "assistant" : msg.role,
        content: "",
      };

      if (typeof msg.content === "string") {
        formatted.content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textParts: string[] = [];
        const images: string[] = [];

        for (const c of msg.content) {
          if (c.type === "text" && c.text) {
            textParts.push(c.text);
          } else if (c.type === "image_url" && c.image_url) {
            const match = c.image_url.url.match(/^data:[^;]+;base64,(.+)$/);
            if (match) {
              images.push(match[1]);
            }
          } else if (c.type === "image" && c.source) {
            images.push(c.source.data);
          }
        }

        formatted.content = textParts.join("\n");
        if (images.length > 0) {
          formatted.images = images;
        }
      }

      return formatted;
    });
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const response = await this.fetch(`${this.baseURL}/api/tags`, {
        method: "GET",
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.models || []).map((m: { name: string; details?: { parameter_size?: string } }) => ({
        id: m.name,
        name: m.name,
        provider: "ollama" as ProviderType,
        contextWindow: 4096,
        supportsTools: true,
        supportsVision: m.name.includes("llava") || m.name.includes("vision"),
      }));
    } catch {
      return [];
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.fetch(`${this.baseURL}/api/tags`, {
        method: "GET",
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
