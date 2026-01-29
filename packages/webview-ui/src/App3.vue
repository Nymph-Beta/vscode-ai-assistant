<template>
  <div class="app-container">
    <!-- 顶部栏：模式选择器 + 状态指示器 -->
    <header class="header">
      <ModeSelector
        v-model="currentModeSlug"
        :modes="modesWithDescription"
        :disabled="status !== 'ready'"
        @change="onModeChange"
      />
      <StatusIndicator :status="indicatorStatus" :toolName="currentToolName" />
    </header>

    <!-- 消息列表 -->
    <main ref="mainContainer" class="main-container">
      <div v-if="messages.length === 0" class="empty-state">
        <i class="codicon codicon-comment-discussion empty-icon" />
        <p class="empty-title">开始对话</p>
        <p class="empty-desc">输入消息开始与 AI 助手对话</p>
        <div class="mode-hints">
          <div v-for="mode in modes" :key="mode.slug" class="mode-hint">
            <i :class="['codicon', getModeIcon(mode.slug)]" />
            <span>{{ mode.name }}</span>
          </div>
        </div>
      </div>
      <template v-else>
        <template v-for="(msg, i) in messages" :key="i">
          <UserMessage v-if="msg.role === 'user'" :content="msg.content" />
          <AssistantMessage 
            v-else-if="msg.role === 'assistant'" 
            :content="msg.content"
            :reasoning_content="msg.reasoning_content"
            :reasoningPartial="msg.reasoningPartial"
            :reasoningStartTime="msg.reasoningStartTime"
            :isLast="i === messages.length - 1"
            :status="msg.status"
            :toolCalls="msg.toolCalls"
          />
        </template>
      </template>
    </main>

    <!-- 底部栏：清除按钮 + 输入框 -->
    <footer class="footer">
      <button 
        class="clear-history-button" 
        @click="clearHistory"
        :disabled="messages.length === 0 || status !== 'ready'"
      >
        <i class="codicon codicon-trash" />
        清除历史
      </button>
      <Sender :status="status" @submit="send" @cancel="cancel" />
    </footer>
  </div>
</template>

<script setup lang="ts">
import type { WebviewApi } from 'vscode-webview';
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef, computed } from 'vue';
import AssistantMessage from './AssistantMessage.vue';
import type { ToolCallInfo, MessageStatus } from './AssistantMessage.vue';
import Sender from './Sender.vue';
import UserMessage from './UserMessage.vue';
import ModeSelector from './components/ModeSelector.vue';
import type { ModeInfo } from './components/ModeSelector.vue';
import StatusIndicator from './components/StatusIndicator.vue';
import type { StatusType } from './components/StatusIndicator.vue';
import SSEClientWithThinkTag from './api';

// ============ 类型定义 ============

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
  payload: { type: 'text'; content: string };
};

type VscodeChatReasoning = {
  command: 'xiaoke.webview.chat.reasoning';
  payload: { content: string; partial: boolean };
};

type VscodeChatClose = {
  command: 'xiaoke.webview.chat.close';
  payload: undefined;
};

type VscodeChatError = {
  command: 'xiaoke.webview.chat.error';
  payload: unknown;
};

type VscodeModeList = {
  command: 'xiaoke.webview.mode.list';
  payload: ModeInfo[];
};

type VscodeModeCurrent = {
  command: 'xiaoke.webview.mode.current';
  payload: ModeInfo;
};

type VscodeToolCall = {
  command: 'xiaoke.webview.tool.call';
  payload: { name: string; args: Record<string, unknown> };
};

type VscodeToolResult = {
  command: 'xiaoke.webview.tool.result';
  payload: { name: string; result: { success: boolean; content: string; error?: string } };
};

type VscodeHistoryClear = {
  command: 'xiaoke.webview.history.clear';
  payload?: undefined;
};

type VscodeHistoryRestore = {
  command: 'xiaoke.webview.history.restore';
  payload: { messages: Array<{ role: string; content: string | null; tool_calls?: unknown[] }> };
};

type VscodeMessage = 
  | VscodeEnv 
  | VscodeChatOpen 
  | VscodeChatMessage
  | VscodeChatReasoning 
  | VscodeChatClose 
  | VscodeChatError
  | VscodeModeList
  | VscodeModeCurrent
  | VscodeToolCall
  | VscodeToolResult
  | VscodeHistoryClear
  | VscodeHistoryRestore;

// ============ 消息类型 ============

export type AMessage = {
  role: 'assistant';
  content: string;
  reasoning_content: string;
  reasoningPartial?: boolean;      // 是否正在流式输出 reasoning
  reasoningStartTime?: number;     // reasoning 开始时间戳
  status: MessageStatus;
  toolCalls?: ToolCallInfo[];
};

