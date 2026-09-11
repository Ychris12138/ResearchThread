// Shared domain types + the DataAccess contract (UI.md 第 2 节).
// UI components import types from "@/dataAccess" (re-exported here);
// storage and mock layers both implement these interfaces.

export type TaskStatus = "todo" | "doing" | "done" | "hold" | "dropped";

export interface TaskMeta {
  id: string; // 文件名（稳定 ID），如 "2026-09-10-reply-reviewers.md"
  title: string;
  status: TaskStatus;
  star: boolean;
  next: string; // 下一步动作，可为空串
  created: string; // YYYY-MM-DD
  updated: string; // YYYY-MM-DD
}

export interface ContextEntry {
  date: string; // YYYY-MM-DD
  author: "me" | "agent";
  text: string;
}

export interface Task extends TaskMeta {
  entries: ContextEntry[]; // 时间正序（旧 → 新）
}

export interface Project {
  id: string; // 目录 slug，如 "paper-dft"
  name: string;
  description: string; // 项目整体上下文（markdown 源码，人写区）
  tasks: Task[];
  archived?: boolean; // M3：已归档（project.md frontmatter `archived: true`）
}

export interface Space {
  id: string; // 目录 slug，如 "research"
  name: string;
  projects: Project[];
}

export interface DataAccess {
  listSpaces(): Promise<Space[]>;
  getTask(spaceId: string, projectId: string, taskId: string): Promise<Task>;
  createSpace(name: string): Promise<Space>;
  createProject(spaceId: string, name: string): Promise<Project>;
  createTask(
    spaceId: string,
    projectId: string,
    title: string,
    next?: string,
  ): Promise<Task>;
  updateTaskMeta(
    spaceId: string,
    projectId: string,
    taskId: string,
    patch: Partial<Pick<TaskMeta, "title" | "status" | "star" | "next">>,
  ): Promise<TaskMeta>;
  appendEntry(
    spaceId: string,
    projectId: string,
    taskId: string,
    entry: { text: string },
  ): Promise<Task>; // date=今天、author='me'，由实现层填
  updateEntry(
    spaceId: string,
    projectId: string,
    taskId: string,
    index: number,
    text: string,
  ): Promise<Task>; // 仅允许 author='me' 的条目
  updateProjectDescription(
    spaceId: string,
    projectId: string,
    description: string,
  ): Promise<void>;
  deleteTask(spaceId: string, projectId: string, taskId: string): Promise<void>;
}

export interface InboxItem {
  id: string; // 文件名，如 "2026-09-10-143012.md"
  created: string; // YYYY-MM-DD（取自文件名）
  text: string;
}

export interface WeeklyDoc {
  id: string; // 文件名，如 "2026-W37.md"
  content: string; // markdown 源码
}

/** M2 起应用内部使用的完整接口（DataAccess 的超集，UI.md 契约保持不变）。 */
export interface AppDataAccess extends DataAccess {
  listInbox(): Promise<InboxItem[]>;
  captureInbox(text: string): Promise<InboxItem>;
  promoteInbox(id: string, spaceId: string, projectId: string): Promise<Task>;
  deleteInboxItem(id: string): Promise<void>;
  setProjectArchived(spaceId: string, projectId: string, archived: boolean): Promise<void>;
  listWeekly(): Promise<WeeklyDoc[]>;
  getWeekly(id: string): Promise<string>;
  generateWeekly(dateIso?: string): Promise<WeeklyDoc>; // 确定性骨架；重生成会覆盖
  saveWeekly(id: string, content: string): Promise<void>;
}
