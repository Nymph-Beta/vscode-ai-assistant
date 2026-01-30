<template>
  <div class="settings-view">
    <header class="settings-header">
      <h2 class="settings-title">设置</h2>
      <button v-if="hasChanges" class="save-button" @click="saveSettings">
        <i class="codicon codicon-save" />
        保存
      </button>
    </header>

    <div class="settings-content">
      <!-- AI Provider 设置 -->
      <section class="settings-section">
        <h3 class="section-title">
          <i class="codicon codicon-hubot" />
          AI Provider
        </h3>
        
        <div class="setting-item">
          <label class="setting-label">Provider</label>
          <select v-model="settings.provider" class="setting-select">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="gemini">Google Gemini</option>
            <option value="ollama">Ollama (本地)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="custom">自定义</option>
          </select>
        </div>

        <div class="setting-item">
          <label class="setting-label">API Key</label>
          <input 
            type="password" 
            v-model="settings.apiKey" 
            class="setting-input"
            placeholder="输入 API Key"
          />
        </div>

        <div class="setting-item" v-if="showBaseURL">
          <label class="setting-label">Base URL</label>
          <input 
            type="text" 
            v-model="settings.baseURL" 
            class="setting-input"
            :placeholder="defaultBaseURL"
          />
        </div>

        <div class="setting-item">
          <label class="setting-label">模型</label>
          <input 
            type="text" 
            v-model="settings.model" 
            class="setting-input"
            :placeholder="defaultModel"
          />
        </div>
      </section>

      <!-- 上下文管理设置 -->
      <section class="settings-section">
        <h3 class="section-title">
          <i class="codicon codicon-symbol-ruler" />
          上下文管理
        </h3>

        <div class="setting-item">
          <label class="setting-label">上下文窗口 (tokens)</label>
          <input 
            type="number" 
            v-model.number="settings.contextWindow" 
            class="setting-input"
            min="1000"
            max="2000000"
          />
        </div>

        <div class="setting-item">
          <label class="setting-label">压缩阈值 (%)</label>
          <input 
            type="number" 
            v-model.number="settings.condenseThreshold" 
            class="setting-input"
            min="50"
            max="95"
          />
          <span class="setting-hint">当上下文使用达到此百分比时触发压缩</span>
        </div>

        <div class="setting-item toggle">
          <label class="setting-label">启用自动压缩</label>
          <label class="toggle-switch">
            <input type="checkbox" v-model="settings.enableCondensation" />
            <span class="toggle-slider" />
          </label>
        </div>
      </section>

      <!-- 代码索引设置 -->
      <section class="settings-section">
        <h3 class="section-title">
          <i class="codicon codicon-search" />
          代码索引
        </h3>

        <div class="setting-item toggle">
          <label class="setting-label">启用代码索引</label>
          <label class="toggle-switch">
            <input type="checkbox" v-model="settings.codeIndexEnabled" />
            <span class="toggle-slider" />
          </label>
        </div>

        <div class="setting-item" v-if="settings.codeIndexEnabled">
          <label class="setting-label">Embedding Provider</label>
          <select v-model="settings.embeddingProvider" class="setting-select">
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>

        <div class="setting-item" v-if="settings.codeIndexEnabled">
          <label class="setting-label">Embedding 模型</label>
          <input 
            type="text" 
            v-model="settings.embeddingModel" 
            class="setting-input"
            placeholder="text-embedding-3-small"
          />
        </div>
      </section>

      <!-- 界面设置 -->
      <section class="settings-section">
        <h3 class="section-title">
          <i class="codicon codicon-symbol-color" />
          界面
        </h3>

        <div class="setting-item toggle">
          <label class="setting-label">显示 Token 用量</label>
          <label class="toggle-switch">
            <input type="checkbox" v-model="settings.showTokenUsage" />
            <span class="toggle-slider" />
          </label>
        </div>

        <div class="setting-item toggle">
          <label class="setting-label">显示费用估算</label>
          <label class="toggle-switch">
            <input type="checkbox" v-model="settings.showCostEstimate" />
            <span class="toggle-slider" />
          </label>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

export interface Settings {
  // AI Provider
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
  // Context Management
  contextWindow: number;
  condenseThreshold: number;
  enableCondensation: boolean;
  // Code Index
  codeIndexEnabled: boolean;
  embeddingProvider: string;
  embeddingModel: string;
  // UI
  showTokenUsage: boolean;
  showCostEstimate: boolean;
  // Additional
  thinkTag?: boolean;
  defaultMode?: string;
}

const props = withDefaults(defineProps<{
  loadedSettings?: Partial<Settings>;
}>(), {
  loadedSettings: undefined,
});

const emit = defineEmits<{
  (e: 'save', settings: Settings): void;
  (e: 'close'): void;
  (e: 'requestSettings'): void;
}>();

const settings = ref<Settings>({
  provider: 'openai',
  apiKey: '',
  baseURL: '',
  model: '',
  contextWindow: 128000,
  condenseThreshold: 80,
  enableCondensation: true,
  codeIndexEnabled: false,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  showTokenUsage: true,
  showCostEstimate: true,
});

const originalSettings = ref<Settings | null>(null);

// 监听从扩展加载的设置
watch(() => props.loadedSettings, (newSettings) => {
  if (newSettings) {
    Object.assign(settings.value, newSettings);
    originalSettings.value = { ...settings.value };
    console.log('[SettingsView] 设置已从扩展加载:', newSettings);
  }
}, { immediate: true, deep: true });

const hasChanges = computed(() => {
  if (!originalSettings.value) return false;
  return JSON.stringify(settings.value) !== JSON.stringify(originalSettings.value);
});

const showBaseURL = computed(() => {
  return ['ollama', 'openrouter', 'custom'].includes(settings.value.provider);
});

const defaultBaseURL = computed(() => {
  const urls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    ollama: 'http://localhost:11434',
    openrouter: 'https://openrouter.ai/api/v1',
    custom: 'https://api.example.com/v1',
  };
  return urls[settings.value.provider] || '';
});

const defaultModel = computed(() => {
  const models: Record<string, string> = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-1.5-flash',
    ollama: 'llama3.1',
    openrouter: 'anthropic/claude-3.5-sonnet',
    custom: 'default',
  };
  return models[settings.value.provider] || '';
});

function saveSettings() {
  emit('save', { ...settings.value });
  originalSettings.value = { ...settings.value };
}
</script>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.settings-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.save-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  cursor: pointer;
  font-size: 13px;
}

.save-button:hover {
  background: var(--vscode-button-hoverBackground);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.settings-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.section-title i {
  color: var(--vscode-descriptionForeground);
}

.setting-item {
  margin-bottom: 12px;
}

.setting-item.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.setting-label {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--vscode-foreground);
}

.setting-item.toggle .setting-label {
  margin-bottom: 0;
}

.setting-input,
.setting-select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
}

.setting-input:focus,
.setting-select:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.setting-hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 20px;
  transition: 0.3s;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 2px;
  bottom: 2px;
  background-color: var(--vscode-foreground);
  border-radius: 50%;
  transition: 0.3s;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--vscode-button-background);
  border-color: var(--vscode-button-background);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
  background-color: var(--vscode-button-foreground);
}
</style>
