<template>
  <div class="assistant-message-container">
    <i class="codicon codicon-hubot assistant-message-icon" />
    <div class="assistant-message-content">
      <!-- 思考内容（使用 ReasoningBlock 组件） -->
      <ReasoningBlock
        v-if="reasoning_content"
        :content="reasoning_content"
        :isStreaming="reasoningPartial ?? false"
        :isLast="isLast ?? false"
        :startTime="reasoningStartTime"
      />

      <!-- 工具调用块 -->
      <div v-if="toolCalls && toolCalls.length > 0" class="tool-calls-section">
        <ToolBlock
          v-for="tool in toolCalls"
          :key="tool.id"
          :type="tool.name"
          :args="tool.args"
          :result="tool.result"
          :status="tool.status"
          :tool-call-id="tool.toolCallId"
          :timeout-ms="tool.timeoutMs"
          @approve="handleToolApprove"
          @reject="handleToolReject"
        />
      </div>

      <!-- 回答内容 -->
      <div
        v-if="markdowned_content"
        v-html="markdowned_content"
        class="answering-text"
      />

      <!-- 状态指示（当还在生成时） -->
      <div v-if="status !== 'completed' && !content && !reasoning_content" class="generating-indicator">
        <i class="codicon codicon-loading codicon-modifier-spin" />
        <span>{{ statusText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import markdownit from 'markdown-it';
import { computed } from 'vue';
import markdownItCodeCopy from './markdown-it-code-copy';
import ToolBlock from './components/ToolBlock.vue';
import ReasoningBlock from './components/ReasoningBlock.vue';
import type { ToolResult } from './components/ToolBlock.vue';

export type ToolCallStatus = 'pending' | 'waiting_approval' | 'running' | 'success' | 'error' | 'rejected';

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: ToolResult;
  status: ToolCallStatus;
  toolCallId?: string; // 后端的工具调用 ID，用于批准/拒绝
  timeoutMs?: number;  // 超时自动批准时间（毫秒）
}

export type MessageStatus = 'thinking' | 'answering' | 'completed';

const props = defineProps<{
  content: string;
  reasoning_content: string;
  reasoningPartial?: boolean;      // 是否正在流式输出 reasoning
  reasoningStartTime?: number;     // reasoning 开始时间戳
  isLast?: boolean;                // 是否是最后一条消息
  status: MessageStatus;
  toolCalls?: ToolCallInfo[];
}>();

const emit = defineEmits<{
  (e: 'toolApprove', toolCallId: string): void;
  (e: 'toolReject', toolCallId: string): void;
}>();

const handleToolApprove = (toolCallId: string) => {
  emit('toolApprove', toolCallId);
};

const handleToolReject = (toolCallId: string) => {
  emit('toolReject', toolCallId);
};

const mdit = new markdownit({
  html: false,
  linkify: true,
  typographer: true,
}).use(markdownItCodeCopy);

const markdowned_content = computed(() => mdit.render(props.content || ''));

const statusText = computed(() => {
  switch (props.status) {
    case 'thinking':
      return '正在思考...';
    case 'answering':
      return '正在回答...';
    default:
      return '';
  }
});
</script>

<style scoped>
.assistant-message-container {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 12px;
  gap: 8px;
}

.assistant-message-icon {
  font-size: 20px;
  color: var(--vscode-icon-foreground);
  flex-shrink: 0;
  margin-top: 4px;
}

.assistant-message-content {
  flex: 1;
  min-width: 0;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 8px;
  word-break: break-word;
  padding: 12px;
  background: var(--vscode-editor-background);
  max-width: calc(100% - 36px);
  overflow: hidden;
}

.assistant-message-content:hover {
  border-color: var(--vscode-focusBorder);
}

/* 工具调用区域 */
.tool-calls-section {
  margin-bottom: 12px;
}

/* 回答内容 */
.answering-text {
  font-size: 14px;
  line-height: 1.6;
}

.answering-text :deep(p) {
  margin: 0 0 8px 0;
}

.answering-text :deep(p:last-child) {
  margin-bottom: 0;
}

.answering-text :deep(pre) {
  background: var(--vscode-textCodeBlock-background);
  border-radius: 4px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}

.answering-text :deep(code) {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size, 13px);
}

.answering-text :deep(p code) {
  background: var(--vscode-textCodeBlock-background);
  padding: 2px 6px;
  border-radius: 3px;
}

.answering-text :deep(ul),
.answering-text :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.answering-text :deep(li) {
  margin: 4px 0;
}

.answering-text :deep(blockquote) {
  border-left: 3px solid var(--vscode-textBlockQuote-border);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--vscode-textBlockQuote-foreground);
}

.answering-text :deep(a) {
  color: var(--vscode-textLink-foreground);
}

.answering-text :deep(a:hover) {
  color: var(--vscode-textLink-activeForeground);
}

.answering-text :deep(h1),
.answering-text :deep(h2),
.answering-text :deep(h3),
.answering-text :deep(h4) {
  margin: 16px 0 8px 0;
  font-weight: 600;
}

.answering-text :deep(h1) { font-size: 1.4em; }
.answering-text :deep(h2) { font-size: 1.2em; }
.answering-text :deep(h3) { font-size: 1.1em; }
.answering-text :deep(h4) { font-size: 1em; }

.answering-text :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}

.answering-text :deep(th),
.answering-text :deep(td) {
  border: 1px solid var(--vscode-widget-border);
  padding: 6px 10px;
  text-align: left;
}

.answering-text :deep(th) {
  background: var(--vscode-editor-inactiveSelectionBackground);
  font-weight: 600;
}

/* 生成中指示器 */
.generating-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vscode-descriptionForeground);
  font-size: 13px;
}

.generating-indicator .codicon {
  font-size: 16px;
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
