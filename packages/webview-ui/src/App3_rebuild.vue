<template>
  <header style="flex: 0 0 auto; padding: 8px;"></header>
  <main ref="mainContainer" style="flex: 1 1 auto; overflow-y: auto; box-sizing: border-box;">
    <template v-for="(msg, i) in messages" :key="i">
      <UserMessage v-if="msg.role === 'user'" :content="msg.content" />
      <AssistantMessage
        v-else-if="msg.role === 'assistant'"
        :content="msg.content"
        :reasoning_content="msg.reasoning_content"
        :status="msg.status"
      />
    </template>
  </main>
  <footer style="flex: 0 0 auto;">
    <button class="clear-history-button" style="width: 100%;" @click="clearHistory">
      清除历史
    </button>
    <Sender :status="status" @submit="send" @cancel="cancel" />
  </footer>
</template>

<script setup lang="ts">
// ============================================================
// 1. Imports
// ============================================================
import type { WebviewApi } from 'vscode-webview';
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import AssistantMessage from './AssistantMessage.vue';
import Sender from './Sender.vue';
import UserMessage from './UserMessage.vue';
import SSEClientWithThinkTag from './api';

// ============================================================
// 2. Types - 类型定义
// ============================================================

// VSCode 消息类型
type VscodeEnv = {
  command: 'xiaoke.webview.env';
  payload: { key: string; value: unknown | undefined };
};

type VscodeChatOpen = {
  command: 'xiaoke.webview.chat.open';
  payload: Response;
};

type VscodeChatMessage = {
  command: 'xiaoke.webview.chat.message';
  payload: { type: 'thinking' | 'answering'; buffer: string };
};

type VscodeChatClose = {
  command: 'xiaoke.webview.chat.close';
  payload: undefined;
};

type VscodeChatError = {
  command: 'xiaoke.webview.chat.error';
  payload: unknown;
};

type VscodeMessage = VscodeEnv | VscodeChatOpen | VscodeChatMessage | VscodeChatClose | VscodeChatError;

// 业务消息类型
export type AMessage = {
  role: 'assistant';
  content: string;           // 回答内容
  reasoning_content: string; // 思考内容
  status: 'thinking' | 'answering' | 'completed';
};

export type UMessage = {
  role: 'user';
  content: string;
};

type Message = UMessage | AMessage;

// ============================================================
// 3. Refs & State - 响应式状态
// ============================================================

// 配置状态
const baseURL = ref('http://192.168.0.20:8098');
const thinkTag = ref(true);

// 消息状态
const messages = ref<Message[]>([]);
const status = ref<'ready' | 'thinking' | 'answering'>('ready');
const index = ref(-1);

// 模板引用
const mainContainer = useTemplateRef('mainContainer');

// VSCode API（开发模式下为 undefined，VSCode 扩展模式下获取 API）
const vscode: WebviewApi<unknown> | undefined = (
  import.meta.env.MODE === 'development'
    ? false
    : (JSON.parse(import.meta.env.USEVSCODE || 'false') as boolean)
)
  ? typeof acquireVsCodeApi !== 'undefined'
    ? acquireVsCodeApi()
    : undefined
  : undefined;

// SSE 客户端（稍后初始化）
let client: SSEClientWithThinkTag;

// ============================================================
// 4. Utility Functions - 工具函数
// ============================================================

/**
 * 滚动消息容器到底部
 */
const scrollToBottom = () => {
  nextTick(() => {
    mainContainer.value?.scrollTo({
      top: mainContainer.value.scrollHeight,
      behavior: 'smooth',
    });
  });
};

/**
 * 清除聊天历史
 */
const clearHistory = () => {
  messages.value = [];
};

// ============================================================
// 5. SSE Callbacks - SSE 回调函数
// ============================================================

/**
 * SSE 连接打开回调
 */
const onOpen = async (response: Response) => {
  console.log(`SSE connection opened: ${response.ok}.`);
  
  const initialStatus = thinkTag.value ? 'thinking' : 'answering';
  status.value = initialStatus;
  
  index.value = messages.value.push({
    role: 'assistant',
    content: '',
    reasoning_content: '',
    status: initialStatus,
  }) - 1;
  
  scrollToBottom();
};

/**
 * SSE 消息接收回调
 */
const onMessage = (type: 'thinking' | 'answering', buffer: string) => {
  const currentMessage = messages.value[index.value] as AMessage;
  
  if (type === 'thinking') {
    currentMessage.reasoning_content += buffer;
  } else {
    currentMessage.content += buffer;
    currentMessage.status = 'answering';
    status.value = 'answering';
  }
  
  scrollToBottom();
};

