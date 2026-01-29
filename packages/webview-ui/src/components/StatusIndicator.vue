<template>
  <div class="status-indicator" :class="statusClass">
    <div class="status-dot" :class="dotClass" />
    <span class="status-text">{{ statusText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type StatusType = 'ready' | 'thinking' | 'tooling' | 'answering' | 'error';

const props = defineProps<{
  status: StatusType;
  toolName?: string;
}>();

const statusClass = computed(() => `status-${props.status}`);

const dotClass = computed(() => ({
  'dot-ready': props.status === 'ready',
  'dot-thinking': props.status === 'thinking',
  'dot-tooling': props.status === 'tooling',
  'dot-answering': props.status === 'answering',
  'dot-error': props.status === 'error',
}));

const statusText = computed(() => {
  switch (props.status) {
    case 'ready':
      return '准备就绪';
    case 'thinking':
      return '正在思考...';
    case 'tooling':
      return props.toolName ? `执行: ${props.toolName}` : '执行工具中...';
    case 'answering':
      return '正在回答...';
    case 'error':
      return '发生错误';
    default:
      return '';
  }
});
</script>

<style scoped>
.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  transition: all 0.2s ease;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-text {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Ready - green */
.dot-ready {
  background: var(--vscode-testing-iconPassed, #4caf50);
}

/* Thinking - blue pulsing */
.dot-thinking {
  background: var(--vscode-progressBar-background, #0078d4);
  animation: pulse 1.2s ease-in-out infinite;
}

/* Tooling - yellow/orange pulsing */
.dot-tooling {
  background: var(--vscode-editorWarning-foreground, #ff9800);
  animation: pulse 0.8s ease-in-out infinite;
}

/* Answering - blue */
.dot-answering {
  background: var(--vscode-progressBar-background, #0078d4);
  animation: pulse 1.5s ease-in-out infinite;
}

/* Error - red */
.dot-error {
  background: var(--vscode-testing-iconFailed, #f44336);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.9);
  }
}

/* Status-specific styling */
.status-ready {
  background: color-mix(in srgb, var(--vscode-testing-iconPassed, #4caf50) 15%, transparent);
}

.status-thinking,
.status-answering {
  background: color-mix(in srgb, var(--vscode-progressBar-background, #0078d4) 15%, transparent);
}

.status-tooling {
  background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #ff9800) 15%, transparent);
}

.status-error {
  background: color-mix(in srgb, var(--vscode-testing-iconFailed, #f44336) 15%, transparent);
}
</style>
