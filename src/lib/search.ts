// lib/search.ts — 全文搜索纯函数（M3）：内存匹配任务 / 项目 / 收件箱。
// 已归档项目默认排除；纯函数便于单元测试与未来在 agent 侧复用。

import type { InboxItem, Space } from "@/types";

export interface SearchHit {
  kind: "任务" | "项目" | "收件箱";
  /** 任务/项目：跳转定位 */
  spaceId?: string;
  projectId?: string;
  taskId?: string;
  /** 收件箱条目 ID */
  id?: string;
  path: string;
  title: string;
  snippet: string;
  matchText: string;
}

export function makeSnippet(text: string, q: string, span = 70): { snippet: string; matchText: string } {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) {
    const head = text.slice(0, span);
    return { snippet: head + (text.length > span ? "…" : ""), matchText: "" };
  }
  const from = Math.max(0, Math.floor(idx - span / 2));
  const to = Math.min(text.length, idx + q.length + span / 2);
  return {
    snippet: `${from > 0 ? "…" : ""}${text.slice(from, idx)}${text.slice(idx, idx + q.length)}${text.slice(idx + q.length, to)}${to < text.length ? "…" : ""}`,
    matchText: text.slice(idx, idx + q.length),
  };
}

export function searchAll(
  spaces: Space[],
  inbox: InboxItem[],
  query: string,
  opts?: { limit?: number; includeArchived?: boolean },
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const limit = opts?.limit ?? 60;
  const includeArchived = opts?.includeArchived ?? false;
  const out: SearchHit[] = [];

  for (const space of spaces) {
    for (const project of space.projects) {
      if (project.archived && !includeArchived) continue;
      const path = `${space.name} / ${project.name}`;
      if (`${project.name} ${project.description}`.toLowerCase().includes(q)) {
        out.push({
          kind: "项目",
          spaceId: space.id,
          projectId: project.id,
          path,
          title: project.name,
          ...makeSnippet(project.description || project.name, query.trim()),
        });
      }
      for (const task of project.tasks) {
        const haystack = [task.title, task.next, ...task.entries.map((e) => e.text)]
          .filter(Boolean)
          .join("\n");
        if (!haystack.toLowerCase().includes(q)) continue;
        const entryText = task.entries.find((e) => e.text.toLowerCase().includes(q))?.text;
        const source = entryText ?? task.next ?? task.title;
        out.push({
          kind: "任务",
          spaceId: space.id,
          projectId: project.id,
          taskId: task.id,
          path,
          title: task.title,
          ...makeSnippet(source, query.trim()),
        });
      }
    }
  }

  for (const item of inbox) {
    if (!item.text.toLowerCase().includes(q)) continue;
    out.push({
      kind: "收件箱",
      id: item.id,
      path: "收件箱",
      title: "收件箱条目",
      ...makeSnippet(item.text, query.trim()),
    });
  }

  return out.slice(0, limit);
}
