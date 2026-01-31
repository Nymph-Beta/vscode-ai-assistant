<template>
  <div class="tool-block" :class="statusClass">
    <div class="tool-header" @click="toggleExpand">
      <i :class="['codicon', iconClass]" />
      <span class="tool-title">{{ title }}</span>
      <span class="tool-status-badge" :class="statusBadgeClass">
        <i v-if="status === 'running'" class="codicon codicon-loading codicon-modifier-spin" />
        <i v-else-if="status === 'success'" class="codicon codicon-check" />
        <i v-else-if="status === 'error'" class="codicon codicon-error" />
        <i v-else-if="status === 'waiting_approval'" class="codicon codicon-question" />
        <i v-else class="codicon codicon-clock" />
        {{ statusText }}
      </span>
      <i :class="['codicon', 'expand-icon', isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right']" />
    </div>
    <div v-show="isExpanded" class="tool-content">
      <!-- 工具参数 -->
      <div v-if="showArgs && args" class="tool-args">
        <div v-for="(value, key) in displayArgs" :key="key" class="tool-arg">
          <span class="arg-key">{{ key }}:</span>
          <span class="arg-value">{{ formatArgValue(value) }}</span>
        </div>
      </div>
      
      <!-- 等待批准时显示操作按钮 -->
      <div v-if="status === 'waiting_approval'" class="tool-approval">
        <div class="approval-hint">
          <i class="codicon codicon-info" />
          <span>此工具需要您的批准才能执行</span>
          <span v-if="timeoutRemaining > 0" class="timeout-countdown">
            （{{ timeoutRemaining }}s 后自动批准）
          </span>
        </div>
        <div class="approval-actions">
          <button class="approval-btn approve-btn" @click.stop="handleApprove">
            <i class="codicon codicon-check" />
            批准执行
          </button>
          <button class="approval-btn reject-btn" @click.stop="handleReject">
            <i class="codicon codicon-close" />
            拒绝
          </button>
        </div>
      </div>
      
      <!-- 工具结果 -->
      <div v-if="result" class="tool-result">
        <CodeAccordion
          v-if="result.content"
          :title="result.success ? '执行结果' : '错误信息'"
          :content="result.content"
          :defaultOpen="!result.success || result.content.split('\n').length <= 10"
          :type="result.success ? 'success' : 'error'"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import CodeAccordion from './CodeAccordion.vue';

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

export type ToolStatus = 'pending' | 'waiting_approval' | 'running' | 'success' | 'error' | 'rejected';

const props = defineProps<{
  type: string;
  args: Record<string, unknown>;
  result?: ToolResult;
  status: ToolStatus;
  toolCallId?: string;
  timeoutMs?: number; // 超时自动批准时间（毫秒）
}>();

const emit = defineEmits<{
  (e: 'approve', toolCallId: string): void;
  (e: 'reject', toolCallId: string): void;
}>();

const isExpanded = ref(true);

// 倒计时相关
const timeoutRemaining = ref(0);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// 启动倒计时
const startCountdown = (ms: number) => {
  stopCountdown();
  timeoutRemaining.value = Math.ceil(ms / 1000);
  countdownInterval = setInterval(() => {
    timeoutRemaining.value--;
    if (timeoutRemaining.value <= 0) {
      stopCountdown();
    }
  }, 1000);
};

// 停止倒计时
const stopCountdown = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  timeoutRemaining.value = 0;
};

// 监听状态变化和超时设置
watch(
  () => [props.status, props.timeoutMs] as const,
  ([status, timeoutMs]) => {
    if (status === 'waiting_approval' && timeoutMs && timeoutMs > 0) {
      startCountdown(timeoutMs);
    } else {
      stopCountdown();
    }
  },
  { immediate: true }
);

// 组件卸载时清理
onUnmounted(() => {
  stopCountdown();
});

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

// 处理批准
const handleApprove = () => {
  stopCountdown();
  if (props.toolCallId) {
    emit('approve', props.toolCallId);
  }
};

// 处理拒绝
const handleReject = () => {
  stopCountdown();
  if (props.toolCallId) {
    emit('reject', props.toolCallId);
  }
};

// 工具图标映射
const iconMap: Record<string, string> = {
  read_file: 'codicon-file',
  write_to_file: 'codicon-new-file',
  list_files: 'codicon-folder-opened',
  search_files: 'codicon-search',
  execute_command: 'codicon-terminal',
};

const iconClass = computed(() => iconMap[props.type] || 'codicon-tools');

// 工具标题
const titleMap: Record<string, (args: Record<string, unknown>) => string> = {
  read_file: (args) => `读取文件: ${args.path || ''}`,
  write_to_file: (args) => `写入文件: ${args.path || ''}`,
  list_files: (args) => `列出目录: ${args.path || '.'}`,
  search_files: (args) => `搜索: ${args.pattern || ''}`,
  execute_command: (args) => `执行命令: ${String(args.command || '').substring(0, 50)}${String(args.command || '').length > 50 ? '...' : ''}`,
};