/**
 * SSE 连接关闭回调
 */
const onClose = () => {
  console.log('SSE connection closed');
  
  (messages.value[index.value] as AMessage).status = 'completed';
  status.value = 'ready';
  index.value = -1;
};

/**
 * SSE 错误回调
 */
const onError = (err: unknown) => {
  console.log('SSE on Error:', err);

  const lastMessage = messages.value[messages.value.length - 1];
  
  if (messages.value.length > 0 && lastMessage.role === 'assistant') {
    lastMessage.content += `无法连接到服务器：${err}`;
    (lastMessage as AMessage).status = 'completed';
  } else {
    messages.value.push({
      role: 'assistant',
      content: `连接服务器错误：${err}`,
      reasoning_content: '',
      status: 'completed',
    });
  }

  status.value = 'ready';
  index.value = -1;
};

// ============================================================
// 6. Initialize - 初始化
// ============================================================

client = new SSEClientWithThinkTag(
  baseURL.value,
  thinkTag.value,
  onOpen,
  onMessage,
  onClose,
  onError,
);

// ============================================================
// 7. Business Logic - 业务函数（模板直接调用）
// ============================================================

/**
 * 发送消息
 */
async function send(content: string) {
  const trimmedContent = content.trim();
  
  if (trimmedContent === '' || status.value !== 'ready') {
    console.error('unready or empty content');
    return;
  }

  messages.value.push({ role: 'user', content: trimmedContent });
  scrollToBottom();

  if (vscode !== undefined) {
    vscode.postMessage({ command: 'xiaoke.webview.chat.invoke', payload: trimmedContent });
  } else {
    await client.invoke(trimmedContent);
  }
}

/**
 * 取消当前请求
 */
async function cancel() {
  if (vscode !== undefined) {
    vscode.postMessage({ command: 'xiaoke.webview.chat.cancel' });
  } else {
    await client.cancel();
  }
  
  status.value = 'ready';
  
  const lastMessage = messages.value[messages.value.length - 1];
  if (messages.value.length > 0 && lastMessage.role === 'assistant') {
    (lastMessage as AMessage).status = 'completed';
  }
}

// ============================================================
// 8. VSCode Communication - VSCode 通信
// ============================================================

/**
 * VSCode 消息监听器
 */
const vscodeListener = async (event: MessageEvent<VscodeMessage>) => {
  const { command, payload } = event.data;
  console.debug('VSCode Listener Received message:', command, payload);

  switch (command) {
    case 'xiaoke.webview.env': {
      if (payload.key === 'baseURL' && typeof payload.value === 'string') {
        console.log('baseURL:', payload.value);
        baseURL.value = payload.value;
      } else if (payload.key === 'thinkTag' && typeof payload.value === 'boolean') {
        console.log('thinkTag:', payload.value);
        thinkTag.value = payload.value;
      }
      break;
    }
    case 'xiaoke.webview.chat.open': {
      await onOpen(payload);
      break;
    }
    case 'xiaoke.webview.chat.message': {
      onMessage(payload.type, payload.buffer);
      break;
    }
    case 'xiaoke.webview.chat.close': {
      onClose();
      break;
    }
    case 'xiaoke.webview.chat.error': {
      onError(payload);
      break;
    }
    default:
      console.warn('Unknown command:', command);
  }
};

// ============================================================
// 9. Lifecycle Hooks - 生命周期钩子
// ============================================================

onMounted(() => {
  if (vscode !== undefined) {
    window.addEventListener('message', vscodeListener);
    
    // 请求环境配置
    vscode.postMessage({
      command: 'xiaoke.webview.env',
      payload: { key: 'baseURL' },
    });
    vscode.postMessage({
      command: 'xiaoke.webview.env',
      payload: { key: 'thinkTag' },  // 修复：原代码是 'thingTag' 拼写错误
    });
  }
});

onUnmounted(() => {
  if (vscode !== undefined) {
    window.removeEventListener('message', vscodeListener);
  }
});
</script>

<style scoped>
.clear-history-button {
  background-color: var(--vscode-button-background);
  border: 1px solid var(--vscode-button-border, black);
  color: var(--vscode-button-foreground);
  align-self: flex-end;
  border-radius: 2px;
  cursor: pointer;
  margin-bottom: 0.25rem;

  &:hover {
    background-color: var(--vscode-button-hoverBackground);
    border: 1px solid var(--vscode-focusBorder, red);
  }
}
</style>
