// dataAccess.ts — 类型出口 + 数据层选择器。
// 契约定义见 types.ts（UI.md 第 2 节，签名不可改）：
//   - Tauri 桌面端 → StorageDataAccess（Markdown 文件树落盘）
//   - 纯浏览器 dev → MockDataAccess（内存数据，便于调 UI）
// 组件里一律 getDataAccess()；不要绕过它触文件。

import { todayISO } from "@/lib/format";
import { SEED_SPACES } from "@/mockData";
import { buildWeeklySkeleton } from "./storage/weekly";
import { weekRange, weeklyFileId } from "./storage/core";
import type {
  AppDataAccess,
  InboxItem,
  Project,
  Space,
  Task,
  TaskMeta,
  WeeklyDoc,
} from "./types";

export type {
  AppDataAccess,
  ContextEntry,
  DataAccess,
  InboxItem,
  Project,
  Space,
  Task,
  TaskMeta,
  TaskStatus,
  WeeklyDoc,
} from "./types";
export { ExternalConflictError } from "./storage/errors";
export type { SnapshotHealth } from "./storage/snapshot";
import type { DataAccess } from "./types";

// ---------------------------------------------------------------------------
// Mock 实现（浏览器 dev / 测试）
// ---------------------------------------------------------------------------

function clone<T>(value: T): T {
  return structuredClone(value);
}

function asMeta(task: Task): TaskMeta {
  const { entries: _entries, ...meta } = task;
  void _entries;
  return { ...meta };
}

/** 导出供测试与双实现一致性校验使用；seed 传 [] 可得空数据集 */
export class MockDataAccess implements AppDataAccess {
  private db: Space[];
  private inbox: InboxItem[] = [];
  private weekly = new Map<string, string>();

  constructor(seed: Space[] = SEED_SPACES) {
    this.db = clone(seed);
  }

  private space(spaceId: string): Space {
    const found = this.db.find((s) => s.id === spaceId);
    if (!found) throw new Error(`空间不存在：${spaceId}`);
    return found;
  }

  private project(spaceId: string, projectId: string): Project {
    const found = this.space(spaceId).projects.find((p) => p.id === projectId);
    if (!found) throw new Error(`项目不存在：${projectId}`);
    return found;
  }

  private task(spaceId: string, projectId: string, taskId: string): Task {
    const found = this.project(spaceId, projectId).tasks.find((t) => t.id === taskId);
    if (!found) throw new Error(`任务不存在：${taskId}`);
    return found;
  }

  async listSpaces(): Promise<Space[]> {
    return clone(this.db);
  }

  async getTask(spaceId: string, projectId: string, taskId: string): Promise<Task> {
    return clone(this.task(spaceId, projectId, taskId));
  }