export type UMessage = {
  role: 'user';
  content: string;
};

// ============ 配置状态 ============

const baseURL = ref('http://192.168.0.20:8098');
const thinkTag = ref(true);

// ============ 模式状态 ============

const modes = ref<ModeInfo[]>([
  { slug: 'code', name: '代码模式' },
  { slug: 'architect', name: '架构师模式', readonly: true },
  { slug: 'ask', name: '提问模式', readonly: true },
  { slug: 'debug', name: '调试模式' },
]);
const currentModeSlug = ref('code');
const currentToolName = ref<string | undefined>(undefined);

// 添加模式描述
const modeDescriptions: Record<string, string> = {
  code: '日常编码、编辑和文件操作',
  architect: '规划系统、规范和迁移',
  ask: '快速回答、解释和文档',
  debug: '跟踪问题、添加日志',
};

const modesWithDescription = computed(() => 
  modes.value.map(m => ({
    ...m,
    description: modeDescriptions[m.slug] || '',
  }))
);

// 模式图标映射
const getModeIcon = (slug: string): string => {
  const iconMap: Record<string, string> = {
    code: 'codicon-code',
    architect: 'codicon-organization',
    ask: 'codicon-comment-discussion',
    debug: 'codicon-debug',
  };
  return iconMap[slug] || 'codicon-symbol-misc';
};

// ============ VSCode API ============

const vscode: WebviewApi<unknown> | undefined = (
  import.meta.env.MODE === 'development'
    ? false
    : (JSON.parse(import.meta.env.USEVSCODE || "false") as boolean)
)
  ? typeof acquireVsCodeApi !== 'undefined'
    ? acquireVsCodeApi()
    : undefined
  : undefined;

// ============ 消息监听 ============

const vscodeListener = async (event: MessageEvent<VscodeMessage>) => {
  const { command, payload } = event.data;
  console.debug('VSCode Listener Received message:', command, payload);

  switch (command) {
    case 'xiaoke.webview.env': {
      const envPayload = payload as VscodeEnv['payload'];
      if (envPayload.key === 'baseURL' && typeof envPayload.value === 'string') {
        baseURL.value = envPayload.value;
      } else if (envPayload.key === 'thinkTag' && typeof envPayload.value === 'boolean') {
        thinkTag.value = envPayload.value;
      }
      break;
    }
    case 'xiaoke.webview.chat.open': {
      await handleChatOpen();
      break;
    }
    case 'xiaoke.webview.chat.message': {
      const msgPayload = payload as VscodeChatMessage['payload'];
      handleChatTextMessage(msgPayload.content);
      break;
    }
    case 'xiaoke.webview.chat.reasoning': {
      const reasoningPayload = payload as VscodeChatReasoning['payload'];
      handleReasoningMessage(reasoningPayload.content, reasoningPayload.partial);
      break;
    }
    case 'xiaoke.webview.chat.close': {
      handleChatClose();
      break;
    }
    case 'xiaoke.webview.chat.error': {
      handleChatError(payload);
      break;
    }
    case 'xiaoke.webview.mode.list': {
      modes.value = payload as ModeInfo[];
      break;
    }
    case 'xiaoke.webview.mode.current': {
      currentModeSlug.value = (payload as ModeInfo).slug;
      break;
    }
    case 'xiaoke.webview.history.clear': {
      messages.value = [];
      break;
    }
    case 'xiaoke.webview.history.restore': {
      const restorePayload = payload as VscodeHistoryRestore['payload'];
      handleHistoryRestore(restorePayload.messages);
      break;
    }
    case 'xiaoke.webview.tool.call': {
      const toolPayload = payload as VscodeToolCall['payload'];
      handleToolCall(toolPayload.name, toolPayload.args);
      break;
    }
    case 'xiaoke.webview.tool.result': {
      const resultPayload = payload as VscodeToolResult['payload'];
      handleToolResult(resultPayload.name, resultPayload.result);
      break;
    }
    default:
      console.warn('Unknown command:', command);
  }
};

// ============ 生命周期 ============

onMounted(() => {
  if (vscode !== undefined) {
    window.addEventListener('message', vscodeListener);
    vscode.postMessage({ command: 'xiaoke.webview.env', payload: { key: 'baseURL' } });
    vscode.postMessage({ command: 'xiaoke.webview.env', payload: { key: 'thinkTag' } });
    vscode.postMessage({ command: 'xiaoke.webview.mode.list' });
    vscode.postMessage({ command: 'xiaoke.webview.mode.get' });
    // 请求恢复历史消息（如果有的话）
    vscode.postMessage({ command: 'xiaoke.webview.history.restore' });
  }
});

