<template>
  <div class="reasoning-block group">
    <!-- 头部：点击可折叠 -->
    <div class="reasoning-header" @click="toggleCollapse">
      <div class="reasoning-header-left">
        <i class="codicon codicon-lightbulb" />
        <span class="reasoning-title">思考过程</span>
        <span v-if="elapsedSeconds > 0" class="reasoning-time">
          {{ elapsedSeconds }}秒
        </span>
      </div>
      <i 
        :class="[
          'codicon', 
          'codicon-chevron-up', 
          'reasoning-chevron',
          { 'collapsed': isCollapsed }
        ]" 
      />
    </div>
    
    <!-- 内容：可折叠 -->
    <div v-if="!isCollapsed && content" class="reasoning-content">
      <div v-html="renderedContent" class="reasoning-text" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect, onUnmounted } from 'vue';
import markdownit from 'markdown-it';

// Props
const props = defineProps<{
  content: string;
  isStreaming: boolean;  // 是否正在流式输出
  isLast: boolean;       // 是否是最后一条消息
  startTime?: number;    // 开始时间戳
}>();

// Markdown 渲染器
const mdit = markdownit({
  html: false,
  linkify: true,
  typographer: true,
});

// 渲染后的内容
const renderedContent = computed(() => mdit.render(props.content || ''));

// 折叠状态
const isCollapsed = ref(false);
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

// 计时器（仅在最后一条消息流式输出时启用）
const elapsedSeconds = ref(0);
let timerId: ReturnType<typeof setInterval> | null = null;

watchEffect(() => {
  if (props.isLast && props.isStreaming && props.startTime) {
    // 保存 startTime 到局部变量，避免闭包中的非空断言
    const startTime = props.startTime;
    // 启动计时器
    const tick = () => {
      elapsedSeconds.value = Math.floor((Date.now() - startTime) / 1000);
    };
    tick();
    if (!timerId) {
      timerId = setInterval(tick, 1000);
    }
  } else if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
});

onUnmounted(() => {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
});
</script>

<style scoped>
.reasoning-block {
  margin-bottom: 12px;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  overflow: hidden;
  background: color-mix(in srgb, var(--vscode-editor-inactiveSelectionBackground) 50%, transparent);
}

.reasoning-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

.reasoning-header:hover {
  background: var(--vscode-list-hoverBackground);
}

.reasoning-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reasoning-header .codicon-lightbulb {
  font-size: 14px;
  color: var(--vscode-symbolIcon-colorForeground, #f0c674);
}

.reasoning-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--vscode-foreground);
}

.reasoning-time {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-left: 4px;
}

.reasoning-chevron {
  font-size: 14px;
  color: var(--vscode-foreground);
  opacity: 0;
  transition: all 0.2s ease;
}

.group:hover .reasoning-chevron {
  opacity: 1;
}

.reasoning-chevron.collapsed {
  transform: rotate(180deg);
}

.reasoning-content {
  padding: 8px 12px;
  border-top: 1px solid var(--vscode-widget-border);
}

.reasoning-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--vscode-descriptionForeground);
  word-break: break-word;
}

.reasoning-text :deep(p) {
  margin: 0 0 8px 0;
}

.reasoning-text :deep(p:last-child) {
  margin-bottom: 0;
}

.reasoning-text :deep(code) {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size, 12px);
  background: var(--vscode-textCodeBlock-background);
  padding: 2px 4px;
  border-radius: 3px;
}

.reasoning-text :deep(pre) {
  background: var(--vscode-textCodeBlock-background);
  border-radius: 4px;
  padding: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.reasoning-text :deep(ul),
.reasoning-text :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}

.reasoning-text :deep(li) {
  margin: 2px 0;
}
</style>
