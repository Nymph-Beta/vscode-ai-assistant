/**
 * Provider 工厂
 * 根据配置创建相应的 AI Provider
 */

import type { AIProvider, ProviderConfig, ProviderType } from "./types";
import { OpenAIProvider } from "./OpenAIProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { GeminiProvider } from "./GeminiProvider";
import { OllamaProvider } from "./OllamaProvider";

/**
 * 创建 Provider 实例
 */
export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case "openai":
      return new OpenAIProvider(config);

    case "anthropic":
      return new AnthropicProvider(config);

    case "gemini":
      return new GeminiProvider(config);

    case "ollama":
      return new OllamaProvider(config);

    case "openrouter":
      // OpenRouter 使用 OpenAI 兼容 API
      return new OpenAIProvider({
        ...config,
        baseURL: config.baseURL || "https://openrouter.ai/api/v1",
      });

    case "custom":
      // 自定义 Provider 默认使用 OpenAI 兼容格式
      return new OpenAIProvider(config);

    default:
      throw new Error(`不支持的 Provider 类型: ${config.type}`);
  }
}

/**
 * 获取 Provider 类型显示名称
 */
export function getProviderDisplayName(type: ProviderType): string {
  const names: Record<ProviderType, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic (Claude)",
    gemini: "Google Gemini",
    ollama: "Ollama (本地)",
    openrouter: "OpenRouter",
    custom: "自定义",
  };
  return names[type] || type;
}

/**
 * 获取所有支持的 Provider 类型
 */
export function getSupportedProviders(): Array<{
  type: ProviderType;
  name: string;
  description: string;
}> {
  return [
    {
      type: "openai",
      name: "OpenAI",
      description: "GPT-4o, GPT-4 Turbo 等模型",
    },
    {
      type: "anthropic",
      name: "Anthropic",
      description: "Claude 3.5 Sonnet, Claude 3 Opus 等模型",
    },
    {
      type: "gemini",
      name: "Google Gemini",
      description: "Gemini 1.5 Pro, Gemini 1.5 Flash 等模型",
    },
    {
      type: "ollama",
      name: "Ollama",
      description: "本地运行的开源模型 (Llama, Mistral 等)",
    },
    {
      type: "openrouter",
      name: "OpenRouter",
      description: "统一接口访问多种模型",
    },
    {
      type: "custom",
      name: "自定义",
      description: "OpenAI 兼容的自定义 API",
    },
  ];
}

/**
 * 获取 Provider 默认配置
 */
export function getDefaultConfig(type: ProviderType): Partial<ProviderConfig> {
  switch (type) {
    case "openai":
      return {
        baseURL: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
      };

    case "anthropic":
      return {
        model: "claude-3-5-sonnet-20241022",
      };

    case "gemini":
      return {
        model: "gemini-1.5-flash",
      };

    case "ollama":
      return {
        baseURL: "http://localhost:11434",
        model: "llama3.1",
      };

    case "openrouter":
      return {
        baseURL: "https://openrouter.ai/api/v1",
        model: "anthropic/claude-3.5-sonnet",
      };

    case "custom":
      return {
        model: "default",
      };

    default:
      return {};
  }
}
