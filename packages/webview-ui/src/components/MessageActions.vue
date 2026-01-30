<template>
  <div 
    class="message-actions" 
    :class="{ visible: forceVisible || isHovered }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <button 
      v-if="showEdit"
      class="action-button"
      title="编辑消息"
      @click="$emit('edit')"
    >
      <i class="codicon codicon-edit" />
    </button>
    <button 
      v-if="showCopy"
      class="action-button"
      title="复制内容"
      @click="onCopy"
    >
      <i class="codicon" :class="copied ? 'codicon-check' : 'codicon-copy'" />
    </button>
    <button 
      v-if="showDelete"
      class="action-button delete"
      title="删除消息"
      @click="$emit('delete')"
    >
      <i class="codicon codicon-trash" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  content?: string;
  showEdit?: boolean;
  showCopy?: boolean;
  showDelete?: boolean;
  forceVisible?: boolean;
}>(), {
  showEdit: true,
  showCopy: true,
  showDelete: true,
  forceVisible: false,
});

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'copy'): void;
}>();

const isHovered = ref(false);
const copied = ref(false);

async function onCopy() {
  if (props.content) {
    try {
      await navigator.clipboard.writeText(props.content);
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 2000);
      emit('copy');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
}
</script>

<style scoped>
.message-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.message-actions.visible {
  opacity: 1;
}

.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  color: var(--vscode-foreground);
  cursor: pointer;
  opacity: 0.7;
  transition: all 0.15s ease;
}

.action-button:hover {
  opacity: 1;
  background: var(--vscode-toolbar-activeBackground, rgba(99, 102, 103, 0.31));
}

.action-button.delete:hover {
  color: var(--vscode-errorForeground, #f14c4c);
}

.action-button i {
  font-size: 14px;
}
</style>
