import type { Task, TaskStatus } from "@/dataAccess";

export const STATUS_ORDER: TaskStatus[] = [
  "doing",
  "todo",
  "hold",
  "done",
  "dropped",
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  hold: "已搁置",
  dropped: "已放弃",
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "var(--color-st-todo)",
  doing: "var(--color-st-doing)",
  done: "var(--color-st-done)",
  hold: "var(--color-st-hold)",
  dropped: "var(--color-st-dropped)",
};

export const STATUS_FORM_ORDER: TaskStatus[] = [
  "todo",
  "doing",
  "done",
  "hold",
  "dropped",
];

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.star !== b.star) return a.star ? -1 : 1;
    const byUpdated = b.updated.localeCompare(a.updated);
    if (byUpdated !== 0) return byUpdated;
    return a.title.localeCompare(b.title, "zh");
  });
}

export function groupTasks(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = {
    todo: [],
    doing: [],
    done: [],
    hold: [],
    dropped: [],
  };
  for (const t of tasks) groups[t.status].push(t);
  for (const k of STATUS_ORDER) groups[k] = sortTasks(groups[k]);
  return groups;
}

export function doingCount(tasks: Task[]): number {
  return tasks.filter((t) => t.status === "doing").length;
}

export function todoCount(tasks: Task[]): number {
  return tasks.filter((t) => t.status === "todo").length;
}

export function latestUpdated(tasks: Task[]): string | null {
  if (tasks.length === 0) return null;
  return tasks.reduce((max, t) => (t.updated > max ? t.updated : max), tasks[0].updated);
}