onUnmounted(() => {
  if (vscode !== undefined) {
    window.removeEventListener('message', vscodeListener);
  }
});

// ============ 消息状态 ============

const messages = ref<(UMessage | AMessage)[]>([]);
const status = ref<'ready' | 'thinking' | 'answering'>('ready');
const index = ref(-1);
let toolCallCounter = 0;

// 状态指示器状态
const indicatorStatus = computed<StatusType>(() => {
  if (status.value === 'ready') return 'ready';
  if (currentToolName.value) return 'tooling';
  if (status.value === 'thinking') return 'thinking';
  return 'answering';
});

// ============ 聊天处理 ============

const handleChatOpen = async () => {
  console.log('[WebView] handleChatOpen called, thinkTag:', thinkTag.value);
  status.value = thinkTag.value ? 'thinking' : 'answering';
  currentToolName.value = undefined;
  
  index.value = messages.value.push({
    role: 'assistant',
    content: '',
    reasoning_content: '',
    status: thinkTag.value ? 'thinking' : 'answering',
    toolCalls: [],
  }) - 1;
  
  console.log('[WebView] 新消息已创建, index:', index.value, 'messages 长度:', messages.value.length);
  scrollToBottom();
};

/** 处理文本消息（增量） */
const handleChatTextMessage = (content: string) => {
  console.log('[WebView] handleChatTextMessage, index:', index.value, 'content:', content.substring(0, 20));
  if (index.value < 0 || index.value >= messages.value.length) {
    console.warn('[WebView] handleChatTextMessage: invalid index', index.value);
    return;
  }
  
  const msg = messages.value[index.value] as AMessage;
  msg.content += content;
  msg.status = 'answering';
  status.value = 'answering';
  currentToolName.value = undefined;
  console.log('[WebView] 更新后 content 长度:', msg.content.length);
  scrollToBottom();
};

/** 处理 reasoning 消息 */
const handleReasoningMessage = (content: string, partial: boolean) => {
  console.log('[WebView] handleReasoningMessage, index:', index.value, 'partial:', partial, 'length:', content.length);
  if (index.value < 0 || index.value >= messages.value.length) {
    console.warn('[WebView] handleReasoningMessage: invalid index', index.value);
    return;
  }
  
  const msg = messages.value[index.value] as AMessage;
  msg.reasoning_content = content;  // 注意：这里是替换而非追加，因为 extension 发送的是累积内容
  msg.reasoningPartial = partial;
  
  // 记录开始时间（仅在首次）
  if (partial && !msg.reasoningStartTime) {
    msg.reasoningStartTime = Date.now();
  }
  
  console.log('[WebView] 更新后 reasoning_content 长度:', msg.reasoning_content.length);
  scrollToBottom();
};

const handleChatClose = () => {
  console.log('SSE connection closed');
  if (index.value >= 0 && index.value < messages.value.length) {
    (messages.value[index.value] as AMessage).status = 'completed';
  }
  status.value = 'ready';
  index.value = -1;
  currentToolName.value = undefined;
};

const handleChatError = (err: unknown) => {
  console.error('SSE on Error:', err);

  if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant') {
    const msg = messages.value[messages.value.length - 1] as AMessage;
    msg.content += `\n\n❌ 错误：${err}`;
    msg.status = 'completed';
  } else {
    messages.value.push({
      role: 'assistant',
      content: `❌ 连接错误：${err}`,
      reasoning_content: '',
      status: 'completed',
    });
  }

  status.value = 'ready';
  index.value = -1;
  currentToolName.value = undefined;
};

// ============ 工具调用处理 ============

const handleToolCall = (name: string, args: Record<string, unknown>) => {
  console.log('Tool call:', name, args);
  currentToolName.value = name;
  
  if (index.value >= 0 && index.value < messages.value.length) {
    const msg = messages.value[index.value] as AMessage;
    if (!msg.toolCalls) {
      msg.toolCalls = [];
    }
    
    const toolCall: ToolCallInfo = {
      id: `tool_${++toolCallCounter}`,
      name,
      args,
      status: 'running',
    };
    
    msg.toolCalls.push(toolCall);
    scrollToBottom();
  }
};

const handleToolResult = (name: string, result: { success: boolean; content: string; error?: string }) => {
  console.log('Tool result:', name, result.success ? 'success' : 'error');
  
  if (index.value >= 0 && index.value < messages.value.length) {
    const msg = messages.value[index.value] as AMessage;
    if (msg.toolCalls) {
      // 找到最后一个匹配名称且还在运行的工具调用
      const toolCall = [...msg.toolCalls].reverse().find(
        t => t.name === name && t.status === 'running'
      );
      
      if (toolCall) {
        toolCall.result = result;
        toolCall.status = result.success ? 'success' : 'error';
      }
    }
  }
  
  currentToolName.value = undefined;
  scrollToBottom();
};

