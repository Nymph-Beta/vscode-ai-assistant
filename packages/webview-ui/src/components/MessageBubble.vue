<template>
  <div class="message-bubble-container" :class="[iconPosition, { 'dashed-border': useDashedBorder }]">
    <i v-if="icon" class="codicon" :class="icon" />
    <div class="message-content">
      <slot />
      <slot name="reasoning" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  icon: {
    type: String,
    default: ''
  },
  iconPosition: {
    type: String as () => 'left' | 'right',
    default: 'left'
  },
  useDashedBorder: {
    type: Boolean,
    default: false
  },
  status: {
    type: String as () => 'thinking' | 'answering' | 'done',
    default: 'done'
  }
});
</script>

<style scoped>
.message-bubble-container {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  
  &.right {
    flex-direction: row-reverse;
  }

  .codicon {
    font-size: 24px;
    margin: 0 0.25rem;
    color: var(--vscode-icon-foreground);
  }

  .message-content {
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-widget-border, blue);
    border-radius: 2px;
    word-break: break-word;
    padding: 0 0.75rem;
    flex: 1;
    max-width: calc(min(100% - 24px, 85%));
    overflow-x: auto;

    &:hover {
      border-color: var(--vscode-focusBorder, #f0f0f0);
    }
  }

  &.dashed-border .message-content {
    border-bottom-style: dashed;
  }
}
</style>