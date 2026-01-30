<template>
  <Teleport to="body">
    <div v-if="show" class="dialog-overlay" @click.self="onCancel">
      <div class="dialog-container">
        <div class="dialog-header">
          <span class="dialog-title">{{ title }}</span>
          <button class="close-button" @click="onCancel">
            <i class="codicon codicon-close" />
          </button>
        </div>
        <div class="dialog-body">
          <p class="dialog-message">{{ message }}</p>
        </div>
        <div class="dialog-footer">
          <button class="dialog-button secondary" @click="onCancel">
            {{ cancelText }}
          </button>
          <button 
            class="dialog-button primary" 
            :class="{ destructive: destructive }"
            @click="onConfirm"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  show: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}>(), {
  confirmText: '确认',
  cancelText: '取消',
  destructive: false,
});

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

function onConfirm() {
  emit('confirm');
}

function onCancel() {
  emit('cancel');
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-container {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  min-width: 300px;
  max-width: 450px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.dialog-title {
  font-weight: 600;
  color: var(--vscode-foreground);
}

.close-button {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
}

.close-button:hover {
  opacity: 1;
}

.dialog-body {
  padding: 16px;
}

.dialog-message {
  margin: 0;
  color: var(--vscode-foreground);
  line-height: 1.5;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--vscode-widget-border);
}

.dialog-button {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dialog-button.secondary {
  background: transparent;
  border: 1px solid var(--vscode-button-secondaryBackground);
  color: var(--vscode-foreground);
}

.dialog-button.secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.dialog-button.primary {
  background: var(--vscode-button-background);
  border: none;
  color: var(--vscode-button-foreground);
}

.dialog-button.primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.dialog-button.primary.destructive {
  background: var(--vscode-errorForeground, #f14c4c);
}

.dialog-button.primary.destructive:hover {
  filter: brightness(1.1);
}
</style>