  async createSpace(name: string): Promise<Space> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("空间名称不能为空");
    const id = uniqueSlug(slugify(trimmed, "space"), this.db.map((s) => s.id));
    const space: Space = { id, name: trimmed, projects: [] };
    this.db.push(space);
    return clone(space);
  }

  async createProject(spaceId: string, name: string): Promise<Project> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("项目名称不能为空");
    const space = this.space(spaceId);
    const id = uniqueSlug(
      slugify(trimmed, "project"),
      space.projects.map((p) => p.id),
    );
    const project: Project = { id, name: trimmed, description: "", tasks: [] };
    space.projects.push(project);
    return clone(project);
  }

  async createTask(
    spaceId: string,
    projectId: string,
    title: string,
    next?: string,
  ): Promise<Task> {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("任务标题不能为空");
    const project = this.project(spaceId, projectId);
    const today = todayISO();
    const stem = `${today}-${slugify(trimmed, "task")}`;
    const existing = project.tasks.map((t) => t.id);
    let id = `${stem}.md`;
    let n = 2;
    while (existing.includes(id)) {
      id = `${stem}-${n}.md`;
      n += 1;
    }
    const task: Task = {
      id,
      title: trimmed,
      status: "todo",
      star: false,
      next: (next ?? "").trim(),
      created: today,
      updated: today,
      entries: [],
    };
    project.tasks.push(task);
    return clone(task);
  }

  async updateTaskMeta(
    spaceId: string,
    projectId: string,
    taskId: string,
    patch: Partial<Pick<TaskMeta, "title" | "status" | "star" | "next">>,
  ): Promise<TaskMeta> {
    const task = this.task(spaceId, projectId, taskId);
    if (patch.title !== undefined) {
      const trimmed = patch.title.trim();
      if (!trimmed) throw new Error("任务标题不能为空");
      task.title = trimmed;
    }
    if (patch.status !== undefined) task.status = patch.status;
    if (patch.star !== undefined) task.star = patch.star;
    if (patch.next !== undefined) task.next = patch.next.trim();
    task.updated = todayISO();
    return asMeta(clone(task));
  }

  async appendEntry(
    spaceId: string,
    projectId: string,
    taskId: string,
    entry: { text: string },
  ): Promise<Task> {
    const task = this.task(spaceId, projectId, taskId);
    const text = entry.text.trim();
    if (!text) throw new Error("条目内容不能为空");
    task.entries.push({ date: todayISO(), author: "me", text });
    task.updated = todayISO();
    return clone(task);
  }

  async updateEntry(
    spaceId: string,
    projectId: string,
    taskId: string,
    index: number,
    text: string,
  ): Promise<Task> {
    const task = this.task(spaceId, projectId, taskId);
    const entry = task.entries[index];
    if (!entry) throw new Error("条目不存在");
    if (entry.author !== "me") throw new Error("仅能编辑自己写的条目");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("条目内容不能为空");
    entry.text = trimmed;
    task.updated = todayISO();
    return clone(task);
  }

  async updateProjectDescription(
    spaceId: string,
    projectId: string,
    description: string,
  ): Promise<void> {
    this.project(spaceId, projectId).description = description;
  }

  async deleteTask(spaceId: string, projectId: string, taskId: string): Promise<void> {
    const project = this.project(spaceId, projectId);
    const idx = project.tasks.findIndex((t) => t.id === taskId);
    if (idx < 0) throw new Error(`任务不存在：${taskId}`);
    project.tasks.splice(idx, 1);
  }

  async listInbox(): Promise<InboxItem[]> {
    return clone(this.inbox);
  }

  async captureInbox(text: string): Promise<InboxItem> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("捕获内容不能为空");
    const item: InboxItem = {
      id: `${todayISO()}-${String(this.inbox.length + 1).padStart(6, "0")}.md`,
      created: todayISO(),
      text: trimmed,
    };
    this.inbox.unshift(item);
    return clone(item);
  }

  async promoteInbox(id: string, spaceId: string, projectId: string): Promise<Task> {
    const idx = this.inbox.findIndex((i) => i.id === id);
    if (idx < 0) throw new Error("收件箱条目不存在");
    const item = this.inbox[idx];
    const firstLine = item.text.split(/\r?\n/).find((l) => l.trim()) ?? "";
    const task = await this.createTask(spaceId, projectId, firstLine.trim() || "未命名任务");
    const full = await this.appendEntry(spaceId, projectId, task.id, { text: item.text });
    this.inbox.splice(idx, 1);
    return full;
  }

  async deleteInboxItem(id: string): Promise<void> {
    const idx = this.inbox.findIndex((i) => i.id === id);
    if (idx >= 0) this.inbox.splice(idx, 1);
  }

  async setProjectArchived(spaceId: string, projectId: string, archived: boolean): Promise<void> {
    const project = this.project(spaceId, projectId);
    project.archived = archived || undefined;
  }

  async listWeekly(): Promise<WeeklyDoc[]> {
    return [...this.weekly.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([id, content]) => ({ id, content }));
  }

  async getWeekly(id: string): Promise<string> {
    const content = this.weekly.get(id);
    if (content === undefined) throw new Error(`周文档不存在：${id}`);
    return content;
  }

  async generateWeekly(dateIso?: string): Promise<WeeklyDoc> {
    const date = dateIso ?? todayISO();
    const weekId = weeklyFileId(date);
    const { start, end } = weekRange(date);
    const content = buildWeeklySkeleton({
      weekId,
      start,
      end,
      spaces: this.db,
      events: [],
      inboxCount: this.inbox.length,
    });
    const id = `${weekId}.md`;
    this.weekly.set(id, content);
    return { id, content };
  }

  async saveWeekly(id: string, content: string): Promise<void> {
    if (!/^\d{4}-W\d{2}\.md$/.test(id)) throw new Error("非法的周文档 ID");
    this.weekly.set(id, content);
  }
}

