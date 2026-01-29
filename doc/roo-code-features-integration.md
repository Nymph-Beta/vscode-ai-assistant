# Roo-Code 功能集成记录

本文档记录了将 Roo-Code 的核心功能集成到 vscode-tools 项目中的所有修改。

## 目录

1. [功能概述](#功能概述)
2. [工具系统](#工具系统)
3. [终端管理](#终端管理)
4. [模式系统](#模式系统)
5. [上下文收集](#上下文收集)
6. [AI 服务增强](#ai-服务增强)
7. [WebView UI 增强](#webview-ui-增强)
8. [配置与命令](#配置与命令)

---

## 功能概述

本次集成实现了以下核心功能：

- **工具调用系统**：允许 AI 执行文件读写、搜索、终端命令等操作
- **模式系统**：支持代码、架构师、提问、调试四种工作模式
- **上下文收集**：自动收集当前工作环境信息提供给 AI
- **UI 可视化**：在 WebView 中显示工具调用状态和结果

---

## 工具系统

### 新增文件

#### `packages/extension/src/tools/BaseTool.ts`

定义了工具的基础抽象类和类型：

```typescript
// 核心类型定义
interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

interface ToolInput {
  [key: string]: unknown;
}

// 工具基类
abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: ToolInputSchema;
  abstract execute(input: ToolInput): Promise<ToolResult>;
  
  // 生成 OpenAI 兼容的工具定义
  getOpenAIToolDefinition(): OpenAIToolDefinition;
  
  // 辅助方法
  protected successResult(output: string): ToolResult;
  protected failureResult(error: string): ToolResult;
}
```

#### `packages/extension/src/tools/ToolRegistry.ts`

工具注册中心，管理所有可用工具：

```typescript
class ToolRegistry {
  register(tool: BaseTool): void;
  registerAll(tools: BaseTool[]): void;
  get(name: string): BaseTool | undefined;
  has(name: string): boolean;
  getAll(): BaseTool[];
  getNames(): string[];
  getToolDefinitions(allowedTools?: string[]): OpenAIToolDefinition[];
  execute(name: string, input: ToolInput): Promise<ToolResult>;
  unregister(name: string): boolean;
  clear(): void;
}

// 导出单例
export const toolRegistry = new ToolRegistry();
```

#### `packages/extension/src/tools/ReadFileTool.ts`

读取文件内容的工具：

- **名称**: `read_file`
- **功能**: 读取工作区内文件内容
- **参数**:
  - `path` (必需): 文件路径
  - `start_line` (可选): 起始行号
  - `end_line` (可选): 结束行号
- **特性**: 支持行号显示、行范围读取、自动路径解析

#### `packages/extension/src/tools/WriteToFileTool.ts`

写入文件内容的工具：

- **名称**: `write_to_file`
- **功能**: 创建或覆盖文件
- **参数**:
  - `path` (必需): 文件路径
  - `content` (必需): 文件内容
- **安全特性**:
  - 限制只能写入工作区内
  - 禁止写入敏感文件（`.env`, `credentials`, `secrets` 等）
  - 自动创建父目录

#### `packages/extension/src/tools/ListFilesTool.ts`

列出目录内容的工具：

- **名称**: `list_files`
- **功能**: 列出目录中的文件和子目录
- **参数**:
  - `path` (必需): 目录路径
  - `recursive` (可选): 是否递归，默认 false
  - `max_depth` (可选): 最大递归深度，默认 3
- **特性**: 自动忽略 `node_modules`、`.git`、`dist` 等目录

#### `packages/extension/src/tools/SearchFilesTool.ts`

搜索文件内容的工具：

- **名称**: `search_files`
- **功能**: 在文件中搜索文本或正则表达式
- **参数**:
  - `pattern` (必需): 搜索模式
  - `path` (可选): 搜索路径，默认工作区根目录
  - `file_pattern` (可选): 文件名过滤 glob
  - `case_sensitive` (可选): 是否区分大小写
  - `is_regex` (可选): 是否为正则表达式
  - `max_results` (可选): 最大结果数

#### `packages/extension/src/tools/ExecuteCommandTool.ts`

执行终端命令的工具：

- **名称**: `execute_command`
- **功能**: 在终端执行 shell 命令
- **参数**:
  - `command` (必需): 要执行的命令
  - `cwd` (可选): 工作目录
  - `timeout` (可选): 超时时间（毫秒）
- **安全特性**:
  - 危险命令黑名单：`rm -rf /`, `mkfs`, `dd if=` 等
  - 警告模式：`sudo`, `chmod 777`, `>` 重定向等

#### `packages/extension/src/tools/index.ts`

工具模块导出和默认注册：

```typescript
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll([
    new ReadFileTool(),
    new WriteToFileTool(),
    new ListFilesTool(),
    new SearchFilesTool(),
    new ExecuteCommandTool(),
  ]);
  return registry;
}
```

---

## 终端管理

### 新增文件

#### `packages/extension/src/terminal/TerminalManager.ts`

终端命令执行管理器：

```typescript
class TerminalManager {
  // 阻塞式执行命令
  async executeCommand(
    command: string,
    cwd?: string,
    timeout?: number
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
  }>;
  
  // 流式执行命令（实时输出）
  executeCommandStreaming(
    command: string,
    cwd?: string,
    onOutput?: (data: string) => void,
    onError?: (data: string) => void
  ): { process: ChildProcess; promise: Promise<...> };
  
  // 终止所有运行中的进程
  killAll(): void;
}

// 导出单例
export const terminalManager = new TerminalManager();
```

**特性**:
- 支持自定义工作目录
- 支持超时控制
- 自动清理 ANSI 转义序列
- 进程生命周期管理

#### `packages/extension/src/terminal/index.ts`

终端模块导出。

---

## 模式系统

### 新增文件

#### `packages/extension/src/modes/types.ts`

模式类型定义：

```typescript
interface Mode {
  slug: string;           // 唯一标识
  name: string;           // 显示名称
  icon: string;           // 图标
  roleDefinition: string; // AI 角色定义（系统提示）
  allowedTools: string[]; // 允许使用的工具列表
  customInstructions?: string;
  readonly?: boolean;     // 是否为只读模式
}

interface ModeConfig {
  customModes?: Mode[];
  defaultMode?: string;
  disabledModes?: string[];
}
```

#### `packages/extension/src/modes/defaultModes.ts`

预定义的四种工作模式：

| 模式 | Slug | 图标 | 允许的工具 | 特点 |
|------|------|------|------------|------|
| **代码模式** | `code` | `code` | 全部工具 | 日常编码、编辑文件 |
| **架构师模式** | `architect` | `compass` | `read_file`, `list_files`, `search_files` | 只读，用于规划设计 |
| **提问模式** | `ask` | `comment-discussion` | `read_file`, `list_files`, `search_files` | 只读，快速问答 |
| **调试模式** | `debug` | `bug` | 全部工具 | 问题追踪、添加日志 |

#### `packages/extension/src/modes/ModeManager.ts`

模式管理器：

```typescript
class ModeManager {
  // 刷新配置
  refreshConfig(): void;
  
  // 获取/设置当前模式
  getCurrentMode(): Mode;
  setCurrentMode(slug: string): boolean;
  
  // 获取可用模式
  getAvailableModes(): Mode[];
  
  // 获取当前模式允许的工具
  getAllowedTools(): string[];
  
  // 构建系统提示
  buildSystemPrompt(additionalContext?: string): string;
}

// 导出单例
export const modeManager = new ModeManager();
```

#### `packages/extension/src/modes/index.ts`

模式模块导出。

---

## 上下文收集

### 新增文件

#### `packages/extension/src/context/ContextCollector.ts`

上下文收集器，自动收集开发环境信息：

```typescript
class ContextCollector {
  // 获取当前活动文件上下文
  async getActiveFileContext(): Promise<{
    path: string;
    relativePath: string;
    content: string;
    language: string;
    selection?: { start: Position; end: Position; text: string };
    cursorPosition?: Position;
  } | null>;
  
  // 获取工作区上下文
  getWorkspaceContext(): {
    rootPath: string;
    name: string;
    openFiles: string[];
  } | null;
  
  // 获取当前文件的诊断信息（错误、警告）
  getActiveDiagnostics(): Diagnostic[];
  
  // 获取完整上下文
  async getFullContext(): Promise<FullContext>;
  
  // 格式化上下文为提示文本
  formatContextForPrompt(context: FullContext): string;
}

// 导出单例
export const contextCollector = new ContextCollector();
```

**收集的信息**:
- 当前打开的文件路径和内容
- 选中的代码片段
- 光标位置
- 文件语言类型
- 工作区信息
- 诊断信息（lint 错误等）

#### `packages/extension/src/context/index.ts`

上下文模块导出。

---

## AI 服务增强

### 修改文件

#### `packages/extension/src/ai_service.ts`

增强 AI 服务以支持工具调用：

**新增类型**:
```typescript
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];      // 新增
  tool_call_id?: string;        // 新增
}
```

**新增方法**:
```typescript
class AiService {
  // 设置工具注册表
  setToolRegistry(registry: ToolRegistry): void;
  
  // 增强的聊天方法，支持工具调用循环
  async chat(
    messages: ChatMessage[],
    systemPrompt?: string,
    callback?: StreamCallback,
    allowedTools?: string[]  // 新增：限制可用工具
  ): Promise<string>;
}
```

**工具调用流程**:
1. 发送消息时附带工具定义
2. 解析 AI 响应中的 `tool_calls`
3. 执行对应工具并收集结果
4. 将工具结果作为新消息追加
5. 继续对话直到 AI 完成响应

**新增回调**:
```typescript
interface StreamCallback {
  // ... 原有回调
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
}
```

---

## WebView UI 增强

### 新增组件

#### `packages/webview-ui/src/components/ToolBlock.vue`

工具调用可视化组件：

- 显示工具图标和名称
- 显示执行状态（pending/running/success/error）
- 可展开显示工具参数
- 使用 `CodeAccordion` 显示执行结果

```vue
<template>
  <div class="tool-block" :class="statusClass">
    <div class="tool-header">
      <i :class="toolIcon"></i>
      <span class="tool-title">{{ displayTitle }}</span>
      <span class="tool-status">{{ statusText }}</span>
    </div>
    <CodeAccordion v-if="tool.result" :content="tool.result" />
  </div>
</template>
```

#### `packages/webview-ui/src/components/CodeAccordion.vue`

可折叠的代码/文本展示组件：

- 折叠/展开功能
- 显示行数统计
- 复制到剪贴板按钮
- 支持 success/error 状态样式

#### `packages/webview-ui/src/components/ModeSelector.vue`

模式选择器组件：

- 下拉菜单式选择
- 显示模式图标和名称
- 显示模式描述
- 标记只读模式（锁图标）
- 点击外部自动关闭

```vue
<template>
  <div class="mode-selector">
    <button class="mode-trigger" @click="toggleDropdown">
      <i :class="currentModeIcon"></i>
      <span>{{ currentModeName }}</span>
    </button>
    <div v-if="isOpen" class="mode-dropdown">
      <div v-for="mode in modes" 
           :key="mode.slug"
           class="mode-option"
           @click="selectMode(mode.slug)">
        <!-- 模式选项 -->
      </div>
    </div>
  </div>
</template>
```

#### `packages/webview-ui/src/components/StatusIndicator.vue`

状态指示器组件：

- 显示 AI 当前状态（ready/thinking/tooling/answering/error）
- 状态点带脉冲动画
- 工具执行时显示工具名称

### 修改组件

#### `packages/webview-ui/src/App3.vue`

主应用组件增强：

**新增状态**:
```typescript
const currentMode = ref('code');
const modes = ref<Mode[]>([]);
const indicatorStatus = ref<'ready'|'thinking'|'tooling'|'answering'|'error'>('ready');
const currentToolName = ref('');

// 工具调用跟踪
interface ToolCallInfo {
  id: string;
  type: string;
  args: Record<string, any>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
}
```

**新增消息处理**:
```typescript
// 处理工具调用开始
case 'xiaoke.webview.tool.call':
  indicatorStatus.value = 'tooling';
  currentToolName.value = msg.toolCall.function.name;
  // 添加到当前消息的 toolCalls 数组
  break;

// 处理工具调用结果
case 'xiaoke.webview.tool.result':
  // 更新对应工具调用的状态和结果
  break;
```

**UI 结构**:
```vue
<template>
  <div class="app-container">
    <!-- 头部：模式选择器 + 状态指示器 -->
    <header class="app-header">
      <ModeSelector />
      <StatusIndicator />
    </header>
    
    <!-- 空状态欢迎界面 -->
    <div v-if="messages.length === 0" class="empty-state">
      <!-- 欢迎信息和模式说明 -->
    </div>
    
    <!-- 消息列表 -->
    <div class="messages-container">
      <template v-for="msg in messages">
        <UserMessage v-if="msg.role === 'user'" />
        <AssistantMessage v-else :toolCalls="msg.toolCalls" />
      </template>
    </div>
    
    <!-- 底部：清除按钮 + 输入框 -->
    <footer>
      <button class="clear-btn">清除历史</button>
      <Sender />
    </footer>
  </div>
</template>
```

#### `packages/webview-ui/src/AssistantMessage.vue`

助手消息组件增强：

- 新增 `toolCalls` 属性
- 集成 `ToolBlock` 组件显示工具调用
- 增加生成中指示器
- 更新图标为 `codicon-hubot`
- 增强 Markdown 渲染样式

#### `packages/webview-ui/src/UserMessage.vue`

用户消息组件样式统一：

- 统一边距、圆角、背景色
- 统一 Markdown 渲染样式
- 禁用 HTML 解析（安全）

#### `packages/webview-ui/src/index.css`

全局样式增强：

```css
/* 新增样式 */
- 状态徽章样式（.badge-*）
- 动画定义（@keyframes spin, pulse, fadeIn）
- 滚动条样式
- 按钮样式（.btn-primary, .btn-secondary）
- 工具类（.flex, .gap-*, .w-full 等）
- VS Code 主题变量统一使用
```

### WebView Provider 修改

#### `packages/extension/src/webview-view-provider.ts`

**新增导入和初始化**:
```typescript
import { createDefaultToolRegistry, ToolRegistry } from './tools';
import { modeManager } from './modes';
import { contextCollector } from './context';

// 构造函数中初始化工具注册表
this._toolRegistry = createDefaultToolRegistry();
this._aiService.setToolRegistry(this._toolRegistry);
```

**新增消息处理**:
```typescript
// 获取模式列表
case 'xiaoke.webview.mode.list':
  // 返回可用模式

// 获取当前模式
case 'xiaoke.webview.mode.get':
  // 返回当前模式

// 设置模式
case 'xiaoke.webview.mode.set':
  // 切换模式并清除聊天历史

// 清除历史
case 'xiaoke.webview.chat.clear':
  // 清除消息历史
```

**聊天处理增强**:
```typescript
async _handleChatInvoke(userMessage: string) {
  // 1. 刷新配置
  modeManager.refreshConfig();
  
  // 2. 收集上下文
  const context = await contextCollector.getFullContext();
  const contextPrompt = contextCollector.formatContextForPrompt(context);
  
  // 3. 构建系统提示
  const systemPrompt = modeManager.buildSystemPrompt(contextPrompt);
  
  // 4. 获取允许的工具
  const allowedTools = modeManager.getAllowedTools();
  
  // 5. 调用 AI（带工具调用回调）
  await this._aiService.chat(
    messages,
    systemPrompt,
    {
      onToolCall: (tc) => this._sendToolCall(tc),
      onToolResult: (name, result) => this._sendToolResult(name, result),
      // ... 其他回调
    },
    allowedTools
  );
}
```

**新增方法**:
```typescript
// 发送工具调用状态到 WebView
_sendToolCall(toolCall: ToolCall): void;

// 发送工具结果到 WebView
_sendToolResult(toolName: string, result: ToolResult): void;
```

---

## 配置与命令

### 修改文件

#### `packages/extension/package.json`

**新增配置**:
```json
{
  "configuration": [
    {
      "title": "模式设置",
      "properties": {
        "vscode-tools.modes.defaultMode": {
          "type": "string",
          "default": "code",
          "enum": ["code", "architect", "ask", "debug"],
          "description": "默认工作模式"
        },
        "vscode-tools.modes.disabledModes": {
          "type": "array",
          "default": [],
          "description": "禁用的模式列表"
        }
      }
    }
  ]
}
```

**新增命令**:
```json
{
  "commands": [
    {
      "command": "vscode-tools.mode.code",
      "title": "VSCode Tools: 切换到代码模式"
    },
    {
      "command": "vscode-tools.mode.architect",
      "title": "VSCode Tools: 切换到架构师模式"
    },
    {
      "command": "vscode-tools.mode.ask",
      "title": "VSCode Tools: 切换到提问模式"
    },
    {
      "command": "vscode-tools.mode.debug",
      "title": "VSCode Tools: 切换到调试模式"
    }
  ]
}
```

#### `packages/extension/src/extension.ts`

**新增命令注册**:
```typescript
// 模式切换命令
context.subscriptions.push(
  vscode.commands.registerCommand('vscode-tools.mode.code', () => {
    modeManager.setCurrentMode('code');
    vscode.window.showInformationMessage('已切换到代码模式');
  }),
  // ... 其他模式命令
);
```

**新增清理逻辑**:
```typescript
export function deactivate() {
  terminalManager.killAll();
}
```

---

## 文件结构总览

```
packages/
├── extension/
│   └── src/
│       ├── ai_service.ts          # [修改] 增强工具调用支持
│       ├── extension.ts           # [修改] 注册模式命令
│       ├── webview-view-provider.ts # [修改] 集成工具/模式/上下文
│       ├── context/               # [新增] 上下文收集模块
│       │   ├── ContextCollector.ts
│       │   └── index.ts
│       ├── modes/                 # [新增] 模式系统模块
│       │   ├── defaultModes.ts
│       │   ├── ModeManager.ts
│       │   ├── types.ts
│       │   └── index.ts
│       ├── terminal/              # [新增] 终端管理模块
│       │   ├── TerminalManager.ts
│       │   └── index.ts
│       └── tools/                 # [新增] 工具系统模块
│           ├── BaseTool.ts
│           ├── ExecuteCommandTool.ts
│           ├── ListFilesTool.ts
│           ├── ReadFileTool.ts
│           ├── SearchFilesTool.ts
│           ├── ToolRegistry.ts
│           ├── WriteToFileTool.ts
│           └── index.ts
└── webview-ui/
    └── src/
        ├── App3.vue               # [修改] 主应用增强
        ├── AssistantMessage.vue   # [修改] 工具调用显示
        ├── UserMessage.vue        # [修改] 样式统一
        ├── index.css              # [修改] 全局样式增强
        ├── index.ts               # [修改] 入口文件
        └── components/            # [新增] 新组件目录
            ├── CodeAccordion.vue
            ├── ModeSelector.vue
            ├── StatusIndicator.vue
            └── ToolBlock.vue
```

---

## 使用说明

### 模式切换

1. **通过 UI**: 点击 WebView 顶部的模式选择器
2. **通过命令面板**: `Ctrl+Shift+P` → 输入 "VSCode Tools: 切换到..."
3. **通过配置**: 设置 `vscode-tools.modes.defaultMode`

### 工具调用

AI 会根据当前模式自动决定是否使用工具。在代码模式和调试模式下，AI 可以：
- 读取文件内容
- 创建/修改文件
- 列出目录结构
- 搜索代码
- 执行终端命令

工具调用过程会在 WebView 中实时显示状态和结果。

### 构建命令

```bash
# 构建 webview-ui
cd packages/webview-ui && pnpm build

# 复制构建产物
cp -r packages/webview-ui/dist packages/extension/webview-ui

# 构建 extension
cd packages/extension && pnpm build

# 打包扩展
cd packages/extension && pnpm package
```

---

## 更新日志

- **2025-01-28**: 初始集成完成
  - 实现工具系统（5 个内置工具）
  - 实现模式系统（4 种工作模式）
  - 实现上下文收集器
  - 增强 AI 服务支持工具调用
  - 新增 WebView UI 组件（ToolBlock, CodeAccordion, ModeSelector, StatusIndicator）
  - 更新主应用界面布局和样式
