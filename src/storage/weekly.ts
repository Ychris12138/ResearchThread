// storage/weekly.ts — 周文档确定性骨架（M3）。
// 骨架从活动日志 + 项目地图快照机械推导，不依赖模型可用性（PLAN.md 第七节）；
// 2d 阶段 agent 只在此骨架之上补叙事。

import type { Space } from "../types";

export interface WeekEvent {
  date: string; // YYYY-MM-DD（取自活动记录 ts 的日期部分）
  actor: string; // app | agent | external
  event: string;
  entity: string;
  id: string;
  detail?: unknown;
}

export interface WeeklySkeletonInput {
  weekId: string; // 如 "2026-W37"
  start: string; // 周一 YYYY-MM-DD
  end: string; // 周日 YYYY-MM-DD
  spaces: Space[]; // 当前项目地图快照
  events: WeekEvent[];
  inboxCount: number; // 生成时刻的收件箱积压
  staleDays?: number; // 进行中任务多少天未更新算滞留，默认 14
}

interface TaskRef {
  space: Space;
  project: { id: string; name: string; archived?: boolean };
  task: { id: string; title: string; status: string; star: boolean; next: string; updated: string };
}

function diffDays(later: string, earlier: string): number {
  // Date.UTC 的 month 是 0–11；Markdown 日期是 1–12，必须 -1（跨月边界差 1–3 天）
  const [ly, lm, ld] = later.split("-").map(Number);
  const [ey, em, ed] = earlier.split("-").map(Number);
  const a = Date.UTC(ly, (lm ?? 1) - 1, ld ?? 1);
  const b = Date.UTC(ey, (em ?? 1) - 1, ed ?? 1);
  return Math.round((a - b) / 86400000);
}

