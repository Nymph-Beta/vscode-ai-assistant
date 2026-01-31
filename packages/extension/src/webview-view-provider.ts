import {
  type CancellationToken,
  type ExtensionContext,
  type WebviewView,
  type WebviewViewProvider,
  type WebviewViewResolveContext,
  type Webview,
  workspace,
  Uri
} from "vscode";
import * as fs from "node:fs";
import { aiService, type ChatMessage, type ToolCall, type ApiStreamChunk } from "./ai_service";
import { createDefaultToolRegistry, type ToolRegistry, type ToolResult } from "./tools";
import { modeManager } from "./modes";
import { contextCollector } from "./context";
import {
  CheckpointManager,
  FileCheckpointStorage,
} from "./checkpoint";
import { CodeIndexManager } from "./code-index";
import {
  getContextState,
  needsContextManagement,
  manageContext,
  tokenCounter,
  type ContextState,
} from "./context-management";

/** 任务历史项 */
interface TaskHistoryItem {
  id: string;
  title: string;
  timestamp: number;
  tokens?: number;
  cost?: number;
  messageCount: number;
  preview?: string;
  messages: ChatMessage[];
}

export class VSCodeToolsViewProvider implements WebviewViewProvider {
  private _view?: WebviewView;
  private _messages: ChatMessage[] = [];
  private _toolRegistry: ToolRegistry;
  private _currentTaskId = "";
  private _taskHistory: TaskHistoryItem[] = [];
  private _totalTokens = 0;
  private _totalCost = 0;

  // 管理器
  private _checkpointManager?: CheckpointManager;
  private _codeIndexManager?: CodeIndexManager;
  private _contextWindow = 128000;

  // 工具批准系统
  private _pendingToolApprovals = new Map<string, {
    toolCall: ToolCall;
    resolve: (approved: boolean) => void;
  }>();
  private _autoApproveTools: string[] = []; // 自动批准的工具列表
  private _requireApproval = true; // 是否需要用户批准

  constructor(
    private readonly _extensionUri: Uri,
    private readonly _extensionContext?: ExtensionContext
  ) {
    console.log("VSCodeToolsViewProvider constructor called");

    // 初始化检查点管理器
    this._initCheckpointManager();

    // 初始化代码索引管理器（可选）
    this._initCodeIndexManager();

    // 初始化工具注册表（传入管理器）
    this._toolRegistry = createDefaultToolRegistry({
      checkpointManager: this._checkpointManager,
      codeIndexManager: this._codeIndexManager,
    });
    aiService.setToolRegistry(this._toolRegistry);

    // 初始化第一个任务
    this._startNewTask();

    // 加载上下文窗口配置
    this._loadContextConfig();

    console.log(`[VSCodeToolsViewProvider] 已注册 ${this._toolRegistry.size} 个工具`);
  }

  /** 初始化检查点管理器 */
  private _initCheckpointManager(): void {
    if (!this._extensionContext) {
      console.log("[CheckpointManager] 未提供 ExtensionContext，跳过初始化");
      return;
    }

    try {
      const storage = new FileCheckpointStorage(this._extensionContext);
      this._checkpointManager = new CheckpointManager(storage);
      console.log("[CheckpointManager] 初始化成功");
    } catch (error) {
      console.error("[CheckpointManager] 初始化失败:", error);
    }
  }

  /** 初始化代码索引管理器 */
  private _initCodeIndexManager(): void {
    const config = workspace.getConfiguration("vscode-tools.codeIndex");
    const enabled = config.get<boolean>("enabled", false);

    if (!enabled) {
      console.log("[CodeIndexManager] 代码索引未启用");
      return;
    }

    try {
      this._codeIndexManager = CodeIndexManager.getInstance(this._extensionContext);
      console.log("[CodeIndexManager] 初始化成功");
    } catch (error) {
      console.error("[CodeIndexManager] 初始化失败:", error);
    }
  }

