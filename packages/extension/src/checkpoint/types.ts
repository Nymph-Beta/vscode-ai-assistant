/**
 * 检查点系统类型定义
 */

/** 检查点元数据 */
export interface Checkpoint {
  /** 检查点唯一标识 */
  id: string;
  /** 检查点名称/描述 */
  name: string;
  /** 创建时间戳 */
  timestamp: number;
  /** Git commit SHA */
  commitSha: string;
  /** 关联的任务/对话 ID */
  taskId?: string;
  /** 变更的文件列表 */
  changedFiles: string[];
  /** 统计信息 */
  stats: {
    additions: number;
    deletions: number;
    filesChanged: number;
  };
}

/** 检查点创建选项 */
export interface CreateCheckpointOptions {
  /** 检查点名称 */
  name?: string;
  /** 关联的任务 ID */
  taskId?: string;
  /** 是否包含未暂存的更改 */
  includeUnstaged?: boolean;
}

/** 检查点恢复选项 */
export interface RestoreCheckpointOptions {
  /** 是否创建备份检查点 */
  createBackup?: boolean;
  /** 备份检查点名称 */
  backupName?: string;
}

/** 文件差异 */
export interface FileDiff {
  /** 文件路径 */
  path: string;
  /** 变更类型 */
  status: "added" | "modified" | "deleted" | "renamed";
  /** 旧路径（重命名时） */
  oldPath?: string;
  /** 添加的行数 */
  additions: number;
  /** 删除的行数 */
  deletions: number;
  /** diff 内容 */
  diff?: string;
}

/** 检查点差异 */
export interface CheckpointDiff {
  /** 起始检查点 */
  fromCheckpoint?: Checkpoint;
  /** 目标检查点 */
  toCheckpoint: Checkpoint;
  /** 文件差异列表 */
  files: FileDiff[];
  /** 总统计 */
  stats: {
    additions: number;
    deletions: number;
    filesChanged: number;
  };
}

/** 检查点存储接口 */
export interface CheckpointStorage {
  /** 保存检查点元数据 */
  save(checkpoint: Checkpoint): Promise<void>;
  /** 获取检查点 */
  get(id: string): Promise<Checkpoint | undefined>;
  /** 获取所有检查点 */
  getAll(taskId?: string): Promise<Checkpoint[]>;
  /** 删除检查点 */
  delete(id: string): Promise<void>;
  /** 清空所有检查点 */
  clear(taskId?: string): Promise<void>;
}
