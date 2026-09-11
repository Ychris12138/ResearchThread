// storage/snapshot.ts — 快照健康（发布门槛：可验证的每日快照，失败必须在界面可见）。
// 每日首次启动：检测 git → 补仓库级身份 → 确认存在有效提交 → 在会话数据修改后立刻做当日快照。
// git 不在 PATH、init / commit 失败 → 返回 ok:false，由 UI 显示持久警告；绝不静默降级。
// 所有 config 只写 --local（数据目录仓库级），不碰用户全局 git 配置。

import { todayISO } from "../lib/format";
import type { FsAdapter } from "./fsAdapter";
import { gitSnapshot, runGit } from "./git";

export interface SnapshotHealth {
  ok: boolean;
  /** 人可读的失败原因（ok=false 时） */
  reason?: string;
  /** 最近一次快照提交日期 YYYY-MM-DD */
  lastSnapshotDate?: string;
}

function brief(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 160);
}

async function lastCommitDate(dataDir: string): Promise<string | undefined> {
  const log = await runGit(dataDir, ["log", "-1", "--format=%cI"]);
  return log.ok ? log.output.slice(0, 10) || undefined : undefined;
}

export async function ensureSnapshotHealth(
  dataDir: string,
  adapter: FsAdapter,
): Promise<SnapshotHealth> {
  // 1. git 可用性（未安装 / 不在 PATH → 降级警告）
  try {
    const v = await runGit(dataDir, ["--version"]);
    if (!v.ok) {
      return { ok: false, reason: `git 不可用：${brief(v.output) || `exit ${v.code}`}` };
    }
  } catch {
    return { ok: false, reason: "未检测到 git（未安装或不在 PATH），快照保护不可用" };
  }

  // 2. 仓库初始化（已有则跳过）
  if (!(await adapter.exists(`${dataDir}/.git`))) {
    const init = await runGit(dataDir, ["init"]);
    if (!init.ok) return { ok: false, reason: `git init 失败：${brief(init.output)}` };
  }

  // 3. 仓库级身份兜底：没有 user.email 时 commit 会静默失败（必须补上才算健康）
  const email = await runGit(dataDir, ["config", "--local", "user.email"]);
  if (!email.ok || !email.output.trim()) {
    await runGit(dataDir, ["config", "--local", "user.name", "ResearchThread"]);
    await runGit(dataDir, ["config", "--local", "user.email", "researchthread@local"]);
  }

  // 4. 有效提交存在性：旧版本初始化可能 init 成功但 commit 失败（.git 在、无提交）
  const head = await runGit(dataDir, ["rev-parse", "--verify", "HEAD"]);
  if (!head.ok) {
    await runGit(dataDir, ["add", "-A"]);
    const c = await runGit(dataDir, [
      "commit",
      "-m",
      "init: ResearchThread data directory",
      "--allow-empty",
    ]);
    if (!c.ok) return { ok: false, reason: `初始提交失败：${brief(c.output)}` };
  }

  // 5. 每日快照：最近一次提交不在今天 → 现在提交（启动早期，当日数据修改之后、UI 交互之前）
  const today = todayISO();
  const last = await lastCommitDate(dataDir);
  if (!last || last < today) {
    try {
      await gitSnapshot(dataDir, `daily ${today}`);
    } catch (e) {
      return {
        ok: false,
        reason: `每日快照失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  return { ok: true, lastSnapshotDate: (await lastCommitDate(dataDir)) ?? today };
}
