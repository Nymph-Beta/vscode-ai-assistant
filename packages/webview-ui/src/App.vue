<template>
  <header
    style="
      flex: 0 0 auto;
      padding: 8px;
    "
  >
    <label v-if="toggleThingTag" style="margin-left: 12px; color: var(--vscode-foreground, #cccccc);">
      <input type="checkbox" v-model="thinkTag" style="margin-right: 4px;" />
      思考模式
    </label>
  </header>
  <main
    ref="mainContainer"
    style="
      flex: 1 1 auto;
      overflow-y: auto;
      box-sizing: border-box;
    ">
    <template v-for="(msg, i) in messages" :key="i">
      <UserMessage v-if="msg.role === 'user'" :content="msg.content" />
      <AssistantMessage v-else-if="msg.role === 'assistant'" :content="msg.content"
        :reasoning_content="msg.reasoning_content" :status="msg.status" />
    </template>
  </main>
  <footer style="flex: 0 0 auto;">
    <button class="clear-history-button" style="width: 100%;" @click="messages = []">清除历史</button>
    <Sender :status="status" @submit="send" @cancel="cancel" />
  </footer>
</template>

<script setup lang="ts">
import type { WebviewApi } from 'vscode-webview';
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import AssistantMessage from './AssistantMessage.vue';
import Sender from './Sender.vue';
import UserMessage from './UserMessage.vue';

export type AssistantMessage = {
  role: 'assistant';
  content: string;
  reasoning_content: string;
  status: 'thinking' | 'answering' | 'completed';
};
type UserMessage = { role: 'user'; content: string };
type Msg = UserMessage | AssistantMessage;

const messages = ref<Msg[]>([]);

const toggleThingTag = ref(import.meta.env.MODE === 'development');
const thinkTag = ref(toggleThingTag.value);
const status = ref<'ready' | 'thinking' | 'answering'>('ready');

const vscode: WebviewApi<unknown> | undefined =
  typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : undefined;
let controller: AbortController | null = null;

const THINK = '</think>';
const prefixs = ['</think', '</thin', '</thi', '</th', '</t', '</', '<'];

const mainContainer = useTemplateRef('mainContainer');

onMounted(() => {
  if (typeof vscode !== 'undefined') {
    window.addEventListener('message', handleMessage);
  }
});

onUnmounted(() => {
  if (typeof vscode !== 'undefined') {
    window.removeEventListener('message', handleMessage);
  }
});

const handleMessage = async (event: MessageEvent) => {
  const { command, payload } = event.data as
    | {
        command: 'xiaoke.chat.stream';
        payload: { type: 'thinking' | 'answering'; buffer: string };
      }
    | {
        command: 'xiaoke.chat.end';
        payload: undefined;
      }
    | {
        command: 'xiaoke.prompt';
        payload: string;
      };

  if (typeof command === 'string') {
    console.log('Received message:', command, payload);

    switch (command) {
      case 'xiaoke.chat.stream': {
        status.value = payload.type;
        if (messages.value[messages.value.length - 1].role !== 'assistant') {
          messages.value.push({
            role: 'assistant',
            content: '',
            reasoning_content: '',
            status: payload.type,
          });
          scrollToBottom();
        }
        switch (payload.type) {
          case 'thinking':
            (messages.value[messages.value.length - 1] as AssistantMessage).reasoning_content += payload.buffer;
            break;
          case 'answering':
            (messages.value[messages.value.length - 1] as AssistantMessage).content += payload.buffer;
            (messages.value[messages.value.length - 1] as AssistantMessage).status = 'answering';
            break;
        }
        scrollToBottom();
        break;
      }
      case 'xiaoke.chat.end': {
        status.value = 'ready';
        (messages.value[messages.value.length - 1] as AssistantMessage).status = 'completed';
        break;
      }
      case 'xiaoke.prompt': {
        await send(payload);
        break;
      }
      default:
        console.warn('Unknown command:', command);
    }
  }
};

async function cancel() {
  if (typeof vscode !== 'undefined') {
    vscode.postMessage({
      command: 'xiaoke.chat.cancel',
      prompt: undefined,
    });
  } else {
    if (controller) {
      controller.abort();
      controller = null;
    }
  }
  status.value = 'ready';
  if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant') {
    (messages.value[messages.value.length - 1] as AssistantMessage).status = 'completed';
  }
}

async function send(content: string) {
  messages.value.push({ role: 'user', content: content.trim() });

  if (typeof vscode !== 'undefined') {
    vscode.postMessage({
      command: 'xiaoke.chat.start',
      prompt: content,
    });
  } else {
    controller = new AbortController();

    try {
      const response = await fetch('http://192.168.0.20:8098/getStreamChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: content }),
        signal: controller.signal,
      });

      if (!response.body) {
        messages.value.push({
          role: 'assistant',
          content: '未知错误',
          reasoning_content: '',
          status: 'completed',
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      status.value = thinkTag.value ? 'thinking' : 'answering';
      let buffer = '';

      const index =
        messages.value.push({
          role: 'assistant',
          content: '',
          reasoning_content: '',
          status: thinkTag.value ? 'thinking' : 'answering',
        }) - 1;

      scrollToBottom();
      stream: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder
          .decode(value, { stream: true })
          .replace(/data:/g, '')
          .replace(/\n/g, '')
          .replace(/<\|enter\|>/g, '\n');
        console.log('receive:', chunk, value);

        if (thinkTag.value === false) {
          messages.value[index].content += chunk;
          continue;
        }

        if (status.value === 'thinking') {
          buffer += chunk;

          if (buffer.includes(THINK)) {
            const [before, after] = buffer
              .split(THINK, 1)
              .concat(buffer.split(THINK).slice(1).join(THINK))
              .map((p) => p.trim());
            (messages.value[index] as AssistantMessage).reasoning_content += before;
            (messages.value[index] as AssistantMessage).content += after;
            (messages.value[index] as AssistantMessage).status = 'answering';
            status.value = 'answering';
            buffer = '';
            continue;
          }

          for (const prefix of prefixs) {
            if (buffer.endsWith(prefix)) {
              console.log(buffer, 'end with', prefix);
              (messages.value[index] as AssistantMessage).reasoning_content += buffer.substring(
                0,
                buffer.lastIndexOf(prefix),
              );
              buffer = buffer.substring(buffer.lastIndexOf(prefix));
              console.log(buffer);
              continue stream;
            }
          }

          (messages.value[index] as AssistantMessage).reasoning_content += buffer;
          buffer = '';
        } else {
          if (buffer !== '') console.error('assert error: buffer is not empty');
          messages.value[index].content += chunk;
        }
        scrollToBottom();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was cancelled by user');
        return;
      } else {
        console.error(error);
        messages.value.push({
          role: 'assistant',
          content: '无法连接到服务器，请检查网络连接或服务器状态。',
          reasoning_content: '',
          status: 'completed',
        });
      }
    } finally {
      status.value = 'ready';
      if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'assistant')
        (messages.value[messages.value.length - 1] as AssistantMessage).status = 'completed';
      controller = null;
    }
  }
}

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