export function buildWeeklySkeleton(input: WeeklySkeletonInput): string {
  const { weekId, start, end, spaces, events, inboxCount } = input;
  const staleDays = input.staleDays ?? 14;

  // 任务定位表：主键 = 活动记录里的完整相对路径（活动账的 id 就是它）；
  // 文件名作回退索引——跨项目同名任务会有歧义，只记先见到者，避免归错项目
  const taskIndexByPath = new Map<string, TaskRef>();
  const taskIndexByName = new Map<string, TaskRef>();
  for (const space of spaces) {
    for (const project of space.projects) {
      for (const task of project.tasks) {
        const rel = `spaces/${space.id}/projects/${project.id}/tasks/${task.id}`;
        const ref: TaskRef = {
          space,
          project: { id: project.id, name: project.name, archived: project.archived },
          task,
        };
        taskIndexByPath.set(rel, ref);
        if (!taskIndexByName.has(task.id)) taskIndexByName.set(task.id, ref);
      }
    }
  }
  const refOf = (id: string): TaskRef | null => {
    const key = id.replace(/\\/g, "/");
    return (
      taskIndexByPath.get(key) ??
      taskIndexByName.get(key.split("/").pop() ?? key) ??
      null
    );
  };
  const loc = (ref: TaskRef) => `${ref.space.name} / ${ref.project.name}`;

  // —— 本周动态 ——
  const lines: string[] = [];
  let externalCount = 0;
  for (const ev of events) {
    if (ev.actor === "external") {
      externalCount++;
      continue;
    }
    const ref = ev.entity === "task" || ev.entity === "inbox" ? refOf(ev.id) : null;
    const name =
      (ev.detail as { title?: string } | undefined)?.title ?? ref?.task.title ?? "";
    const mmdd = ev.date.slice(5).replace("-", "/");
    switch (ev.event) {
      case "create_task":
        // ref 解析不到（跨周新建后已删等）时不留尾部「·」
        if (name) lines.push(ref ? `- ${mmdd} 新建任务「${name}」· ${loc(ref)}` : `- ${mmdd} 新建任务「${name}」`);
        break;
      case "set_status": {
        const d = (ev.detail ?? {}) as { from?: string; to?: string };
        lines.push(`- ${mmdd} 「${ref?.task.title ?? "?"}」状态：${d.from ?? "?"} → ${d.to ?? "?"}`);
        break;
      }
      case "set_star": {
        const d = (ev.detail ?? {}) as { to?: boolean };
        lines.push(`- ${mmdd} ${d.to ? "标记☆" : "取消☆"}「${ref?.task.title ?? "?"}」`);
        break;
      }
      case "append_entry":
        lines.push(`- ${mmdd} 「${ref?.task.title ?? "?"}」追加上下文`);
        break;
      case "update_entry":
        lines.push(`- ${mmdd} 「${ref?.task.title ?? "?"}」修订上下文`);
        break;
      case "create_project":
        lines.push(`- ${mmdd} 新建项目「${(ev.detail as { name?: string })?.name ?? ""}」`);
        break;
      case "create_space":
        lines.push(`- ${mmdd} 新建空间「${(ev.detail as { name?: string })?.name ?? ""}」`);
        break;
      case "inbox_promote": {
        const t = (ev.detail as { task?: string })?.task;
        lines.push(`- ${mmdd} 收件箱转为任务${t ? `「${refOf(t)?.task.title ?? t}」` : ""}`);
        break;
      }
      default:
        break;
    }
  }
  if (externalCount > 0) {
    lines.push(`- 外部编辑 ×${externalCount}（Obsidian / git / 手改，详见活动日志）`);
  }

  // —— 当前活跃工作线（进行中 / 待办；☆ 置顶，其余按 空间/项目/标题 稳定排序） ——
  const activeRows: { row: string; star: boolean; sortKey: string }[] = [];
  const stale: string[] = [];
  const hold: string[] = [];
  const dropped: string[] = [];
  for (const space of spaces) {
    for (const project of space.projects) {
      if (project.archived) continue;
      for (const task of project.tasks) {
        const path = `${space.name} / ${project.name}`;
        const star = task.star ? "☆ " : "";
        const next = task.next ? ` · 下一步：${task.next}` : "";
        const row = `- ${star}${task.title} —— ${path}${next}`;
        if (task.status === "doing" || task.status === "todo") {
          activeRows.push({ row, star: task.star, sortKey: `${path}/${task.title}` });
          if (task.status === "doing" && diffDays(end, task.updated) >= staleDays) {
            stale.push(`- 「${task.title}」进行中已 ${diffDays(end, task.updated)} 天未更新（${path}）`);
          }
        } else if (task.status === "hold") {
          hold.push(`- ${task.title}（${path}，更新于 ${task.updated}）`);
        } else if (task.status === "dropped") {
          dropped.push(`- ${task.title}（${path}）`);
        }
      }
    }
  }
  const active = activeRows
    .sort(
      (a, b) =>
        (b.star ? 1 : 0) - (a.star ? 1 : 0) || a.sortKey.localeCompare(b.sortKey),
    )
    .map((r) => r.row);

  const out: string[] = [];
  out.push(`# 周报 ${weekId}（${start} ~ ${end}）`, "");
  out.push("> 由 ResearchThread 确定性骨架生成；重新生成会覆盖手工修改（git 历史可找回）。", "");
  out.push("## 本周动态", "");
  out.push(...(lines.length ? lines : ["本周没有记录到操作。"]), "");
  out.push("## 当前活跃工作线", "");
  out.push(...(active.length ? active : ["没有进行中 / 待办的工作线。"]), "");
  out.push("## 需要关注", "");
  out.push(...(stale.length ? stale : []));
  if (inboxCount > 0) out.push(`- 收件箱积压 ${inboxCount} 条，找个时间归位。`);
  if (!stale.length && inboxCount === 0) out.push("一切正常。");
  out.push("");
  out.push("## 搁置", "");
  out.push(...(hold.length ? hold : ["无。"]), "");
  out.push("## 已放弃", "");
  out.push(...(dropped.length ? dropped : ["无。"]), "");
  return out.join("\n");
}