// format helpers（mock 专用，保留原有行为：ASCII slug）
import { slugify, uniqueSlug } from "@/lib/format";

// ---------------------------------------------------------------------------
// 初始化与访问器
// ---------------------------------------------------------------------------

let impl: DataAccess | null = null;
let storageImpl: import("./storage").StorageDataAccess | null = null;
let tauriAdapter: import("./storage/fsAdapter").FsAdapter | null = null;
let dataDir: string | null = null;
let snapshotHealth: import("./storage/snapshot").SnapshotHealth | null = null;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 应用启动时调用一次：Tauri 下初始化 storage（含数据目录初始化），浏览器下用 mock。 */
export async function initDataAccess(): Promise<DataAccess> {
  if (impl) return impl;
  if (isTauri()) {
    const { homeDir } = await import("@tauri-apps/api/path");
    const home = (await homeDir()).replace(/\\/g, "/").replace(/\/+$/, "");
    const { StorageDataAccess } = await import("./storage");
    const { TauriFsAdapter } = await import("./storage/fsAdapter");
    const adapter = new TauriFsAdapter();
    const dir = `${home}/ResearchThread`;
    const store = new StorageDataAccess(adapter, dir);
    await store.init();
    // 快照健康 + 每日首启自动提交（git 缺失/失败 → 界面持久警告，绝不静默）
    const { ensureSnapshotHealth } = await import("./storage/snapshot");
    snapshotHealth = await ensureSnapshotHealth(dir, adapter);
    impl = store;
    storageImpl = store;
    tauriAdapter = adapter;
    dataDir = dir;
  } else {
    impl = new MockDataAccess();
  }
  return impl;
}

/** 启动时的快照健康结果（null = 非 Tauri / 尚未初始化） */
export function getSnapshotHealth(): import("./storage/snapshot").SnapshotHealth | null {
  return snapshotHealth;
}

/** 修复环境后重查（设置 → 数据 的「重试」按钮） */
export async function refreshSnapshotHealth(): Promise<import("./storage/snapshot").SnapshotHealth | null> {
  if (!isTauri() || !storageImpl || !tauriAdapter) return null;
  const { ensureSnapshotHealth } = await import("./storage/snapshot");
  snapshotHealth = await ensureSnapshotHealth(storageImpl.dataDir, tauriAdapter);
  return snapshotHealth;
}

export function getDataAccess(): DataAccess {
  if (!impl) throw new Error("数据层尚未初始化：先 await initDataAccess()");
  return impl;
}

/** M2 内部功能（收件箱等）。mock 也实现了完整接口。 */
export function getFullDataAccess(): AppDataAccess {
  return getDataAccess() as AppDataAccess;
}

/** watcher 用：storage 实例（浏览器为 null） */
export function getStorage(): import("./storage").StorageDataAccess | null {
  return storageImpl;
}

/** 当前数据目录绝对路径（浏览器为 null） */
export function currentDataDir(): string | null {
  return dataDir;
}
