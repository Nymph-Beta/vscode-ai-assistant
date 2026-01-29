/**
 * 模式类型定义
 */

/** 模式定义 */
export interface Mode {
  /** 模式标识符 */
  slug: string;
  /** 模式显示名称 */
  name: string;
  /** 模式图标（VS Code codicon 名称） */
  icon?: string;
  /** 角色定义（系统提示的核心部分） */
  roleDefinition: string;
  /** 允许使用的工具列表 */
  allowedTools: string[];
  /** 自定义指令（附加到系统提示） */
  customInstructions?: string;
  /** 是否为只读模式（不允许修改文件） */
  readonly?: boolean;
}

/** 模式配置（用户可自定义的部分） */
export interface ModeConfig {
  /** 自定义模式列表 */
  customModes?: Mode[];
  /** 默认模式 */
  defaultMode?: string;
  /** 禁用的内置模式 */
  disabledModes?: string[];
}

/** 模式切换事件 */
export interface ModeChangeEvent {
  /** 之前的模式 */
  previousMode: Mode;
  /** 当前模式 */
  currentMode: Mode;
}