  /** 加载上下文配置 */
  private _loadContextConfig(): void {
    const config = workspace.getConfiguration("vscode-tools.context");
    this._contextWindow = config.get<number>("contextWindow", 128000);

    // 加载工具批准配置
    const toolsConfig = workspace.getConfiguration("vscode-tools.tools");
    this._requireApproval = toolsConfig.get<boolean>("requireApproval", true);
    this._autoApproveTools = toolsConfig.get<string[]>("autoApprove", []);

    console.log(`[工具配置] 需要批准: ${this._requireApproval}, 自动批准: ${this._autoApproveTools.join(", ") || "无"}`);
  }

  /** 生成任务 ID */
  private _generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /** 开始新任务 */
  private _startNewTask(): void {
    this._currentTaskId = this._generateTaskId();
    this._messages = [];
    this._totalTokens = 0;
    this._totalCost = 0;
    console.log(`[任务] 开始新任务: ${this._currentTaskId}`);
  }

  /** 保存当前任务到历史 */
  private _saveCurrentTaskToHistory(): void {
    if (this._messages.length === 0) {
      console.log("[任务] 当前任务为空，不保存到历史");
      return;
    }

    // 生成任务标题（取第一条用户消息的前50个字符）
    const firstUserMsg = this._messages.find(m => m.role === "user");
    const title = firstUserMsg?.content 
      ? (typeof firstUserMsg.content === "string" 
          ? firstUserMsg.content.substring(0, 50) 
          : "对话")
      : "未命名对话";

    // 生成预览（取最后一条用户消息）
    const lastUserMsg = [...this._messages].reverse().find(m => m.role === "user");
    const preview = lastUserMsg?.content
      ? (typeof lastUserMsg.content === "string"
          ? lastUserMsg.content.substring(0, 100)
          : "")
      : "";

    const task: TaskHistoryItem = {
      id: this._currentTaskId,
      title: title + (title.length >= 50 ? "..." : ""),
      timestamp: Date.now(),
      tokens: this._totalTokens,
      cost: this._totalCost,
      messageCount: this._messages.filter(m => m.role === "user" || m.role === "assistant").length,
      preview: preview + (preview.length >= 100 ? "..." : ""),
      messages: [...this._messages],
    };

    // 检查是否已存在相同 ID 的任务（更新而非添加）
    const existingIndex = this._taskHistory.findIndex(t => t.id === this._currentTaskId);
    if (existingIndex >= 0) {
      this._taskHistory[existingIndex] = task;
    } else {
      this._taskHistory.unshift(task); // 添加到最前面
    }

    // 限制历史数量（最多保留50个）
    if (this._taskHistory.length > 50) {
      this._taskHistory = this._taskHistory.slice(0, 50);
    }

    console.log(`[任务] 已保存任务到历史: ${task.title}, 共 ${this._taskHistory.length} 个任务`);
  }

