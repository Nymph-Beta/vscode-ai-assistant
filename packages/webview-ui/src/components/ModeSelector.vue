<template>
  <div class="mode-selector" ref="selectorRef">
    <button 
      class="mode-trigger" 
      @click="toggle"
      :disabled="disabled"
      :title="currentMode?.name"
    >
      <i :class="['codicon', currentModeIcon]" />
      <span class="mode-name">{{ currentMode?.name || '选择模式' }}</span>
      <i class="codicon codicon-chevron-down chevron" :class="{ open: isOpen }" />
    </button>
    
    <Transition name="dropdown">
      <div v-if="isOpen" class="mode-dropdown">
        <div 
          v-for="mode in modes" 
          :key="mode.slug"
          :class="['mode-item', { active: mode.slug === modelValue }]"
          @click="selectMode(mode.slug)"
        >
          <i :class="['codicon', getModeIcon(mode.slug)]" />
          <div class="mode-info">
            <span class="mode-item-name">{{ mode.name }}</span>
            <span v-if="mode.description" class="mode-desc">{{ mode.description }}</span>
          </div>
          <i v-if="mode.readonly" class="codicon codicon-lock readonly-icon" title="只读模式" />
          <i v-if="mode.slug === modelValue" class="codicon codicon-check check-icon" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';

export interface ModeInfo {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  readonly?: boolean;
}

const props = defineProps<{
  modelValue: string;
  modes: ModeInfo[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
}>();

const isOpen = ref(false);
const selectorRef = ref<HTMLElement | null>(null);

// 模式图标映射
const modeIconMap: Record<string, string> = {
  code: 'codicon-code',
  architect: 'codicon-organization',
  ask: 'codicon-comment-discussion',
  debug: 'codicon-debug',
};

const getModeIcon = (slug: string): string => {
  return modeIconMap[slug] || 'codicon-symbol-misc';
};

const currentMode = computed(() => {
  return props.modes.find(m => m.slug === props.modelValue);
});

const currentModeIcon = computed(() => {
  return getModeIcon(props.modelValue);
});

const toggle = () => {
  if (!props.disabled) {
    isOpen.value = !isOpen.value;
  }
};

const selectMode = (slug: string) => {
  emit('update:modelValue', slug);
  emit('change', slug);
  isOpen.value = false;
};

// 点击外部关闭下拉框
const handleClickOutside = (event: MouseEvent) => {
  if (selectorRef.value && !selectorRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.mode-selector {
  position: relative;
  display: inline-block;
}

.mode-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-trigger:hover:not(:disabled) {
  background: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

.mode-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mode-trigger .codicon {
  font-size: 14px;
}

.mode-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  font-size: 12px;
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.mode-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 200px;
  max-width: 280px;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
}

.mode-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.mode-item:hover {
  background: var(--vscode-list-hoverBackground);
}

.mode-item.active {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.mode-item .codicon {
  font-size: 16px;
  flex-shrink: 0;
}

.mode-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mode-item-name {
  font-size: 13px;
  font-weight: 500;
}

.mode-desc {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.readonly-icon {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.check-icon {
  font-size: 14px;
  color: var(--vscode-testing-iconPassed);
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
