/**
 * VSCode Tools Extension
 * 一个支持工具调用和多模式的 AI 编程助手
 */

import { window, type ExtensionContext, commands } from 'vscode';
import { VSCodeToolsViewProvider } from './webview-view-provider';
import { terminalManager } from './terminal';
import { modeManager } from './modes';

// 全局 provider 引用
let provider: VSCodeToolsViewProvider | undefined;

/**
 * 扩展激活时调用
 */
export function activate(context: ExtensionContext) {
  console.log('========================================');
  console.log('VSCode Tools Extension 正在激活...');
  console.log(`激活时间: ${new Date().toISOString()}`);
  console.log('========================================');

  // 创建 WebviewViewProvider（传入 ExtensionContext 以支持检查点等功能）
  provider = new VSCodeToolsViewProvider(context.extensionUri, context);

  // 注册 WebviewViewProvider
  context.subscriptions.push(
    window.registerWebviewViewProvider("vscode-tools.view", provider)
  );

  // 注册命令: Hello World (测试用)
  context.subscriptions.push(
    commands.registerCommand('vscode-tools.helloWorld', () => {
      window.showInformationMessage('Hello from VSCode Tools!');
    })
  );

  // 注册命令: 切换到代码模式
  context.subscriptions.push(
    commands.registerCommand('vscode-tools.mode.code', () => {
      modeManager.setMode('code');
      provider?.notifyModeChanged();
      window.showInformationMessage('已切换到代码模式');
    })
  );

  // 注册命令: 切换到架构师模式
  context.subscriptions.push(
    commands.registerCommand('vscode-tools.mode.architect', () => {
      modeManager.setMode('architect');
      provider?.notifyModeChanged();
      window.showInformationMessage('已切换到架构师模式');
    })
  );

  // 注册命令: 切换到提问模式
  context.subscriptions.push(
    commands.registerCommand('vscode-tools.mode.ask', () => {
      modeManager.setMode('ask');
      provider?.notifyModeChanged();
      window.showInformationMessage('已切换到提问模式');
    })
  );

  // 注册命令: 切换到调试模式
  context.subscriptions.push(
    commands.registerCommand('vscode-tools.mode.debug', () => {
      modeManager.setMode('debug');
      provider?.notifyModeChanged();
      window.showInformationMessage('已切换到调试模式');
    })
  );

  console.log('VSCode Tools Extension 激活完成');
  console.log(`可用模式: ${modeManager.getAvailableModes().map(m => m.name).join(', ')}`);
}

/**
 * 扩展停用时调用
 */
export function deactivate() {
  console.log('VSCode Tools Extension 正在停用...');

  // 终止所有运行中的终端进程
  if (terminalManager.runningCount > 0) {
    console.log(`终止 ${terminalManager.runningCount} 个运行中的进程`);
    terminalManager.killAll();
  }

  provider = undefined;
  console.log('VSCode Tools Extension 已停用');
}
