# VSCode Tools

<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-1.82+-blue?logo=visualstudiocode" alt="VS Code Version">
  <img src="https://img.shields.io/badge/Node.js-18+-green?logo=node.js" alt="Node.js Version">
  <img src="https://img.shields.io/badge/TypeScript-5.8+-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vue-3.5+-green?logo=vue.js" alt="Vue 3">
</p>

一个功能强大的 VS Code AI 编程助手扩展，支持多种工作模式、智能工具调用和流式对话。灵感来源于 [Roo-Code](https://github.com/RooCodeInc/Roo-Code)。

## ✨ 功能特性

### 🎯 多模式系统

根据不同的工作场景，提供 4 种专业工作模式：

| 模式 | 图标 | 说明 | 工具权限 |
|------|------|------|----------|
| **代码模式** | 💻 | 日常编码、编辑和文件操作 | 全部工具 |
| **架构师模式** | 🏗️ | 规划系统、设计架构（只读） | 读取/搜索 |
| **提问模式** | ❓ | 快速问答、解释和文档（只读） | 读取/搜索 |
| **调试模式** | 🪲 | 问题诊断、添加日志 | 全部工具 |

### 🛠️ 智能工具系统

AI 可以自动调用工具完成任务：

**基础工具**:
| 工具 | 功能 | 说明 |
|------|------|------|
| `read_file` | 📖 读取文件 | 支持行范围读取 |
| `write_to_file` | ✏️ 写入文件 | 自动创建目录，安全检查 |
| `list_files` | 📂 列出目录 | 支持递归，智能忽略 |
| `search_files` | 🔍 搜索文件 | 支持正则表达式 |
| `execute_command` | ⚡ 执行命令 | 终端命令，危险命令检测 |

**高级编辑工具**:
| 工具 | 功能 | 说明 |
|------|------|------|
| `edit_file` | ✂️ 编辑文件 | 搜索替换，智能空白符处理 |
| `apply_diff` | 🔄 应用差异 | 应用 unified diff 补丁 |
| `codebase_search` | 🔎 语义搜索 | 基于向量的代码搜索 |
| `checkpoint` | 💾 检查点 | 创建和恢复代码快照 |

### 💬 流式对话

- **Generator 模式**：实时流式输出，响应更快
- **思考过程展示**：支持 DeepSeek 等模型的 reasoning 输出
- **计时器**：显示 AI 思考时间
- **可折叠内容**：思考过程可展开/收起

### 🤖 多 AI Provider 支持

支持多种 AI 服务提供商和本地模型：

| Provider | 说明 | 支持功能 |
|----------|------|----------|
| **OpenAI** | GPT-4, GPT-3.5 等 | 全部功能 |
| **Anthropic** | Claude 3.5 Sonnet/Opus | 全部功能 + 原生工具调用 |
| **Google Gemini** | Gemini Pro/Flash | 全部功能 |
| **Ollama** | 本地开源模型 | 基础功能 |

- **自动成本追踪**：实时计算 Token 使用和 API 费用
- **智能转换**：自动适配不同 Provider 的消息格式
- **灵活配置**：支持自定义 API 端点

### 🧠 智能上下文管理

- **Token 预算管理**：自动监控和管理上下文窗口
- **对话压缩**：智能摘要历史对话，节省 Token
- **对话截断**：智能保留重要消息，移除冗余内容
- **文件追踪**：追踪读取和编辑的文件，优化上下文

### 🔎 代码索引与搜索

- **向量存储**：基于语义的代码搜索
- **多 Embedder**：支持 OpenAI、Ollama 等 Embedding 模型
- **智能缓存**：增量索引，快速更新
- **代码解析**：提取函数、类等代码结构

### 💾 检查点系统

- **自动快照**：基于 Git 的代码状态保存
- **一键恢复**：快速回滚到任意检查点
- **Diff 查看**：并排对比修改前后的代码
- **两种策略**：Shadow 分支 / 每任务独立仓库

### 🎨 现代化 UI

- **多视图架构**：聊天 / 历史记录 / 设置 三大视图
- **工具调用可视化**：实时显示工具执行状态和结果
- **模式选择器**：下拉菜单式选择，带图标和描述
- **状态指示器**：准备/思考/执行/回答状态一目了然
- **消息操作**：编辑和删除已发送的消息
- **Token/成本显示**：实时显示 Token 使用和费用
- **上下文进度条**：可视化上下文窗口使用情况
- **历史管理**：任务历史查看、搜索、导出
- **VS Code 原生风格**：完美融入 VS Code 主题

## 📦 安装

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/dwr2001/vscode-tools.git
cd vscode-tools

# 安装依赖
pnpm install

# 构建 webview-ui
cd packages/webview-ui && pnpm build
cp -r dist ../extension/webview-ui

# 构建 extension
cd ../extension && pnpm build

# 打包扩展
pnpm package
```

### 开发模式

```bash
# 监听模式构建
cd packages/extension && pnpm watch

# 在 VS Code 中按 F5 启动调试
```

## ⚙️ 配置

打开 VS Code 设置 (`Ctrl+,`)，搜索 `vscode-tools`：

### AI 服务配置

| 配置项 | 说明 | 默认值 | 可选值 |
|--------|------|--------|--------|
| `vscode-tools.ai.provider` | AI 服务提供商 | `openai` | `openai`, `anthropic`, `gemini`, `ollama` |
| `vscode-tools.ai.apiKey` | API Key | - | 根据 Provider 配置 |
| `vscode-tools.ai.baseURL` | API 基础 URL | (根据 Provider) | 自定义端点 |
| `vscode-tools.ai.model` | 模型名称 | `gpt-4o-mini` | 根据 Provider 选择 |
| `vscode-tools.ai.thinkTag` | 启用思考标签解析 | `false` | `true`/`false` |

### 代码索引配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `vscode-tools.codeIndex.enabled` | 启用代码索引 | `false` |
| `vscode-tools.codeIndex.embedder` | Embedding 提供商 | `openai` |
| `vscode-tools.codeIndex.chunkSize` | 代码块大小 | `1500` |

### 上下文管理配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `vscode-tools.context.maxTokens` | 上下文窗口大小 | `128000` |
| `vscode-tools.context.enableCompression` | 启用对话压缩 | `true` |

### 模式配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `vscode-tools.modes.defaultMode` | 默认工作模式 | `code` |
| `vscode-tools.modes.disabledModes` | 禁用的模式列表 | `[]` |

### 使用不同 AI Provider

**Anthropic Claude:**
```json
{
  "vscode-tools.ai.provider": "anthropic",
  "vscode-tools.ai.apiKey": "sk-ant-xxx",
  "vscode-tools.ai.model": "claude-3-5-sonnet-20241022"
}
```

**Google Gemini:**
```json
{
  "vscode-tools.ai.provider": "gemini",
  "vscode-tools.ai.apiKey": "AIzaSyxxx",
  "vscode-tools.ai.model": "gemini-2.0-flash-exp"
}
```

**DeepSeek (OpenAI 兼容):**
```json
{
  "vscode-tools.ai.provider": "openai",
  "vscode-tools.ai.baseURL": "https://api.deepseek.com/v1",
  "vscode-tools.ai.model": "deepseek-chat",
  "vscode-tools.ai.thinkTag": true
}
```

**本地 Ollama:**
```json
{
  "vscode-tools.ai.provider": "ollama",
  "vscode-tools.ai.baseURL": "http://localhost:11434/v1",
  "vscode-tools.ai.model": "qwen2.5-coder:7b"
}
```

## 🚀 使用方法

### 基本使用

1. 打开 VS Code 侧边栏的 **VSCode Tools View**
2. 在输入框中输入问题或任务
3. AI 会根据当前模式智能选择工具完成任务

### 切换模式

**方式一：UI 选择器**
- 点击顶部的模式选择器下拉菜单

**方式二：命令面板**
- `Ctrl+Shift+P` → 输入 "VSCode Tools: 切换到..."

### 示例任务

```
# 代码模式
请帮我重构 src/utils.ts 中的 formatDate 函数，使用 dayjs 库

# 架构师模式
分析这个项目的架构，给出改进建议

# 调试模式
这个函数有 bug，帮我定位问题：[错误信息]

# 提问模式
解释一下这个正则表达式是什么意思
```

## 📁 项目结构

```
vscode-tools/
├── packages/
│   ├── extension/              # VS Code 扩展
│   │   ├── src/
│   │   │   ├── ai_service.ts           # AI 服务（Generator 模式）
│   │   │   ├── extension.ts            # 扩展入口
│   │   │   ├── webview-view-provider.ts # WebView 提供者
│   │   │   ├── checkpoint/             # 检查点系统
│   │   │   │   ├── CheckpointManager.ts
│   │   │   │   ├── ShadowCheckpointService.ts
│   │   │   │   └── RepoPerTaskCheckpointService.ts
│   │   │   ├── code-index/             # 代码索引
│   │   │   │   ├── CodeIndexManager.ts
│   │   │   │   ├── embedders/          # Embedding 模型
│   │   │   │   ├── processors/         # 代码解析
│   │   │   │   └── vector-store/       # 向量存储
│   │   │   ├── context-management/     # 上下文管理
│   │   │   │   ├── TokenCounter.ts
│   │   │   │   ├── FileContextTracker.ts
│   │   │   │   ├── ConversationTruncator.ts
│   │   │   │   └── ContextCondenser.ts
│   │   │   ├── context/                # 上下文收集
│   │   │   │   └── ContextCollector.ts
│   │   │   ├── diff/                   # Diff 查看器
│   │   │   │   ├── DiffViewerService.ts
│   │   │   │   └── DecorationController.ts
│   │   │   ├── modes/                  # 模式系统
│   │   │   │   ├── types.ts
│   │   │   │   ├── defaultModes.ts
│   │   │   │   └── ModeManager.ts
│   │   │   ├── providers/              # AI Provider
│   │   │   │   ├── OpenAIProvider.ts
│   │   │   │   ├── AnthropicProvider.ts
│   │   │   │   ├── GeminiProvider.ts
│   │   │   │   ├── OllamaProvider.ts
│   │   │   │   └── ProviderFactory.ts
│   │   │   ├── tools/                  # 工具系统
│   │   │   │   ├── BaseTool.ts
│   │   │   │   ├── ToolRegistry.ts
│   │   │   │   ├── ReadFileTool.ts
│   │   │   │   ├── WriteToFileTool.ts
│   │   │   │   ├── ListFilesTool.ts
│   │   │   │   ├── SearchFilesTool.ts
│   │   │   │   ├── ExecuteCommandTool.ts
│   │   │   │   ├── EditFileTool.ts        # 搜索替换编辑
│   │   │   │   ├── ApplyDiffTool.ts       # Diff 应用
│   │   │   │   ├── CheckpointTool.ts      # 检查点操作
│   │   │   │   └── CodebaseSearchTool.ts  # 语义搜索
│   │   │   └── terminal/               # 终端管理
│   │   │       └── TerminalManager.ts
│   │   └── webview-ui/                 # 构建产物
│   │
│   └── webview-ui/             # WebView 前端 (Vue 3)
│       └── src/
│           ├── App3.vue                # 主应用（多视图）
│           ├── AssistantMessage.vue    # AI 消息组件
│           ├── UserMessage.vue         # 用户消息组件
│           ├── Sender.vue              # 输入组件
│           ├── components/
│           │   ├── ToolBlock.vue       # 工具调用显示
│           │   ├── CodeAccordion.vue   # 可折叠代码块
│           │   ├── ModeSelector.vue    # 模式选择器
│           │   ├── StatusIndicator.vue # 状态指示器
│           │   ├── ReasoningBlock.vue  # 思考过程块
│           │   ├── TokenDisplay.vue    # Token 显示
│           │   ├── ContextProgress.vue # 上下文进度
│           │   ├── MessageActions.vue  # 消息操作
│           │   └── ConfirmDialog.vue   # 确认对话框
│           └── views/
│               ├── HistoryView.vue     # 历史记录
│               └── SettingsView.vue    # 设置界面
│
└── doc/                        # 文档
```

## 🗺️ 开发路线图

### ✅ Phase 1: 核心功能 (已完成)

- [x] 多 AI Provider 支持 (OpenAI, Anthropic, Gemini, Ollama)
- [x] 高级编辑工具 (edit_file, apply_diff)
- [x] 代码索引和语义搜索
- [x] 检查点系统 (Git-based 快照)
- [x] Diff 查看器
- [x] 上下文管理 (压缩、截断、Token 预算)
- [x] 成本追踪和 Token 显示

### ✅ Phase 2: UI 增强 (已完成)

- [x] 多视图架构 (聊天/历史/设置)
- [x] 消息编辑和删除
- [x] 历史任务管理
- [x] 设置界面
- [x] Token 和成本可视化
- [x] 上下文进度显示

### 🚧 Phase 3: 工作流增强 (进行中)

- [ ] `switch_mode` 工具 - AI 主动建议切换模式
- [ ] `attempt_completion` 工具 - 任务完成确认
- [ ] `ask_followup_question` 工具 - AI 追问功能
- [ ] Orchestrator 模式 - 工作流协调器
- [ ] `update_todo_list` 工具 - Todo 列表管理
- [ ] 用户审批流程 - 敏感操作确认
- [ ] 任务取消/中断 - 控制正在执行的任务

### 📋 Phase 4: 扩展能力 (计划中)

- [ ] MCP 协议支持 - Model Context Protocol
- [ ] `new_task` 工具 - 子任务创建和委派
- [ ] 浏览器自动化 - 前端测试/截图
- [ ] 云同步 - 任务和配置同步

## 🏗️ 技术栈

| 类别 | 技术 |
|------|------|
| **Extension** | TypeScript, VS Code Extension API |
| **WebView** | Vue 3, Composition API |
| **构建工具** | Rsbuild, pnpm workspaces |
| **代码规范** | Biome (lint + format) |
| **AI 集成** | OpenAI API (兼容接口) |


## 🙏 致谢

- [Roo-Code](https://github.com/RooCodeInc/Roo-Code) - 设计灵感和功能参考
- [VS Code](https://code.visualstudio.com/) - 优秀的代码编辑器
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Nymph-Beta">Nymph-Beta</a>
</p>