  // 视图变为可用时调用
  public resolveWebviewView(
    webviewView: WebviewView,
    context: WebviewViewResolveContext,
    _token: CancellationToken,
  ): Thenable<void> | void {
    console.log("VSCodeToolsViewProvider.resolveWebviewView called");

    this._view = webviewView;

    // 配置 WebView 选项
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.joinPath(this._extensionUri, "webview-ui"),
      ]
    };

    // 保持 WebView 隐藏时的状态，防止切换面板时丢失
    // Note: retainContextWhenHidden 是 VS Code 1.57+ 的 API
    (webviewView as unknown as { retainContextWhenHidden: boolean }).retainContextWhenHidden = true;

    // 处理 WebView 消息
    webviewView.webview.onDidReceiveMessage(async (message) => {
      console.log("Received message from webview:", message);

      switch (message.command) {
        case "xiaoke.webview.env": {
          const key = message.payload?.key;
          const config = workspace.getConfiguration("vscode-tools.ai");
          if (key === "baseURL") {
            this._sendEnv("baseURL", config.get<string>("baseURL", "https://api.openai.com/v1"));
          } else if (key === "thinkTag") {
            this._sendEnv("thinkTag", config.get<boolean>("thinkTag", false));
          }
          break;
        }

        case "xiaoke.webview.chat.invoke":
          await this._handleChatInvoke(message.payload);
          break;

        case "xiaoke.webview.chat.cancel":
          console.log("取消请求");
          aiService.abort()
          this._sendChatClose();
          break;

        // 模式相关命令
        case "xiaoke.webview.mode.list":
          this._sendModeList();
          break;

        case "xiaoke.webview.mode.get":
          this._sendCurrentMode();
          break;

        case "xiaoke.webview.mode.set":
          this._handleSetMode(message.payload?.slug);
          break;

        // 清除历史
        case "xiaoke.webview.chat.clear":
          this._messages = [];
          console.log("已清除聊天历史");
          break;

        // 恢复历史
        case "xiaoke.webview.history.restore":
          this._sendHistoryMessages();
          break;

        // 设置相关命令
        case "xiaoke.webview.settings.load":
          this._sendSettings();
          break;

        case "xiaoke.webview.settings.save":
          await this._handleSaveSettings(message.payload);
          break;

        // 消息编辑/删除
        case "xiaoke.webview.message.edit":
          await this._handleMessageEdit(message.payload?.index, message.payload?.content);
          break;

        case "xiaoke.webview.message.delete":
          this._handleMessageDelete(message.payload?.index);
          break;

        // 新建对话
        case "xiaoke.webview.chat.new":
          this._handleNewChat();
          break;

        // 任务历史相关
        case "xiaoke.webview.task.list":
          this._sendTaskHistory();
          break;

        case "xiaoke.webview.task.restore":
          this._handleTaskRestore(message.payload?.taskId);
          break;

        case "xiaoke.webview.task.delete":
          this._handleTaskDelete(message.payload?.taskIds);
          break;

        // 工具批准/拒绝
        case "xiaoke.webview.tool.approve":
          this._handleToolApproval(message.payload?.toolCallId, true);
          break;

        case "xiaoke.webview.tool.reject":
          this._handleToolApproval(message.payload?.toolCallId, false);
          break;

        default:
          console.log("未知命令:", message.command);
      }
    });

    // 发送初始状态
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // 延迟发送初始模式信息
    setTimeout(() => {
      this._sendModeList();
      this._sendCurrentMode();
    }, 100);
  }

  // ============ 发送消息到 Webview 的辅助方法 ============

  /** 通知 Webview 聊天开始 */
  private _sendChatOpen() {
    this._view?.webview.postMessage({
      command: "xiaoke.webview.chat.open",
      payload: { ok: true },
    });
  }

  /** 发送流式消息内容（文本内容，增量） */
  private _sendChatMessage(content: string) {
    console.log("[postMessage] chat.message:", content.substring(0, 50));
    this._view?.webview.postMessage({
      command: "xiaoke.webview.chat.message",
      payload: { type: "text", content },
    });
  }

  /** 发送 reasoning 消息（独立的思考内容） */
  private _sendReasoningMessage(content: string, partial: boolean) {
    console.log("[postMessage] chat.reasoning, partial:", partial, "length:", content.length);
    this._view?.webview.postMessage({
      command: "xiaoke.webview.chat.reasoning",
      payload: { content, partial },
    });
  }

  /** 发送工具调用通知 */
  private _sendToolCall(toolName: string, args: Record<string, unknown>) {
    this._view?.webview.postMessage({
      command: "xiaoke.webview.tool.call",
      payload: { name: toolName, args },
    });
  }

  /** 发送工具执行结果 */
  private _sendToolResult(toolName: string, result: ToolResult) {
    this._view?.webview.postMessage({
      command: "xiaoke.webview.tool.result",
      payload: { name: toolName, result },
    });
  }

  /** 通知 Webview 聊天结束 */
  private _sendChatClose() {
    this._view?.webview.postMessage({
      command: "xiaoke.webview.chat.close",
      payload: undefined,
    });
  }

  /** 发送错误信息 */
  private _sendChatError(error: unknown) {
    this._view?.webview.postMessage({
      command: "xiaoke.webview.chat.error",
      payload: error,
    });
  }

  /** 发送 Token 使用量更新 */
  private _sendUsageUpdate(inputTokens: number, outputTokens: number) {
    // 获取上下文状态
    const contextState = getContextState(
      this._messages as unknown as import("./context-management").ApiMessage[],
      { contextWindow: this._contextWindow }
    );

    this._view?.webview.postMessage({
      command: "xiaoke.webview.chat.usage",
      payload: {
        inputTokens,
        outputTokens,
        totalTokens: this._totalTokens,
        totalCost: this._totalCost,
        contextState: {
          currentTokens: contextState.currentTokens,
          contextWindow: contextState.contextWindow,
          usagePercent: contextState.usagePercent,
          nearThreshold: contextState.nearThreshold,
        },
      },
    });
  }

  /** 返回环境配置 */
  private _sendEnv(key: string, value: unknown) {
    this._view?.webview.postMessage({
      command: "xiaoke.webview.env",
      payload: { key, value },
    });
  }

  /** 发送所有设置到 Webview */
  private _sendSettings() {
    const aiConfig = workspace.getConfiguration("vscode-tools.ai");
    const modesConfig = workspace.getConfiguration("vscode-tools.modes");

    const settings = {
      // AI Provider
      provider: aiConfig.get<string>("provider", "openai"),
      apiKey: aiConfig.get<string>("apiKey", ""),
      baseURL: aiConfig.get<string>("baseURL", "https://api.openai.com/v1"),
      model: aiConfig.get<string>("model", "gpt-4o-mini"),
      // Context Management
      contextWindow: 128000,
      condenseThreshold: 80,
      enableCondensation: true,
      // Code Index
      codeIndexEnabled: false,
      embeddingProvider: "openai",
      embeddingModel: "text-embedding-3-small",
      // UI
      showTokenUsage: true,
      showCostEstimate: true,
      // Mode
      defaultMode: modesConfig.get<string>("defaultMode", "code"),
      thinkTag: aiConfig.get<boolean>("thinkTag", false),
    };

    this._view?.webview.postMessage({
      command: "xiaoke.webview.settings.load",
      payload: settings,
    });
  }

  /** 处理保存设置 */
  private async _handleSaveSettings(newSettings: Record<string, unknown>) {
    if (!newSettings) return;

    const aiConfig = workspace.getConfiguration("vscode-tools.ai");
    const modesConfig = workspace.getConfiguration("vscode-tools.modes");

    try {
      // 保存 AI 配置
      if (newSettings.provider !== undefined) {
        await aiConfig.update("provider", newSettings.provider, true);
      }
      if (newSettings.apiKey !== undefined) {
        await aiConfig.update("apiKey", newSettings.apiKey, true);
      }
      if (newSettings.baseURL !== undefined) {
        await aiConfig.update("baseURL", newSettings.baseURL, true);
      }
      if (newSettings.model !== undefined) {
        await aiConfig.update("model", newSettings.model, true);
      }
      if (newSettings.thinkTag !== undefined) {
        await aiConfig.update("thinkTag", newSettings.thinkTag, true);
      }

      // 保存模式配置
      if (newSettings.defaultMode !== undefined) {
        await modesConfig.update("defaultMode", newSettings.defaultMode, true);
      }

      console.log("设置已保存到 VS Code 配置");

      // 刷新 AI 服务配置（重新初始化 Provider）
      aiService.refreshConfig();
      console.log(`[设置] AI Provider 已刷新: ${aiService.getProvider()?.name}`);

      // 如果更改了模式，同步刷新
      if (newSettings.defaultMode !== undefined) {
        modeManager.refreshConfig();
      }
    } catch (error) {
      console.error("保存设置失败:", error);
    }
  }

  /** 发送模式列表 */
  private _sendModeList() {
    const modes = modeManager.getAvailableModes().map((mode) => ({
      slug: mode.slug,
      name: mode.name,
      icon: mode.icon,
      readonly: mode.readonly,
    }));
    this._view?.webview.postMessage({
      command: "xiaoke.webview.mode.list",
      payload: modes,
    });
  }

  /** 发送当前模式 */
  private _sendCurrentMode() {
    const mode = modeManager.getCurrentMode();
    this._view?.webview.postMessage({
      command: "xiaoke.webview.mode.current",
      payload: {
        slug: mode.slug,
        name: mode.name,
        icon: mode.icon,
        readonly: mode.readonly,
      },
    });
  }

  /** 处理模式切换 */
  private _handleSetMode(slug?: string) {
    if (!slug) {
      console.warn("未提供模式 slug");
      return;
    }

    const success = modeManager.setMode(slug);
    if (success) {
      this._sendCurrentMode();
      // 清除历史，因为切换模式后上下文可能不一致
      this._messages = [];
      console.log(`模式已切换为: ${slug}，历史已清除`);
    }
  }

  /** 外部调用：通知模式已变更，同步 UI 和清除历史 */
  public notifyModeChanged(): void {
    this._sendCurrentMode();
    this._messages = [];
    // 通知前端清除聊天历史
    this._view?.webview.postMessage({
      command: "xiaoke.webview.history.clear",
    });
    console.log("模式已通过外部命令切换，UI 已同步，历史已清除");
  }

  /** 发送历史消息给前端恢复 */
  private _sendHistoryMessages(): void {
    console.log(`[历史恢复] 发送 ${this._messages.length} 条历史消息`);
    this._view?.webview.postMessage({
      command: "xiaoke.webview.history.restore",
      payload: { messages: this._messages },
    });
  }

  /** 处理消息编辑 - 编辑后重新发送 */
  private async _handleMessageEdit(msgIndex: number, newContent: string): Promise<void> {
    if (msgIndex === undefined || msgIndex < 0 || !newContent) {
      console.warn("消息编辑参数无效:", { msgIndex, newContent });
      return;
    }

    console.log(`[消息编辑] 编辑索引 ${msgIndex} 的消息`);

    // 截断消息历史到编辑位置（包含编辑的消息）
    this._messages = this._messages.slice(0, msgIndex);

    // 更新编辑的用户消息
    // 注意：前端已经更新了显示，这里只需要重新发送
    // 调用聊天处理
    await this._handleChatInvoke(newContent);
  }

  /** 处理消息删除 */
  private _handleMessageDelete(msgIndex: number): void {
    if (msgIndex === undefined || msgIndex < 0 || msgIndex >= this._messages.length) {
      console.warn("消息删除参数无效:", { msgIndex, total: this._messages.length });
      return;
    }

    console.log(`[消息删除] 删除索引 ${msgIndex} 的消息`);

    // 从历史中删除消息
    this._messages.splice(msgIndex, 1);

    console.log(`[消息删除] 剩余 ${this._messages.length} 条消息`);
  }

  /** 处理新建对话 */
  private _handleNewChat(): void {
    console.log("[新建对话] 保存当前任务，开始新对话");

    // 保存当前任务到历史（如果有消息）
    this._saveCurrentTaskToHistory();

    // 开始新任务
    this._startNewTask();

    // 通知前端清除
    this._view?.webview.postMessage({
      command: "xiaoke.webview.history.clear",
    });

    // 发送更新后的任务历史
    this._sendTaskHistory();
  }

  /** 发送任务历史到前端 */
  private _sendTaskHistory(): void {
    // 发送时不包含完整消息，只发送元数据
    const historyForUI = this._taskHistory.map(t => ({
      id: t.id,
      title: t.title,
      timestamp: t.timestamp,
      tokens: t.tokens,
      cost: t.cost,
      messageCount: t.messageCount,
      preview: t.preview,
    }));

    this._view?.webview.postMessage({
      command: "xiaoke.webview.task.history",
      payload: historyForUI,
    });

    console.log(`[任务历史] 已发送 ${historyForUI.length} 个任务到前端`);
  }

  /** 恢复任务 */
  private _handleTaskRestore(taskId: string): void {
    if (!taskId) {
      console.warn("[任务恢复] 未提供任务 ID");
      return;
    }

    const task = this._taskHistory.find(t => t.id === taskId);
    if (!task) {
      console.warn(`[任务恢复] 未找到任务: ${taskId}`);
      return;
    }

    console.log(`[任务恢复] 恢复任务: ${task.title}`);

    // 保存当前任务（如果有消息）
    this._saveCurrentTaskToHistory();

    // 恢复选中的任务
    this._currentTaskId = task.id;
    this._messages = [...task.messages];
    this._totalTokens = task.tokens || 0;
    this._totalCost = task.cost || 0;

    // 发送消息到前端
    this._sendHistoryMessages();

    // 更新任务历史列表
    this._sendTaskHistory();
  }

  /** 删除任务 */
  private _handleTaskDelete(taskIds: string[]): void {
    if (!taskIds || taskIds.length === 0) {
      console.warn("[任务删除] 未提供任务 ID");
      return;
    }

    const beforeCount = this._taskHistory.length;
    this._taskHistory = this._taskHistory.filter(t => !taskIds.includes(t.id));
    const deletedCount = beforeCount - this._taskHistory.length;

    console.log(`[任务删除] 删除了 ${deletedCount} 个任务`);

    // 发送更新后的任务历史
    this._sendTaskHistory();
  }

  // ============ 处理聊天请求 ============
  private async _handleChatInvoke(prompt: string) {
    console.log("处理聊天请求:", prompt);

    // 刷新配置
    aiService.refreshConfig();
    modeManager.refreshConfig();

    // 收集上下文
    const context = contextCollector.getFullContext({
      includeFileContent: false, // 不自动包含完整文件内容，避免上下文过大
      includeDiagnostics: true,
    });
    const contextText = contextCollector.formatContextForPrompt(context);
    console.log(`收集到的上下文: "${contextText.substring(0, 200)}${contextText.length > 200 ? "..." : ""}"`);

    // 构建系统提示（包含上下文）
    const systemPrompt = modeManager.buildSystemPrompt(contextText);

    // 添加用户消息到历史
    this._messages.push({ role: "user", content: prompt });

    // 获取当前模式允许的工具
    const allowedTools = modeManager.getAllowedTools();
    console.log(`当前模式: ${modeManager.getCurrentMode().name}, 允许工具: ${allowedTools.join(", ")}`);

    // 使用可变的消息列表进行对话（支持工具调用循环）
    const conversationMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...this._messages,
    ];

    const maxToolCalls = 10;
    let toolCallCount = 0;

    try {
      // 发送聊天开始通知
      this._sendChatOpen();

      // 工具调用循环
      while (true) {
        // 用于收集本轮响应
        let textContent = "";
        let reasoningContent = "";
        const toolCalls: ToolCall[] = [];

        // 消费 generator stream
        console.log("开始消费 generator stream...");
        for await (const chunk of aiService.createMessage(conversationMessages, { allowedTools })) {
          console.log("收到 chunk:", chunk.type, chunk);
          switch (chunk.type) {
            case 'reasoning':
              reasoningContent += chunk.content;
              console.log("发送 reasoning 消息, 累积长度:", reasoningContent.length);
              // 发送独立的 reasoning 消息（partial: true）
              this._sendReasoningMessage(reasoningContent, true);
              break;

            case 'text':
              textContent += chunk.content;
              // console.log("发送 text 消息:", chunk.content);
              // 发送增量文本
              this._sendChatMessage(chunk.content);
              break;

            case 'tool_call':
              toolCalls.push(chunk.toolCall);
              break;

            case 'tool_call_delta':
              // 工具调用增量更新（可以用于显示进度）
              break;

            case 'usage':
              console.log(`Token 使用: 输入=${chunk.inputTokens}, 输出=${chunk.outputTokens}`);
              this._totalTokens += chunk.inputTokens + chunk.outputTokens;
              // 发送 token 使用情况到前端
              this._sendUsageUpdate(chunk.inputTokens, chunk.outputTokens);
              break;

            case 'error':
              console.error("API 错误:", chunk.error);
              this._sendChatError(chunk.error);
              return;
          }
        }

        console.log("Generator stream 消费完成, reasoning长度:", reasoningContent.length, "text长度:", textContent.length);
        
        // 完成 reasoning 消息（partial: false）
        if (reasoningContent) {
          console.log("发送最终 reasoning 消息 (partial: false)");
          this._sendReasoningMessage(reasoningContent, false);
        }

        // 如果没有工具调用，对话结束
        if (toolCalls.length === 0) {
          // 保存 assistant 响应到历史
          if (textContent) {
            this._messages.push({
              role: "assistant",
              content: textContent,
            });
            console.log("已保存 assistant 响应到历史，当前历史长度:", this._messages.length);
          }
          break;
        }

        // 检查工具调用次数限制
        toolCallCount += toolCalls.length;
        if (toolCallCount > maxToolCalls) {
          console.warn(`工具调用次数超过限制 (${maxToolCalls})`);
          this._sendChatMessage("\n\n[工具调用次数已达上限]");
          break;
        }

        // 添加 assistant 的工具调用消息到对话
        conversationMessages.push({
          role: "assistant",
          content: textContent || null,
          tool_calls: toolCalls,
        });

        // 执行每个工具调用并添加结果
        for (const toolCall of toolCalls) {
          const toolResult = await this._executeToolCall(toolCall);
          conversationMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult.success
              ? toolResult.content
              : `错误: ${toolResult.error}`,
          });
        }

        console.log("工具执行完成，继续对话...");
      }

      // 发送聊天结束通知
      this._sendChatClose();

    } catch (error: unknown) {
      console.error("聊天请求异常:", error);
      this._sendChatError(error instanceof Error ? error.message : String(error));
    }
  }

  /** 处理工具批准/拒绝 */
  private _handleToolApproval(toolCallId: string, approved: boolean): void {
    const pending = this._pendingToolApprovals.get(toolCallId);
    if (pending) {
      console.log(`[工具批准] ${toolCallId}: ${approved ? "已批准" : "已拒绝"}`);
      pending.resolve(approved);
      this._pendingToolApprovals.delete(toolCallId);
    } else {
      console.warn(`[工具批准] 未找到待批准的工具调用: ${toolCallId}`);
    }
  }

  /** 发送工具批准请求到 UI */
  private _sendToolApprovalRequest(toolCallId: string, toolName: string, args: Record<string, unknown>): void {
    this._view?.webview.postMessage({
      command: "xiaoke.webview.tool.approval_request",
      payload: { toolCallId, toolName, args },
    });
  }

  /** 检查工具是否需要批准 */
  private _needsApproval(toolName: string): boolean {
    // 如果全局禁用批准，直接返回 false
    if (!this._requireApproval) {
      return false;
    }
    // 如果工具在自动批准列表中，不需要批准
    if (this._autoApproveTools.includes(toolName)) {
      return false;
    }
    // 只读工具可以考虑自动批准
    const readOnlyTools = ["read_file", "list_files", "search_files"];
    // 默认只读工具也需要批准，除非在配置中排除
    return true;
  }

  /** 等待用户批准工具调用 */
  private async _waitForApproval(toolCall: ToolCall): Promise<boolean> {
    return new Promise((resolve) => {
      this._pendingToolApprovals.set(toolCall.id, {
        toolCall,
        resolve,
      });

      // 设置超时（可选，60秒后自动拒绝）
      // setTimeout(() => {
      //   if (this._pendingToolApprovals.has(toolCall.id)) {
      //     this._pendingToolApprovals.delete(toolCall.id);
      //     resolve(false);
      //   }
      // }, 60000);
    });
  }

  /** 执行工具调用 */
  private async _executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: argsStr } = toolCall.function;

    console.log(`执行工具: ${name}`);
    console.log(`参数: ${argsStr}`);

    // 解析参数
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr);
    } catch {
      return {
        success: false,
        content: "",
        error: `无法解析工具参数: ${argsStr}`,
      };
    }

    // 检查是否需要用户批准
    if (this._needsApproval(name)) {
      console.log(`[工具批准] 等待用户批准: ${name}`);
      
      // 发送批准请求到 UI
      this._sendToolApprovalRequest(toolCall.id, name, args);

      // 等待用户批准
      const approved = await this._waitForApproval(toolCall);

      if (!approved) {
        console.log(`[工具批准] 用户拒绝了工具调用: ${name}`);
        // 通知 UI 工具被拒绝
        this._sendToolRejected(name, args);
        return {
          success: false,
          content: "",
          error: `用户拒绝执行工具: ${name}`,
        };
      }

      console.log(`[工具批准] 用户批准了工具调用: ${name}`);
    }

    // 通知 UI 工具开始执行
    this._sendToolCall(name, args);

    // 执行工具
    const toolRegistry = aiService.getToolRegistry();
    if (!toolRegistry) {
      return {
        success: false,
        content: "",
        error: "工具注册表未配置",
      };
    }

    const result = await toolRegistry.execute(name, args);

    // 通知 UI 工具执行结果
    this._sendToolResult(name, result);

    console.log(`工具执行结果: ${result.success ? "成功" : "失败"}`);
    if (result.error) {
      console.error(`错误: ${result.error}`);
    }

    return result;
  }

  /** 通知 UI 工具被拒绝 */
  private _sendToolRejected(toolName: string, args: Record<string, unknown>): void {
    this._view?.webview.postMessage({
      command: "xiaoke.webview.tool.rejected",
      payload: { name: toolName, args },
    });
  }

  private _getHtmlForWebview(webview: Webview): string {
    // 获取 webview-ui 构建产物的 URI
    const distUri = Uri.joinPath(this._extensionUri, "webview-ui");

    // 读取 manifest.json 获取实际的文件名
    const manifestPath = Uri.joinPath(distUri, "manifest.json");
    let jsFiles: string[] = [];
    let cssFiles: string[] = [];
    let fontFile = "";

    try {
      const manifestContent = JSON.parse(fs.readFileSync(manifestPath.fsPath, "utf-8"));
      const initial = manifestContent?.entries?.index?.initial;

      if (initial) {
        jsFiles = initial.js || [];
        cssFiles = initial.css || [];
      }

      // 查找字体文件
      const allFiles = manifestContent?.allFiles || [];
      fontFile = allFiles.find((f: string) => f.includes("codicon") && f.endsWith(".ttf")) || "";

      console.log("[Manifest] JS files:", jsFiles);
      console.log("[Manifest] CSS files:", cssFiles);
      console.log("[Manifest] Font file:", fontFile);
    } catch (error) {
      console.error("Failed to read manifest.json:", error);
      // 回退到默认文件名
      jsFiles = ["/static/js/lib-vue.js", "/static/js/159.js", "/static/js/index.js"];
      cssFiles = ["/static/css/159.css", "/static/css/index.css"];
      fontFile = "/static/font/codicon.81ea7998.ttf";
    }

    // 转换为 webview 可用的 URI
    const scriptUris = jsFiles.map(file =>
      webview.asWebviewUri(Uri.joinPath(distUri, file.replace(/^\//, "")))
    );
    const styleUris = cssFiles.map(file =>
      webview.asWebviewUri(Uri.joinPath(distUri, file.replace(/^\//, "")))
    );
    const fontUri = webview.asWebviewUri(
      Uri.joinPath(distUri, fontFile.replace(/^\//, ""))
    );

    // 打印调试信息到扩展日志
    console.log("=== Webview Resource URIs ===");
    scriptUris.forEach((uri, i) => console.log(`script[${i}]:`, uri.toString()));
    styleUris.forEach((uri, i) => console.log(`style[${i}]:`, uri.toString()));
    console.log("font:", fontUri.toString());

    // 生成脚本标签
    const scriptTags = scriptUris
      .map(uri => `<script src="${uri}" onerror="console.error('Failed to load script: ${uri}')"></script>`)
      .join("\n      ");

    // 生成样式标签
    const styleTags = styleUris
      .map(uri => `<link href="${uri}" rel="stylesheet">`)
      .join("\n      ");

    return `<!DOCTYPE html>
  <html lang="zh-CN">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; connect-src *;">
      ${styleTags}
      <style>
          @font-face {
              font-family: 'codicon';
              font-display: block;
              src: url('${fontUri}') format('truetype');
          }
      </style>
      <title>VSCode Tools</title>
  </head>
  <body>
      <div id="root">正在加载...</div>
      <script>
          console.log("=== Webview Script Loading ===");
          console.log("开始加载脚本...");
      </script>
      ${scriptTags}
      <script>
          console.log("所有脚本标签已添加");
      </script>
  </body>
  </html>`;
  }
}