// ============ SSE 客户端（开发模式） ============

// 开发模式下的消息处理兼容层
const handleChatMessageCompat = (type: "thinking" | "answering", buffer: string) => {
  if (type === 'thinking') {
    // 模拟 reasoning 消息（累积模式）
    if (index.value >= 0 && index.value < messages.value.length) {
      const msg = messages.value[index.value] as AMessage;
      msg.reasoning_content += buffer;
      msg.reasoningPartial = true;
      if (!msg.reasoningStartTime) {
        msg.reasoningStartTime = Date.now();
      }
    }
  } else {
    handleChatTextMessage(buffer);
  }
  scrollToBottom();
};

const client = new SSEClientWithThinkTag(
  baseURL.value,
  thinkTag.value,
  handleChatOpen,
  handleChatMessageCompat,
  handleChatClose,
  handleChatError,
);

// ============ 用户操作 ============

async function cancel() {
  if (vscode !== undefined) {
    vscode.postMessage({ command: 'xiaoke.webview.chat.cancel' });
  } else {
    await client.cancel();
  }
  status.value = 'ready';
  currentToolName.value = undefined;
  if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant') {
    (messages.value[messages.value.length - 1] as AMessage).status = 'completed';
  }
}

async function send(content: string) {
  if (content.trim() === '' || status.value !== 'ready') {
    console.error('unready or empty content');
    return;
  }

  messages.value.push({ role: 'user', content: content.trim() });
  scrollToBottom();

  if (vscode !== undefined) {
    vscode.postMessage({ command: 'xiaoke.webview.chat.invoke', payload: content });
  } else {
    await client.invoke(content);
  }
}

function clearHistory() {
  messages.value = [];
  if (vscode !== undefined) {
    vscode.postMessage({ command: 'xiaoke.webview.chat.clear' });
  }
}

/** 处理历史消息恢复 */
function handleHistoryRestore(historyMessages: Array<{ role: string; content: string | null; tool_calls?: unknown[] }>) {
  console.log(`[历史恢复] 收到 ${historyMessages.length} 条消息`);
  
  // 清空当前消息
  messages.value = [];
  
  // 转换后端消息格式为前端格式
  for (const msg of historyMessages) {
    if (msg.role === 'user' && msg.content) {
      messages.value.push({
        role: 'user',
        content: msg.content,
      });
    } else if (msg.role === 'assistant' && msg.content) {
      messages.value.push({
        role: 'assistant',
        content: msg.content,
        reasoning_content: '',  // 历史消息不包含 reasoning
        status: 'completed',
        toolCalls: [],  // TODO: 可以后续支持恢复工具调用显示
      });
    }
    // 跳过 system 和 tool 角色的消息（不在 UI 中显示）
  }
  
  console.log(`[历史恢复] 已恢复 ${messages.value.length} 条 UI 消息`);
  scrollToBottom();
}

function onModeChange(slug: string) {
  if (vscode !== undefined) {
    vscode.postMessage({ 
      command: 'xiaoke.webview.mode.set', 
      payload: { slug } 
    });
    messages.value = [];
  }
}

// ============ 滚动辅助 ============

const mainContainer = useTemplateRef('mainContainer');

const scrollToBottom = () => {
  nextTick(() => {
    mainContainer.value?.scrollTo({
      top: mainContainer.value.scrollHeight,
      behavior: 'smooth',
    });
  });
};
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--vscode-editor-background);
}

.header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
}

.main-container {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 12px;
}

.footer {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-top: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--vscode-descriptionForeground);
  text-align: center;
  padding: 20px;
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
  font-size: 13px;
  margin: 0 0 20px 0;
}

.mode-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.mode-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 12px;
  font-size: 11px;
}

.mode-hint .codicon {
  font-size: 12px;
}

/* 清除历史按钮 */
.clear-history-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 6px 12px;
  margin-bottom: 8px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.clear-history-button:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground);
  border-color: var(--vscode-focusBorder);
}

.clear-history-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clear-history-button .codicon {
  font-size: 14px;
}

/* 滚动条样式 */
.main-container::-webkit-scrollbar {
  width: 8px;
}

.main-container::-webkit-scrollbar-track {
  background: transparent;
}

.main-container::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
  border-radius: 4px;
}

.main-container::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-hoverBackground);
}
</style>
