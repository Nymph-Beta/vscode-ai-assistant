/**
 * Per-Task Checkpoint Service
 * 每个任务独立的检查点仓库
 * 基于 Roo-Code 的 RepoPerTaskCheckpointService 实现
 */

import * as path from "node:path";
import { ShadowCheckpointService } from "./ShadowCheckpointService";

/** 创建选项 */
export interface CheckpointServiceOptions {
  taskId: string;
  workspaceDir: string;
  shadowDir: string;  // 通常是 globalStorageUri.fsPath
  log?: (message: string) => void;
}

/**
 * Per-Task Checkpoint Service
 * 每个任务在 shadowDir/tasks/{taskId}/checkpoints/ 下有自己的 Git 仓库
 */
export class RepoPerTaskCheckpointService extends ShadowCheckpointService {
  readonly taskId: string;

  private constructor(
    taskId: string,
    checkpointsDir: string,
    workspaceDir: string,
    log?: (message: string) => void
  ) {
    super(workspaceDir, checkpointsDir, log);
    this.taskId = taskId;
  }

  /**
   * 创建 Per-Task 检查点服务
   */
  static create(options: CheckpointServiceOptions): RepoPerTaskCheckpointService {
    const { taskId, workspaceDir, shadowDir, log } = options;
    const checkpointsDir = path.join(shadowDir, "tasks", taskId, "checkpoints");

    return new RepoPerTaskCheckpointService(
      taskId,
      checkpointsDir,
      workspaceDir,
      log
    );
  }

  /**
   * 获取任务 ID
   */
  getTaskId(): string {
    return this.taskId;
  }
}
