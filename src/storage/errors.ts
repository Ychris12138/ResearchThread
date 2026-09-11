// storage/errors.ts — 跨层数据错误类型（无 IO 依赖，UI 可直接 import 判别）。

/**
 * 外部修改冲突：UI 编辑所基于的磁盘内容已被外部工具（Obsidian / git / 手改）更新，
 * 保存被阻止。用户选择「覆盖保存」时先 acknowledgeExternalChange(rel) 再重试。
 */
export class ExternalConflictError extends Error {
  constructor(public readonly rel: string) {
    super(`文件已被外部修改（${rel}），为避免覆盖，保存已阻止`);
    this.name = "ExternalConflictError";
  }
}
