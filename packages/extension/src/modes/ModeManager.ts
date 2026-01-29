/**
 * 模式管理器
 * 管理当前模式、模式切换和系统提示生成
 */

import * as vscode from "vscode";
import type { Mode, ModeConfig, ModeChangeEvent } from "./types";
import { DEFAULT_MODES, getDefaultMode } from "./defaultModes";

/** 模式切换回调 */
type ModeChangeListener = (event: ModeChangeEvent) => void;

export class ModeManager {
  private currentMode: Mode;
  private customModes: Mode[] = [];
  private disabledModes: Set<string> = new Set();
  private listeners: ModeChangeListener[] = [];

  constructor(defaultModeSlug?: string) {
    // 尝试加载配置中的默认模式
    const configDefaultMode = this.loadConfig().defaultMode;
    const slug = defaultModeSlug || configDefaultMode || "code";
    
    this.currentMode = this.getModeBySlug(slug) || DEFAULT_MODES[0];
    console.log(`[ModeManager] 初始化，当前模式: ${this.currentMode.name}`);
  }

  /**
   * 从 VSCode 配置加载模式设置
   */
  private loadConfig(): ModeConfig {
    const config = vscode.workspace.getConfiguration("vscode-tools.modes");
    return {
      customModes: config.get<Mode[]>("customModes", []),
      defaultMode: config.get<string>("defaultMode", "code"),
      disabledModes: config.get<string[]>("disabledModes", []),
    };
  }

  /**
   * 刷新配置
   */
  refreshConfig(): void {
    const config = this.loadConfig();
    this.customModes = config.customModes || [];
    this.disabledModes = new Set(config.disabledModes || []);
  }

  /**
   * 获取当前模式
   */
  getCurrentMode(): Mode {
    return this.currentMode;
  }

  /**
   * 设置当前模式
   * @param slug 模式标识符
   * @returns 是否切换成功
   */
  setMode(slug: string): boolean {
    const newMode = this.getModeBySlug(slug);
    if (!newMode) {
      console.warn(`[ModeManager] 未找到模式: ${slug}`);
      return false;
    }

    if (this.disabledModes.has(slug)) {
      console.warn(`[ModeManager] 模式已禁用: ${slug}`);
      return false;
    }

    const previousMode = this.currentMode;
    this.currentMode = newMode;

    console.log(`[ModeManager] 模式切换: ${previousMode.name} -> ${newMode.name}`);

    // 通知监听器
    const event: ModeChangeEvent = { previousMode, currentMode: newMode };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[ModeManager] 监听器错误:", error);
      }
    }

    return true;
  }

  /**
   * 根据 slug 获取模式
   */
  getModeBySlug(slug: string): Mode | undefined {
    // 先从自定义模式查找
    const customMode = this.customModes.find((m) => m.slug === slug);
    if (customMode) {
      return customMode;
    }

    // 再从默认模式查找
    return getDefaultMode(slug);
  }

  /**
   * 获取所有可用模式
   */
  getAvailableModes(): Mode[] {
    const allModes = [...DEFAULT_MODES, ...this.customModes];
    return allModes.filter((mode) => !this.disabledModes.has(mode.slug));
  }

  /**
   * 获取当前模式允许的工具列表
   */
  getAllowedTools(): string[] {
    return this.currentMode.allowedTools;
  }

  /**
   * 检查工具是否在当前模式下可用
   */
  isToolAllowed(toolName: string): boolean {
    return this.currentMode.allowedTools.includes(toolName);
  }

  /**
   * 当前模式是否为只读模式
   */
  isReadonlyMode(): boolean {
    return this.currentMode.readonly === true;
  }

  /**
   * 构建系统提示
   * @param additionalContext 额外的上下文信息
   */
  buildSystemPrompt(additionalContext?: string): string {
    const parts: string[] = [];

    // 1. 角色定义
    parts.push(this.currentMode.roleDefinition);

    // 2. 工具说明
    parts.push("\n## 可用工具\n");
    parts.push(`你可以使用以下工具来完成任务：${this.currentMode.allowedTools.join(", ")}`);

    if (this.currentMode.readonly) {
      parts.push("\n**注意：当前为只读模式，不能修改文件。**");
    }

    // 3. 自定义指令
    if (this.currentMode.customInstructions) {
      parts.push("\n## 附加指令\n");
      parts.push(this.currentMode.customInstructions);
    }

    // 4. 额外上下文
    if (additionalContext) {
      parts.push("\n## 当前上下文\n");
      parts.push(additionalContext);
    }

    // 5. 通用规则
    parts.push("\n## 通用规则\n");
    parts.push(`
- 在执行任何修改操作前，先阅读相关文件了解上下文
- 提供清晰的解释，说明你要做什么以及为什么
- 如果不确定，主动询问用户澄清
- 保持回复简洁专业
- 使用中文回复`);

    return parts.join("\n");
  }

  /**
   * 添加模式切换监听器
   */
  onModeChange(listener: ModeChangeListener): vscode.Disposable {
    this.listeners.push(listener);
    return new vscode.Disposable(() => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    });
  }

  /**
   * 添加自定义模式
   */
  addCustomMode(mode: Mode): void {
    // 检查是否已存在
    const existingIndex = this.customModes.findIndex((m) => m.slug === mode.slug);
    if (existingIndex >= 0) {
      this.customModes[existingIndex] = mode;
    } else {
      this.customModes.push(mode);
    }
  }

  /**
   * 移除自定义模式
   */
  removeCustomMode(slug: string): boolean {
    const index = this.customModes.findIndex((m) => m.slug === slug);
    if (index >= 0) {
      this.customModes.splice(index, 1);
      return true;
    }
    return false;
  }
}

/** 全局模式管理器单例 */
export const modeManager = new ModeManager();