const title = computed(() => {
  const titleFn = titleMap[props.type];
  return titleFn ? titleFn(props.args) : `工具: ${props.type}`;
});

// 状态相关
const statusClass = computed(() => ({
  'status-pending': props.status === 'pending',
  'status-waiting': props.status === 'waiting_approval',
  'status-running': props.status === 'running',
  'status-success': props.status === 'success',
  'status-error': props.status === 'error',
  'status-rejected': props.status === 'rejected',
}));

const statusBadgeClass = computed(() => ({
  'badge-pending': props.status === 'pending',
  'badge-waiting': props.status === 'waiting_approval',
  'badge-running': props.status === 'running',
  'badge-success': props.status === 'success',
  'badge-error': props.status === 'error',
  'badge-rejected': props.status === 'rejected',
}));

const statusText = computed(() => {
  switch (props.status) {
    case 'pending': return '等待中';
    case 'waiting_approval': return '等待批准';
    case 'running': return '执行中';
    case 'success': return '完成';
    case 'error': return '失败';
    case 'rejected': return '已拒绝';
    default: return '';
  }
});

// 是否显示参数（某些工具的参数已经在标题中显示）
const showArgs = computed(() => {
  // 对于这些工具，参数已经在标题中显示
  const hideArgsTools = ['read_file', 'write_to_file', 'list_files'];
  return !hideArgsTools.includes(props.type);
});

// 过滤显示的参数
const displayArgs = computed(() => {
  if (!props.args) return {};
  // 过滤掉已经在标题中显示的参数
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props.args)) {
    if (key !== 'path' && key !== 'command' && key !== 'pattern') {
      filtered[key] = value;
    }
  }
  return filtered;
});

// 格式化参数值
const formatArgValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
};
</script>

<style scoped>
.tool-block {
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  margin: 8px 0;
  overflow: hidden;
  background: var(--vscode-editor-background);
}

.tool-block.status-running {
  border-color: var(--vscode-progressBar-background);
}

.tool-block.status-success {
  border-color: var(--vscode-testing-iconPassed);
}

.tool-block.status-error {
  border-color: var(--vscode-testing-iconFailed);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  cursor: pointer;
  user-select: none;
}

.tool-header:hover {
  background: var(--vscode-list-hoverBackground);
}

.tool-header .codicon {
  font-size: 14px;
  color: var(--vscode-icon-foreground);
}

.tool-title {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--vscode-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
}

.badge-pending {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}

.badge-running {
  background: var(--vscode-progressBar-background);
  color: var(--vscode-editor-background);
}

.badge-success {
  background: var(--vscode-testing-iconPassed);
  color: var(--vscode-editor-background);
}

.badge-error {
  background: var(--vscode-testing-iconFailed);
  color: var(--vscode-editor-background);
}

.badge-waiting {
  background: var(--vscode-editorWarning-foreground);
  color: var(--vscode-editor-background);
}

.badge-rejected {
  background: var(--vscode-debugIcon-stopForeground);
  color: var(--vscode-editor-background);
}

.tool-block.status-waiting {
  border-color: var(--vscode-editorWarning-foreground);
}

.tool-block.status-rejected {
  border-color: var(--vscode-debugIcon-stopForeground);
  opacity: 0.7;
}

.expand-icon {
  transition: transform 0.15s ease;
}

.tool-content {
  padding: 8px 12px;
  border-top: 1px solid var(--vscode-widget-border);
}

.tool-args {
  margin-bottom: 8px;
}

.tool-arg {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 2px 0;
}

.arg-key {
  color: var(--vscode-symbolIcon-propertyForeground);
  font-weight: 500;
}

.arg-value {
  color: var(--vscode-foreground);
  word-break: break-all;
}

.tool-result {
  margin-top: 8px;
}

/* 批准操作区域 */
.tool-approval {
  margin: 8px 0;
  padding: 12px;
  background: var(--vscode-editor-inactiveSelectionBackground);
  border-radius: 4px;
  border-left: 3px solid var(--vscode-editorWarning-foreground);
}

.approval-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--vscode-editorWarning-foreground);
}

.approval-hint .codicon {
  font-size: 14px;
}

.timeout-countdown {
  margin-left: 4px;
  font-weight: 600;
  color: var(--vscode-charts-orange);
}

.approval-actions {
  display: flex;
  gap: 8px;
}

.approval-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.approval-btn .codicon {
  font-size: 12px;
}

.approve-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.approve-btn:hover {
  background: var(--vscode-button-hoverBackground);
}

.reject-btn {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.reject-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

/* Loading spin animation */
@keyframes codicon-spin {
  100% {
    transform: rotate(360deg);
  }
}

.codicon-modifier-spin {
  animation: codicon-spin 1s infinite linear;
}
</style>
