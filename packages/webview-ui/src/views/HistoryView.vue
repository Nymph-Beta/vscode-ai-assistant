<template>
  <div class="history-view">
    <header class="history-header">
      <h2 class="history-title">历史记录</h2>
      <div class="header-actions">
        <button 
          v-if="selectedTasks.length > 0"
          class="action-button delete"
          @click="deleteSelected"
        >
          <i class="codicon codicon-trash" />
          删除 ({{ selectedTasks.length }})
        </button>
      </div>
    </header>

    <!-- 搜索和过滤 -->
    <div class="search-bar">
      <div class="search-input-wrapper">
        <i class="codicon codicon-search" />
        <input 
          type="text"
          v-model="searchQuery"
          class="search-input"
          placeholder="搜索任务..."
        />
        <button 
          v-if="searchQuery"
          class="clear-search"
          @click="searchQuery = ''"
        >
          <i class="codicon codicon-close" />
        </button>
      </div>
      
      <select v-model="sortBy" class="sort-select">
        <option value="newest">最新优先</option>
        <option value="oldest">最旧优先</option>
        <option value="tokens">Token 最多</option>
        <option value="cost">费用最高</option>
      </select>
    </div>

    <!-- 任务列表 -->
    <div class="task-list" v-if="filteredTasks.length > 0">
      <div 
        v-for="task in filteredTasks" 
        :key="task.id"
        class="task-item"
        :class="{ selected: selectedTasks.includes(task.id) }"
        @click="onTaskClick(task)"
      >
        <label class="task-checkbox" @click.stop>
          <input 
            type="checkbox" 
            :checked="selectedTasks.includes(task.id)"
            @change="toggleSelect(task.id)"
          />
        </label>
        
        <div class="task-content">
          <div class="task-title">{{ task.title || '未命名任务' }}</div>
          <div class="task-meta">
            <span class="task-date">{{ formatDate(task.timestamp) }}</span>
            <span class="task-tokens" v-if="task.tokens">
              <i class="codicon codicon-symbol-numeric" />
              {{ formatNumber(task.tokens) }} tokens
            </span>
            <span class="task-cost" v-if="task.cost">
              ${{ task.cost.toFixed(4) }}
            </span>
            <span class="task-messages">
              {{ task.messageCount }} 条消息
            </span>
          </div>
          <div class="task-preview" v-if="task.preview">
            {{ task.preview }}
          </div>
        </div>

        <div class="task-actions">
          <button 
            class="task-action-button"
            title="恢复任务"
            @click.stop="restoreTask(task)"
          >
            <i class="codicon codicon-debug-restart" />
          </button>
          <button 
            class="task-action-button"
            title="导出"
            @click.stop="exportTask(task)"
          >
            <i class="codicon codicon-export" />
          </button>
          <button 
            class="task-action-button delete"
            title="删除"
            @click.stop="deleteTask(task)"
          >
            <i class="codicon codicon-trash" />
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="empty-state" v-else>
      <i class="codicon codicon-history empty-icon" />
      <p class="empty-title">
        {{ searchQuery ? '未找到匹配的任务' : '暂无历史记录' }}
      </p>
      <p class="empty-desc">
        {{ searchQuery ? '尝试其他搜索关键词' : '开始新对话后会在这里显示' }}
      </p>
    </div>

    <!-- 确认对话框 -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      title="确认删除"
      :message="deleteConfirmMessage"
      confirm-text="删除"
      :destructive="true"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

interface Task {
  id: string;
  title: string;
  timestamp: number;
  tokens?: number;
  cost?: number;
  messageCount: number;
  preview?: string;
}

const props = withDefaults(defineProps<{
  tasks: Task[];
}>(), {
  tasks: () => [],
});

const emit = defineEmits<{
  (e: 'restore', task: Task): void;
  (e: 'delete', taskIds: string[]): void;
  (e: 'export', task: Task): void;
}>();

const searchQuery = ref('');
const sortBy = ref<'newest' | 'oldest' | 'tokens' | 'cost'>('newest');
const selectedTasks = ref<string[]>([]);
const showDeleteConfirm = ref(false);
const tasksToDelete = ref<string[]>([]);

const filteredTasks = computed(() => {
  let result = [...props.tasks];

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      task => 
        task.title?.toLowerCase().includes(query) ||
        task.preview?.toLowerCase().includes(query)
    );
  }

  // 排序
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'newest':
        return b.timestamp - a.timestamp;
      case 'oldest':
        return a.timestamp - b.timestamp;
      case 'tokens':
        return (b.tokens || 0) - (a.tokens || 0);
      case 'cost':
        return (b.cost || 0) - (a.cost || 0);
      default:
        return 0;
    }
  });

  return result;
});

const deleteConfirmMessage = computed(() => {
  const count = tasksToDelete.value.length;
  return `确定要删除 ${count} 个任务吗？此操作无法撤销。`;
});

function toggleSelect(taskId: string) {
  const index = selectedTasks.value.indexOf(taskId);
  if (index === -1) {
    selectedTasks.value.push(taskId);
  } else {
    selectedTasks.value.splice(index, 1);
  }
}

function onTaskClick(task: Task) {
  emit('restore', task);
}

function restoreTask(task: Task) {
  emit('restore', task);
}

function exportTask(task: Task) {
  emit('export', task);
}

function deleteTask(task: Task) {
  tasksToDelete.value = [task.id];
  showDeleteConfirm.value = true;
}

function deleteSelected() {
  tasksToDelete.value = [...selectedTasks.value];
  showDeleteConfirm.value = true;
}

function confirmDelete() {
  emit('delete', tasksToDelete.value);
  selectedTasks.value = selectedTasks.value.filter(
    id => !tasksToDelete.value.includes(id)
  );
  tasksToDelete.value = [];
  showDeleteConfirm.value = false;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // 今天
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // 一周内
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
  }
  
  // 更早
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}
</script>

<style scoped>
.history-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.history-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-foreground);
  cursor: pointer;
  font-size: 12px;
}

.action-button.delete {
  background: var(--vscode-errorForeground, #f14c4c);
  color: white;
}

.search-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.search-input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.search-input-wrapper i {
  position: absolute;
  left: 10px;
  color: var(--vscode-descriptionForeground);
}

.search-input {
  width: 100%;
  padding: 6px 32px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
}

.search-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.clear-search {
  position: absolute;
  right: 8px;
  padding: 2px;
  border: none;
  background: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
}

.sort-select {
  padding: 6px 10px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  cursor: pointer;
  transition: all 0.15s ease;
}

.task-item:hover {
  border-color: var(--vscode-focusBorder);
}

.task-item.selected {
  background: color-mix(in srgb, var(--vscode-button-background) 10%, var(--vscode-editor-background));
  border-color: var(--vscode-button-background);
}

.task-checkbox {
  padding-top: 2px;
}

.task-content {
  flex: 1;
  min-width: 0;
}

.task-title {
  font-weight: 500;
  color: var(--vscode-foreground);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
}

.task-meta span {
  display: flex;
  align-items: center;
  gap: 2px;
}

.task-preview {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.task-item:hover .task-actions {
  opacity: 1;
}

.task-action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
  cursor: pointer;
  opacity: 0.7;
}

.task-action-button:hover {
  opacity: 1;
}

.task-action-button.delete:hover {
  color: var(--vscode-errorForeground, #f14c4c);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--vscode-descriptionForeground);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  margin: 0 0 8px 0;
  color: var(--vscode-foreground);
}

.empty-desc {
  margin: 0;
  font-size: 13px;
}
</style>
