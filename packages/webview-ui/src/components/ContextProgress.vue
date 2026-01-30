<template>
  <div class="context-progress" :title="tooltipText">
    <div class="progress-bar">
      <div 
        class="progress-fill" 
        :class="statusClass"
        :style="{ width: `${Math.min(percentage, 100)}%` }"
      />
      <div 
        v-if="showThreshold"
        class="threshold-marker"
        :style="{ left: `${threshold}%` }"
      />
    </div>
    <div class="progress-label" v-if="showLabel">
      <span class="percentage">{{ percentage.toFixed(0) }}%</span>
      <span class="tokens">{{ formatTokens(currentTokens) }} / {{ formatTokens(maxTokens) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  currentTokens: number;
  maxTokens: number;
  threshold?: number;
  showThreshold?: boolean;
  showLabel?: boolean;
}>(), {
  currentTokens: 0,
  maxTokens: 128000,
  threshold: 80,
  showThreshold: true,
  showLabel: true,
});

const percentage = computed(() => {
  if (props.maxTokens === 0) return 0;
  return (props.currentTokens / props.maxTokens) * 100;
});

const statusClass = computed(() => {
  if (percentage.value >= 90) return 'critical';
  if (percentage.value >= props.threshold) return 'warning';
  return 'normal';
});

const tooltipText = computed(() => {
  const status = percentage.value >= props.threshold
    ? '上下文即将达到限制，可能需要压缩或截断'
    : '上下文使用正常';
  return `${status}\n${props.currentTokens.toLocaleString()} / ${props.maxTokens.toLocaleString()} tokens (${percentage.value.toFixed(1)}%)`;
});

function formatTokens(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K`;
  }
  return num.toString();
}
</script>

<style scoped>
.context-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-bar {
  position: relative;
  height: 4px;
  background: var(--vscode-progressBar-background, #0e70c0);
  opacity: 0.3;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.progress-fill.normal {
  background: var(--vscode-progressBar-background, #0e70c0);
  opacity: 1;
}

.progress-fill.warning {
  background: var(--vscode-charts-yellow, #cca700);
  opacity: 1;
}

.progress-fill.critical {
  background: var(--vscode-charts-red, #f14c4c);
  opacity: 1;
}

.threshold-marker {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 8px;
  background: var(--vscode-charts-yellow, #cca700);
  transform: translateX(-50%);
  opacity: 0.6;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
}

.percentage {
  font-weight: 500;
}

.tokens {
  font-family: var(--vscode-editor-font-family, monospace);
}
</style>
