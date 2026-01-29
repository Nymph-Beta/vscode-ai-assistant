---
name: mode-sync-fix
overview: 修复通过命令面板（Ctrl+Shift+P）切换模式后，WebView UI 不同步的问题。当前命令面板切换模式只更新了 modeManager 状态，没有通知 WebView 更新 UI 和清除历史。
todos:
  - id: add-notify-method
    content: 在 webview-view-provider.ts 中添加 notifyModeChanged() 公开方法
    status: completed
  - id: update-mode-commands
    content: 在 extension.ts 的 4 个模式命令中调用 provider.notifyModeChanged()
    status: completed
isProject: false
---

# 命令面板模式切换同步修复

## 问题分析

当前两种模式切换的数据流：

```mermaid
flowchart LR
    subgraph webviewFlow [WebView 切换 - 正常]
        A1[用户选择模式] --> B1[postMessage]
        B1 --> C1[_handleSetMode]
        C1 --> D1[modeManager.setMode]
        C1 --> E1[_sendCurrentMode]
        C1 --> F1[清除历史]
    end
    
    subgraph cmdFlow [命令面板切换 - 有问题]
        A2[Ctrl+Shift+P] --> B2[registerCommand]
        B2 --> C2[modeManager.setMode]
        B2 --> D2[showInfoMessage]
        B2 -.-> E2[缺失: 通知 WebView]
        B2 -.-> F2[缺失: 清除历史]
    end
```

## 修复方案

在 [VSCodeToolsViewProvider](packages/extension/src/webview-view-provider.ts) 中添加公开方法，然后从 [extension.ts](packages/extension/src/extension.ts) 的命令处理中调用它。

### 1. 修改 webview-view-provider.ts

添加公开方法 `notifyModeChanged()`：

```typescript
/** 外部调用：通知模式已变更，同步 UI 和清除历史 */
public notifyModeChanged(): void {
  this._sendCurrentMode();
  this._messages = [];
  console.log("模式已通过外部命令切换，UI 已同步，历史已清除");
}
```

### 2. 修改 extension.ts

在每个模式切换命令中，调用 provider 的同步方法：

```typescript
commands.registerCommand('vscode-tools.mode.code', () => {
  modeManager.setMode('code');
  provider?.notifyModeChanged();  // 新增
  window.showInformationMessage('已切换到代码模式');
})
```

对 4 个模式命令都做同样的修改：

- `vscode-tools.mode.code`
- `vscode-tools.mode.architect`
- `vscode-tools.mode.ask`
- `vscode-tools.mode.debug`

## 修改文件清单

| 文件 | 修改内容 |

|------|----------|

| `packages/extension/src/webview-view-provider.ts` | 新增 `notifyModeChanged()` 公开方法 |

| `packages/extension/src/extension.ts` | 4 个模式命令中调用 `provider?.notifyModeChanged()` |