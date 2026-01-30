/**
 * 检查点工具
 * 允许 AI 创建和管理代码检查点
 */

import { BaseTool, type ToolInput, type ToolInputSchema, type ToolResult } from "./BaseTool";
import type { CheckpointManager } from "../checkpoint";

export interface CheckpointToolInput extends ToolInput {
  /** 操作类型 */
  action: "create" | "restore" | "list" | "diff" | "delete";
  /** 检查点名称（创建时使用） */
  name?: string;
  /** 检查点 ID（恢复/删除/查看差异时使用） */
  checkpoint_id?: string;
  /** 任务 ID（用于过滤） */
  task_id?: string;
}

export class CheckpointTool extends BaseTool<CheckpointToolInput> {
  readonly name = "checkpoint";
  readonly description = `管理代码检查点，用于保存和恢复工作状态。

支持的操作：
- create: 创建新检查点，保存当前所有未提交的更改
- restore: 恢复到指定的检查点
- list: 列出所有检查点
- diff: 查看检查点与当前状态的差异
- delete: 删除检查点

使用场景：
- 在进行大量修改前创建检查点
- 修改失败时回滚到之前的状态
- 比较不同版本的代码`;

  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "操作类型: create, restore, list, diff, delete",
        enum: ["create", "restore", "list", "diff", "delete"],
      },
      name: {
        type: "string",
        description: "检查点名称（创建时使用）",
      },
      checkpoint_id: {
        type: "string",
        description: "检查点 ID（恢复/删除/查看差异时使用）",
      },
      task_id: {
        type: "string",
        description: "任务 ID，用于过滤相关检查点",
      },
    },
    required: ["action"],
  };

  private checkpointManager: CheckpointManager | undefined;

  /**
   * 设置检查点管理器
   */
  setCheckpointManager(manager: CheckpointManager): void {
    this.checkpointManager = manager;
  }

  async execute(input: CheckpointToolInput): Promise<ToolResult> {
    if (!this.checkpointManager) {
      return this.failure("检查点管理器未初始化");
    }

    try {
      switch (input.action) {
        case "create":
          return await this.handleCreate(input);
        case "restore":
          return await this.handleRestore(input);
        case "list":
          return await this.handleList(input);
        case "diff":
          return await this.handleDiff(input);
        case "delete":
          return await this.handleDelete(input);
        default:
          return this.failure(`未知操作: ${input.action}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.failure(`检查点操作失败: ${errorMessage}`);
    }
  }

  private async handleCreate(input: CheckpointToolInput): Promise<ToolResult> {
    if (!this.checkpointManager) {
      return this.failure("检查点管理器未初始化");
    }

    const checkpoint = await this.checkpointManager.createCheckpoint({
      name: input.name,
      taskId: input.task_id,
    });

    return this.success(
      `创建检查点成功
ID: ${checkpoint.id}
名称: ${checkpoint.name}
时间: ${new Date(checkpoint.timestamp).toLocaleString()}
变更文件: ${checkpoint.changedFiles.length} 个
统计: +${checkpoint.stats.additions} / -${checkpoint.stats.deletions} 行`
    );
  }

  private async handleRestore(input: CheckpointToolInput): Promise<ToolResult> {
    if (!this.checkpointManager) {
      return this.failure("检查点管理器未初始化");
    }

    if (!input.checkpoint_id) {
      return this.failure("恢复检查点需要提供 checkpoint_id");
    }

    await this.checkpointManager.restoreCheckpoint(input.checkpoint_id, {
      createBackup: true,
    });

    return this.success(`已恢复到检查点: ${input.checkpoint_id}`);
  }

  private async handleList(input: CheckpointToolInput): Promise<ToolResult> {
    if (!this.checkpointManager) {
      return this.failure("检查点管理器未初始化");
    }

    const checkpoints = await this.checkpointManager.getAllCheckpoints(
      input.task_id
    );

    if (checkpoints.length === 0) {
      return this.success("暂无检查点");
    }

    const list = checkpoints
      .map((cp) => {
        const time = new Date(cp.timestamp).toLocaleString();
        return `- [${cp.id}] ${cp.name}\n  时间: ${time}\n  文件: ${cp.changedFiles.length} 个, +${cp.stats.additions}/-${cp.stats.deletions} 行`;
      })
      .join("\n\n");

    return this.success(`检查点列表 (共 ${checkpoints.length} 个):\n\n${list}`);
  }

  private async handleDiff(input: CheckpointToolInput): Promise<ToolResult> {
    if (!this.checkpointManager) {
      return this.failure("检查点管理器未初始化");
    }

    if (!input.checkpoint_id) {
      return this.failure("查看差异需要提供 checkpoint_id");
    }

    const diff = await this.checkpointManager.getCheckpointDiff(
      input.checkpoint_id
    );

    const fileList = diff.files
      .map((f) => {
        const status = {
          added: "[新增]",
          modified: "[修改]",
          deleted: "[删除]",
          renamed: "[重命名]",
        }[f.status];
        return `  ${status} ${f.path}`;
      })
      .join("\n");

    return this.success(
      `检查点差异: ${diff.toCheckpoint.name}
变更: ${diff.stats.filesChanged} 个文件, +${diff.stats.additions}/-${diff.stats.deletions} 行

文件列表:
${fileList}`
    );
  }

  private async handleDelete(input: CheckpointToolInput): Promise<ToolResult> {
    if (!this.checkpointManager) {
      return this.failure("检查点管理器未初始化");
    }

    if (!input.checkpoint_id) {
      return this.failure("删除检查点需要提供 checkpoint_id");
    }

    await this.checkpointManager.deleteCheckpoint(input.checkpoint_id);
    return this.success(`已删除检查点: ${input.checkpoint_id}`);
  }
}
