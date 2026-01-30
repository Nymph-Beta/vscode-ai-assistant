<template>
  <div class="token-display">
    <div class="token-item input" :title="`输入 tokens: ${inputTokens}`">
      <i class="codicon codicon-arrow-up" />
      <span class="count">{{ formatNumber(inputTokens) }}</span>
    </div>
    <div class="token-item output" :title="`输出 tokens: ${outputTokens}`">
      <i class="codicon codicon-arrow-down" />
      <span class="count">{{ formatNumber(outputTokens) }}</span>
    </div>
    <div v-if="showCost && cost > 0" class="token-item cost" :title="`预估费用: $${cost.toFixed(6)}`">
      <span class="dollar">$</span>
      <span class="amount">{{ formatCost(cost) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  inputTokens: number;
  outputTokens: number;
  cost?: number;
  showCost?: boolean;
}>(), {
  inputTokens: 0,
  outputTokens: 0,
  cost: 0,
  showCost: true,
});

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatCost(cost: number): string {
  if (cost >= 1) {
    return cost.toFixed(2);
  }
  if (cost >= 0.01) {
    return cost.toFixed(3);
  }
  return cost.toFixed(4);
}
</script>

<style scoped>
.token-display {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.token-item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.token-item i {
  font-size: 10px;
}

.token-item.input i {
  color: var(--vscode-charts-blue, #3794ff);
}

.token-item.output i {
  color: var(--vscode-charts-green, #89d185);
}

.token-item.cost {
  padding-left: 4px;
  border-left: 1px solid var(--vscode-widget-border);
}

.token-item.cost .dollar {
  color: var(--vscode-charts-yellow, #cca700);
}

.count, .amount {
  font-family: var(--vscode-editor-font-family, monospace);
}
</style>
