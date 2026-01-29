# VSCode Tools

<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-1.82+-blue?logo=visualstudiocode" alt="VS Code Version">
  <img src="https://img.shields.io/badge/Node.js-18+-green?logo=node.js" alt="Node.js Version">
  <img src="https://img.shields.io/badge/TypeScript-5.8+-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vue-3.5+-green?logo=vue.js" alt="Vue 3">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
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

| 工具 | 功能 | 说明 |
|------|------|------|
| `read_file` | 📖 读取文件 | 支持行范围读取 |
| `write_to_file` | ✏️ 写入文件 | 自动创建目录，安全检查 |
| `list_files` | 📂 列出目录 | 支持递归，智能忽略 |
| `search_files` | 🔍 搜索文件 | 支持正则表达式 |
| `execute_command` | ⚡ 执行命令 | 终端命令，危险命令检测 |

### 💬 流式对话

- **Generator 模式**：实时流式输出，响应更快
- **思考过程展示**：支持 DeepSeek 等模型的 reasoning 输出
- **计时器**：显示 AI 思考时间
- **可折叠内容**：思考过程可展开/收起

### 🎨 现代化 UI

- **工具调用可视化**：实时显示工具执行状态和结果
- **模式选择器**：下拉菜单式选择，带图标和描述
- **状态指示器**：准备/思考/执行/回答状态一目了然
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

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `vscode-tools.ai.provider` | AI 服务提供商 | `openai` |
| `vscode-tools.ai.apiKey` | API Key | - |
| `vscode-tools.ai.baseURL` | API 基础 URL | `https://api.openai.com/v1` |
| `vscode-tools.ai.model` | 模型名称 | `gpt-4o-mini` |
| `vscode-tools.ai.thinkTag` | 启用思考标签解析 | `false` |

### 模式配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `vscode-tools.modes.defaultMode` | 默认工作模式 | `code` |
| `vscode-tools.modes.disabledModes` | 禁用的模式列表 | `[]` |

### 使用第三方 API

支持任何 OpenAI 兼容的 API，例如：

**DeepSeek:**
```json
{
  "vscode-tools.ai.baseURL": "https://api.deepseek.com/v1",
  "vscode-tools.ai.model": "deepseek-chat",
  "vscode-tools.ai.thinkTag": true
}
```

**本地 Ollama:**
```json
{
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
│   │   │   ├── context/                # 上下文收集
│   │   │   │   └── ContextCollector.ts
│   │   │   ├── modes/                  # 模式系统
│   │   │   │   ├── types.ts
│   │   │   │   ├── defaultModes.ts
│   │   │   │   └── ModeManager.ts
│   │   │   ├── tools/                  # 工具系统
│   │   │   │   ├── BaseTool.ts
│   │   │   │   ├── ToolRegistry.ts
│   │   │   │   ├── ReadFileTool.ts
│   │   │   │   ├── WriteToFileTool.ts
│   │   │   │   ├── ListFilesTool.ts
│   │   │   │   ├── SearchFilesTool.ts
│   │   │   │   └── ExecuteCommandTool.ts
│   │   │   └── terminal/               # 终端管理
│   │   │       └── TerminalManager.ts
│   │   └── webview-ui/                 # 构建产物
│   │
│   └── webview-ui/             # WebView 前端 (Vue 3)
│       └── src/
│           ├── App3.vue                # 主应用
│           ├── AssistantMessage.vue    # AI 消息组件
│           ├── UserMessage.vue         # 用户消息组件
│           ├── Sender.vue              # 输入组件
│           └── components/
│               ├── ToolBlock.vue       # 工具调用显示
│               ├── CodeAccordion.vue   # 可折叠代码块
│               ├── ModeSelector.vue    # 模式选择器
│               ├── StatusIndicator.vue # 状态指示器
│               └── ReasoningBlock.vue  # 思考过程块
│
└── doc/                        # 文档
```

## 🗺️ 开发路线图

### Phase 1: 核心 Workflow ⏳

- [ ] `switch_mode` 工具 - AI 主动建议切换模式
- [ ] `attempt_completion` 工具 - 任务完成确认
- [ ] `ask_followup_question` 工具 - AI 追问功能
- [ ] Orchestrator 模式 - 工作流协调器

### Phase 2: 任务管理 📋

- [ ] `update_todo_list` 工具 - Todo 列表管理
- [ ] 用户审批流程 - 敏感操作确认
- [ ] 任务取消/中断 - 控制正在执行的任务
- [ ] 任务历史/恢复 - 保存和恢复会话

### Phase 3: 高级编辑 ✂️

- [ ] `apply_diff` 工具 - 应用 diff 补丁
- [ ] `search_replace` 工具 - 批量搜索替换
- [ ] 代码语义搜索 - 基于向量的代码搜索

### Phase 4: 扩展集成 🔌

- [ ] MCP 协议支持 - Model Context Protocol
- [ ] 浏览器自动化 - 前端测试/截图
- [ ] `new_task` 工具 - 子任务创建和委派

## 🏗️ 技术栈

| 类别 | 技术 |
|------|------|
| **Extension** | TypeScript, VS Code Extension API |
| **WebView** | Vue 3, Composition API |
| **构建工具** | Rsbuild, pnpm workspaces |
| **代码规范** | Biome (lint + format) |
| **AI 集成** | OpenAI API (兼容接口) |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

本项目基于 MIT 许可证开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [Roo-Code](https://github.com/RooCodeInc/Roo-Code) - 设计灵感和功能参考
- [VS Code](https://code.visualstudio.com/) - 优秀的代码编辑器
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Nymph-Beta">Nymph-Beta</a>
</p>

