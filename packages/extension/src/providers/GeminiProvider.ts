/**
 * Google Gemini Provider
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

/** Gemini 消息格式 */
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** Gemini 内容部分 */
interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

/** Gemini 工具定义 */
interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export class GeminiProvider extends BaseProvider {
  readonly type: ProviderType = "gemini";
  readonly name = "Google Gemini";

  private baseURL = "https://generativelanguage.googleapis.com/v1beta";

  async *createMessage(
    messages: ChatMessage[],
    options?: CreateMessageOptions
  ): StreamResponse {
    this.createController(options?.signal);

    const { systemInstruction, contents } = this.formatMessages(messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 8192,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (options?.tools && options.tools.length > 0) {
      body.tools = [{ functionDeclarations: this.formatTools(options.tools) }];
    }

    if (options?.temperature !== undefined) {
      (body.generationConfig as Record<string, unknown>).temperature = options.temperature;
    }

    const url = `${this.baseURL}/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

    const response = await this.fetch(url, {
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

    let toolCallIndex = 0;

    for await (const data of this.parseSSEStream(reader)) {
      const chunks = this.parseResponse(data, toolCallIndex);
      for (const chunk of chunks) {
        if (chunk.type === "tool_call") {
          toolCallIndex++;
        }
        yield chunk;
      }
    }
  }

  private parseResponse(data: string, toolCallIndex: number): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    try {
      const json = JSON.parse(data);
      const candidates = json.candidates;

      if (!candidates || candidates.length === 0) return chunks;

      const content = candidates[0].content;
      if (!content || !content.parts) return chunks;

      for (const part of content.parts) {
        if (part.text) {
          chunks.push({ type: "text", content: part.text });
        }

        if (part.functionCall) {
          chunks.push({
            type: "tool_call",
            toolCall: {
              id: `gemini-${toolCallIndex}`,
              type: "function",
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args),
              },
            },
          });
        }
      }

      // 处理 usage
      const usageMetadata = json.usageMetadata;
      if (usageMetadata) {
        chunks.push({
          type: "usage",
          inputTokens: usageMetadata.promptTokenCount || 0,
          outputTokens: usageMetadata.candidatesTokenCount || 0,
        });
      }

      return chunks;
    } catch {
      return chunks;
    }
  }

  private formatMessages(messages: ChatMessage[]): {
    systemInstruction: string;
    contents: GeminiContent[];
  } {
    let systemInstruction = "";
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = typeof msg.content === "string" ? msg.content : "";
        continue;
      }

      if (msg.role === "tool") {
        // 工具结果作为 model 响应的一部分
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.name || "unknown",
                response: {
                  result: typeof msg.content === "string" ? msg.content : "",
                },
              },
            },
          ],
        });
        continue;
      }

      const role = msg.role === "assistant" ? "model" : "user";
      const parts: GeminiPart[] = [];

      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c.type === "text" && c.text) {
            parts.push({ text: c.text });
          } else if (c.type === "image_url" && c.image_url) {
            const match = c.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              });
            }
          } else if (c.type === "image" && c.source) {
            parts.push({
              inlineData: {
                mimeType: c.source.media_type,
                data: c.source.data,
              },
            });
          }
        }
      }

      // 处理工具调用
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments || "{}"),
            },
          });
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return { systemInstruction, contents };
  }

  private formatTools(
    tools: { function: { name: string; description: string; parameters: Record<string, unknown> } }[]
  ): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
  }

  async getModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "gemini-2.0-flash-exp",
        name: "Gemini 2.0 Flash",
        provider: "gemini",
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
        inputPrice: 0,
        outputPrice: 0,
      },
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        provider: "gemini",
        contextWindow: 2000000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
        inputPrice: 1.25,
        outputPrice: 5,
      },
      {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        provider: "gemini",
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
        inputPrice: 0.075,
        outputPrice: 0.3,
      },
    ];
  }
}
