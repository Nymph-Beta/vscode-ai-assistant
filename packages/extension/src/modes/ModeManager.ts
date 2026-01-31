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
   * @param additionalContext 额外的上下文信息（环境详情）
   */
  buildSystemPrompt(additionalContext?: string): string {
    const parts: string[] = [];

    // 1. 角色定义
    parts.push(this.currentMode.roleDefinition);

    // 2. 工具使用指南（防止幻觉的关键）
    parts.push(this._getToolUseGuidelinesSection());

    // 3. 规则部分
    parts.push(this._getRulesSection());

    // 4. 可用工具
    parts.push("\n## 可用工具\n");
    parts.push(`你可以使用以下工具来完成任务：${this.currentMode.allowedTools.join(", ")}`);

    if (this.currentMode.readonly) {
      parts.push("\n**注意：当前为只读模式，不能修改文件。**");
    }

    // 5. 模式自定义指令
    if (this.currentMode.customInstructions) {
      parts.push("\n## 模式指令\n");
      parts.push(this.currentMode.customInstructions);
    }

    // 6. 环境详情（标注为自动生成，不是用户请求）
    if (additionalContext) {
      parts.push(this._formatEnvironmentDetails(additionalContext));
    }

    return parts.join("\n");
  }

  /**
   * 工具使用指南 - 防止 AI 幻觉的关键部分
   * 参考 Roo-Code 的 Tool Use Guidelines
   */
  private _getToolUseGuidelinesSection(): string {
    return `
## 工具使用指南

1. 首先评估你已有的信息和完成任务所需的信息
2. 根据任务选择最合适的工具，例如用 list_files 工具而非 ls 命令来列出目录
3. 如果需要多个操作，每次只执行一个工具调用，等待结果后再继续
4. 每个步骤必须基于上一步的结果，**绝对不要假设或编造工具执行结果**
5. 等待工具执行结果确认后再继续下一步
6. **绝对不要编造或假设文件内容、目录结构、代码实现等信息**
7. 如果需要了解项目结构，必须先使用 list_files 工具获取真实信息
8. 如果需要了解文件内容，必须先使用 read_file 工具读取真实内容`;
  }

  /**
   * 规则部分 - 约束 AI 行为
   * 参考 Roo-Code 的 Rules Section
   */
  private _getRulesSection(): string {
    return `
## 规则

- 不要询问不必要的信息，优先使用工具获取所需信息
- 如果可以用工具避免向用户提问，就应该这样做
- 你的目标是完成用户的任务，不是进行闲聊
- 不要以"好的"、"当然"、"没问题"等词开头回复，直接说明你要做什么
- 保持回复简洁专业
- 使用中文回复
- 在执行任何修改操作前，先使用工具阅读相关文件了解上下文
- 提供清晰的解释，说明你要做什么以及为什么`;
  }

  /**
   * 格式化环境详情 - 明确标注这是自动生成的信息
   * 参考 Roo-Code 的 environment_details 处理方式
   */
  private _formatEnvironmentDetails(context: string): string {
    return `
## 环境详情（自动生成）

以下信息由系统自动收集，用于提供项目上下文。
**重要：这不是用户请求的一部分，不要将其视为用户在询问关于这些内容的问题。**
仅在与用户任务相关时才参考这些信息。如果用户只是简单问候，请正常回应问候，不要讲解这些环境信息。

${context}`;
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
