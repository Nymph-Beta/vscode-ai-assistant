<template>
  <div class="user-message-container">
    <div class="user-message-content">
      <div v-html="markdowned_content" class="user-message-text" />
    </div>
    <i class="codicon codicon-account user-message-icon" />
  </div>
</template>

<script setup lang="ts">
import markdownit from 'markdown-it';
import { computed } from 'vue';

const props = defineProps<{ content: string }>();

const mdit = new markdownit({
  html: false,
  linkify: true,
});

const markdowned_content = computed(() => mdit.render(props.content || ''));
</script>

<style scoped>
.user-message-container {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
  gap: 8px;
}

.user-message-icon {
  font-size: 20px;
  color: var(--vscode-icon-foreground);
  flex-shrink: 0;
  margin-top: 4px;
}

.user-message-content {
  flex: 1;
  min-width: 0;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 8px;
  word-break: break-word;
  padding: 12px;
  background: color-mix(in srgb, var(--vscode-button-background) 15%, var(--vscode-editor-background));
  max-width: calc(100% - 36px);
}

.user-message-content:hover {
  border-color: var(--vscode-focusBorder);
}

.user-message-text {
  font-size: 14px;
  line-height: 1.6;
}

.user-message-text :deep(p) {
  margin: 0 0 8px 0;
}

.user-message-text :deep(p:last-child) {
  margin-bottom: 0;
}

.user-message-text :deep(pre) {
  background: var(--vscode-textCodeBlock-background);
  border-radius: 4px;
  padding: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.user-message-text :deep(code) {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size, 13px);
}

.user-message-text :deep(p code) {
  background: var(--vscode-textCodeBlock-background);
  padding: 2px 6px;
  border-radius: 3px;
}
</style>
