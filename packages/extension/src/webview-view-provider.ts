import {
  type CancellationToken,
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
import { modeManager, type Mode } from "./modes";
import { contextCollector } from "./context";

export class VSCodeToolsViewProvider implements WebviewViewProvider {
  private _view?: WebviewView;
  private _messages: ChatMessage[] = [];
  private _toolRegistry: ToolRegistry;

  constructor(private readonly _extensionUri: Uri) {
    console.log("VSCodeToolsViewProvider constructor called");

    // 初始化工具注册表
    this._toolRegistry = createDefaultToolRegistry();
    aiService.setToolRegistry(this._toolRegistry);

    console.log(`[VSCodeToolsViewProvider] 已注册 ${this._toolRegistry.size} 个工具`);
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

  /** 返回环境配置 */
  private _sendEnv(key: string, value: unknown) {
    this._view?.webview.postMessage({
      command: "xiaoke.webview.env",
      payload: { key, value },
    });
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
              console.log("发送 text 消息:", chunk.content);
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
              break;
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
