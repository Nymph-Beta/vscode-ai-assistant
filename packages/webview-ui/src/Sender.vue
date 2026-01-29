<template>
  <div
    style="
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    "
  >
    <textarea
      @input="adjustHeight"
      @keydown.enter.prevent="send"
      ref="textareaRef"
      rows="2"
      class="sender-textarea"
      :style="{ height: height }"
      v-model="input"
    />
    <button
      v-if="status === 'ready'"
      @click="send"
      class="sender-button"
    >
      <i class="codicon codicon-send" />
    </button>
    <button
      v-else
      @click="emits('cancel')"
      class="sender-button"
    >
      <i class="codicon codicon-stop-circle" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue';

const { status } = defineProps<{
  status: 'ready' | 'thinking' | 'answering';
}>();

const input = ref('');
const height = ref('auto');

const emits = defineEmits<{
  (e: 'submit', content: string): void;
  (e: 'cancel'): void;
}>();

function adjustHeight(event: Event) {
  height.value = 'auto';
  const textarea = event.target as HTMLTextAreaElement | null;
  if (textarea) {
    nextTick(() => (height.value = `${textarea.scrollHeight}px`));
  }
}

const send = () => {
  if (input.value.trim() === '') return;
  emits('submit', input.value);
  input.value = '';
  height.value = 'auto';
};
</script>

<style scoped>
.sender-textarea {
  background-color: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  color: var(--vscode-input-foreground);
  resize: none;
  overflow-y: auto;
  max-height: calc(6 * 1.5em);
  word-wrap: break-word;
  overflow-wrap: break-word;
  box-sizing: border-box;
  width: 100%;
  border-radius: 2px;
  padding: 6px 8px;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 1px var(--vscode-focusBorder, black);
  }
}

.sender-button {
  background-color: var(--vscode-button-background);
  border: 1px solid var(--vscode-button-border, black);
  color: var(--vscode-button-foreground);
  align-self: flex-end;
  border-radius: 2px;
  cursor: pointer;
  margin-top: 0.25rem;

  &:hover {
    background-color: var(--vscode-button-hoverBackground);
    border: 1px solid var(--vscode-focusBorder, red);
  }
}
</style>