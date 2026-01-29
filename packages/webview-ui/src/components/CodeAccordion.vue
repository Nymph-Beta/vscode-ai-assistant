<template>
  <details class="code-accordion" :class="typeClass" :open="isOpen">
    <summary @click.prevent="toggle">
      <i :class="['codicon', isOpen ? 'codicon-chevron-down' : 'codicon-chevron-right']" />
      <span class="accordion-title">{{ title }}</span>
      <span class="line-count">{{ lineCount }} 行</span>
    </summary>
    <div class="accordion-content">
      <div class="code-toolbar">
        <button class="copy-button" @click="copyContent" :title="copied ? '已复制' : '复制'">
          <i :class="['codicon', copied ? 'codicon-check' : 'codicon-copy']" />
        </button>
      </div>
      <pre class="code-pre"><code>{{ displayContent }}</code></pre>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  title: string;
  content: string;
  defaultOpen?: boolean;
  type?: 'default' | 'success' | 'error';
  maxLines?: number;
}>();

const isOpen = ref(props.defaultOpen ?? false);
const copied = ref(false);

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const lineCount = computed(() => {
  return props.content.split('\n').length;
});

const displayContent = computed(() => {
  const lines = props.content.split('\n');
  const max = props.maxLines ?? 100;
  
  if (lines.length <= max) {
    return props.content;
  }
  
  // 显示前半和后半，中间省略
  const halfMax = Math.floor(max / 2);
  const firstPart = lines.slice(0, halfMax).join('\n');
  const lastPart = lines.slice(-halfMax).join('\n');
  const omitted = lines.length - max;
  
  return `${firstPart}\n\n... 省略 ${omitted} 行 ...\n\n${lastPart}`;
});

const typeClass = computed(() => ({
  'type-success': props.type === 'success',
  'type-error': props.type === 'error',
}));

const copyContent = async () => {
  try {
    await navigator.clipboard.writeText(props.content);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('复制失败:', err);
  }
};
</script>

<style scoped>
.code-accordion {
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  overflow: hidden;
  background: var(--vscode-textCodeBlock-background);
}

.code-accordion.type-success {
  border-color: var(--vscode-testing-iconPassed);
}

.code-accordion.type-error {
  border-color: var(--vscode-testing-iconFailed);
}

.code-accordion summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  list-style: none;
}

.code-accordion summary::-webkit-details-marker {
  display: none;
}

.code-accordion summary:hover {
  background: var(--vscode-list-hoverBackground);
}

.code-accordion summary .codicon {
  font-size: 12px;
  color: var(--vscode-icon-foreground);
  transition: transform 0.15s ease;
}

.accordion-title {
  flex: 1;
  font-weight: 500;
  color: var(--vscode-foreground);
}

.line-count {
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
}

.accordion-content {
  position: relative;
}

.code-toolbar {
  position: absolute;
  top: 4px;
  right: 8px;
  z-index: 1;
}

.copy-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.copy-button:hover {
  opacity: 1;
  background: var(--vscode-button-secondaryHoverBackground);
}

.code-pre {
  margin: 0;
  padding: 10px;
  padding-right: 40px;
  overflow-x: auto;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size, 13px);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-pre code {
  color: var(--vscode-foreground);
}
</style>
