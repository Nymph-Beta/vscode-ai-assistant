<template>
  <div 
    class="user-message-container"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div class="user-message-content">
      <!-- 编辑模式 -->
      <div v-if="isEditing" class="edit-mode">
        <textarea 
          ref="editTextarea"
          v-model="editContent"
          class="edit-textarea"
          @keydown.ctrl.enter="saveEdit"
          @keydown.escape="cancelEdit"
        />
        <div class="edit-actions">
          <button class="edit-button cancel" @click="cancelEdit">取消</button>
          <button class="edit-button save" @click="saveEdit">保存</button>
        </div>
      </div>
      <!-- 显示模式 -->
      <template v-else>
        <div v-html="markdowned_content" class="user-message-text" />
        <MessageActions
          :content="content"
          :show-edit="editable"
          :show-delete="deletable"
          :force-visible="isHovered"
          @edit="startEdit"
          @delete="$emit('delete')"
        />
      </template>
    </div>
    <i class="codicon codicon-account user-message-icon" />
  </div>
</template>

<script setup lang="ts">
import markdownit from 'markdown-it';
import { computed, ref, nextTick } from 'vue';
import MessageActions from './components/MessageActions.vue';

const props = withDefaults(defineProps<{
  content: string;
  editable?: boolean;
  deletable?: boolean;
}>(), {
  editable: true,
  deletable: true,
});

const emit = defineEmits<{
  (e: 'edit', content: string): void;
  (e: 'delete'): void;
}>();

const mdit = new markdownit({
  html: false,
  linkify: true,
});

const isHovered = ref(false);
const isEditing = ref(false);
const editContent = ref('');
const editTextarea = ref<HTMLTextAreaElement | null>(null);

const markdowned_content = computed(() => mdit.render(props.content || ''));

function startEdit() {
  editContent.value = props.content;
  isEditing.value = true;
  nextTick(() => {
    editTextarea.value?.focus();
    editTextarea.value?.select();
  });
}

function saveEdit() {
  if (editContent.value.trim() && editContent.value !== props.content) {
    emit('edit', editContent.value.trim());
  }
  isEditing.value = false;
}

function cancelEdit() {
  isEditing.value = false;
  editContent.value = '';
}
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
  position: relative;
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

.user-message-content :deep(.message-actions) {
  position: absolute;
  top: 4px;
  right: 4px;
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

/* 编辑模式样式 */
.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}

.edit-textarea:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.edit-button {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.edit-button.cancel {
  background: transparent;
  border: 1px solid var(--vscode-button-secondaryBackground);
  color: var(--vscode-foreground);
}

.edit-button.cancel:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.edit-button.save {
  background: var(--vscode-button-background);
  border: none;
  color: var(--vscode-button-foreground);
}

.edit-button.save:hover {
  background: var(--vscode-button-hoverBackground);
}
</style>
