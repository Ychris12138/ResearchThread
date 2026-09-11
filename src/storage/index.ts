// storage/index.ts — 应用侧唯一数据层。所有数据变更必须经过这里（UI 不得直接调 fs 插件）。
// 例外（PLAN.md 约定）：底部终端里的 CLI agent、Obsidian 等外部工具直改文件 →
// 由 watcher 观察并记 actor=external（见 lib/watcher.ts）。

import { todayISO } from "../lib/format";
import { markSelfWrite } from "../lib/selfWrites";
import type {
  AppDataAccess,
  ContextEntry,
  InboxItem,
  Project,
  Space,
  Task,
  TaskMeta,
  WeeklyDoc,
} from "../types";
import * as core from "./core";
import { recoverInterruptedWrites } from "./atomicWrite";
import type { FsAdapter } from "./fsAdapter";
import { ExternalConflictError } from "./errors";
import { buildWeeklySkeleton, type WeekEvent } from "./weekly";

const TASK_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export { ExternalConflictError } from "./errors";

function today(): string {
  return todayISO();
}

export class StorageDataAccess implements AppDataAccess {
  constructor(
    private readonly adapter: FsAdapter,
    readonly dataDir: string,
  ) {}

  /** 应用最后已知的磁盘内容（读/写成功后更新）；保存前比对以检测外部修改 */
  private readonly seen = new Map<string, string>();

  /** 数据目录初始化：中断写入恢复 + 目录骨架 + AGENTS.md/.mcp.json/settings.yaml/.gitignore */
  async init(): Promise<void> {
    // 中断写入恢复必须先于一切读写（发布门槛：任何失败后原文件或备份必有一个可恢复）
    const restored = await recoverInterruptedWrites(this.adapter, this.dataDir);
    for (const rel of [
      core.paths.spacesDir(),
      core.paths.inboxDir(),
      core.paths.weeklyDir(),
      core.paths.dailyDir(),
      ".activity",
    ]) {
      await this.adapter.mkdir(this.abs(rel));
    }
    await this.ensureFile(core.paths.agentsFile(), core.templateAgentsMd());
    await this.ensureFile(core.paths.settingsFile(), core.templateSettingsYaml());
    await this.ensureFile(core.paths.mcpFile(), core.TEMPLATE_MCP_JSON);
    await this.ensureFile(core.paths.gitignoreFile(), core.DATA_GITIGNORE);
    for (const abs of restored) {
      await this.logActivity("app", "file", abs.slice(this.dataDir.length + 1), "recover_interrupted_write");
    }
  }

  // —— 基础 IO（全部经 markSelfWrite 供 watcher 消歧） ——

  private abs(rel: string): string {
    return `${this.dataDir}/${rel}`;
  }

  private async read(rel: string): Promise<string> {
    const text = await this.adapter.readTextFile(this.abs(rel));
    this.seen.set(rel, text);
    return text;
  }

  /**
   * 保存前的外部修改检查：磁盘内容与应用最后已知内容不一致 → 冲突。
   * 用户在 UI 选择「覆盖保存」后调 acknowledgeExternalChange，再重试保存。
   */
  private async readForSave(rel: string): Promise<string> {
    const disk = await this.adapter.readTextFile(this.abs(rel));
    const known = this.seen.get(rel);
    if (known !== undefined && known !== disk) throw new ExternalConflictError(rel);
    this.seen.set(rel, disk);
    return disk;
  }

  /** 冲突处理（UI「覆盖保存」后调用）：基准同步为当前磁盘内容，随后的保存不再被阻止 */
  async acknowledgeExternalChange(rel: string): Promise<void> {
    if (rel.includes("..")) throw new Error("非法路径");
    const text = await this.adapter.readTextFile(this.abs(rel));
    this.seen.set(rel, text);
  }

  private async write(rel: string, contents: string): Promise<void> {
    const abs = this.abs(rel);
    await this.adapter.writeTextFile(abs, contents);
    this.seen.set(rel, contents);
    markSelfWrite(abs);
  }

  private async appendLine(rel: string, line: string): Promise<void> {
    const abs = this.abs(rel);
    await this.adapter.appendTextFile(abs, `${line}\n`);
    markSelfWrite(abs);
  }

  private async exists(rel: string): Promise<boolean> {
    return this.adapter.exists(this.abs(rel));
  }

  private async remove(rel: string): Promise<void> {
    await this.adapter.remove(this.abs(rel));
    markSelfWrite(this.abs(rel));
  }

  private async ensureFile(rel: string, contents: string): Promise<void> {
    if (!(await this.exists(rel))) await this.write(rel, contents);
  }

  /** 活动留痕：绝不抛错（日志失败不能阻塞数据操作） */
  async logActivity(
    actor: core.ActivityActor,
    entity: string,
    id: string,
    event: string,
    detail?: unknown,
  ): Promise<void> {
    try {
      await this.adapter.mkdir(this.abs(".activity"));
      await this.appendLine(core.paths.activityLog(), core.activityLine({ actor, entity, id, event, detail }));
    } catch {
      // ignore
    }
  }

  /** watcher 用：外部修改批量入账 */
  async logExternalModify(relPaths: string[]): Promise<void> {
    for (const rel of relPaths) {
      await this.logActivity("external", "file", rel, "modify");
    }
  }

  /** watcher 用：递归监听数据目录 */
  watch(cb: (absPaths: string[]) => void): Promise<() => void> {
    return this.adapter.watch(this.dataDir, cb);
  }

  // —— 空间 / 项目 / 任务 ——

  async listSpaces(): Promise<Space[]> {
    const spaceEntries = await this.adapter.readDir(this.abs(core.paths.spacesDir()));
    const spaces: Space[] = [];
    for (const se of spaceEntries.filter((e) => e.isDirectory)) {
      const spaceId = se.name;
      const spaceDoc = await this.readNamedSafe(core.paths.spaceFile(spaceId));
      const projects: Project[] = [];
      const projEntries = await this.adapter.readDir(
        this.abs(core.paths.projectsDir(spaceId)),
      );
      for (const pe of projEntries.filter((e) => e.isDirectory)) {
        const projectId = pe.name;
        const projDoc = await this.readNamedSafe(core.paths.projectFile(spaceId, projectId));
        const tasks: Task[] = [];
        const taskEntries = await this.adapter.readDir(
          this.abs(core.paths.tasksDir(spaceId, projectId)),
        );
        for (const te of taskEntries.filter((e) => !e.isDirectory && e.name.endsWith(".md"))) {
          try {
            const doc = core.parseTaskDoc(await this.read(core.paths.taskFile(spaceId, projectId, te.name)));
            tasks.push({ id: te.name, ...doc.meta, entries: doc.entries });
          } catch {
            // 单个任务文件损坏不拖垮整棵树
          }
        }
        tasks.sort((a, b) => a.id.localeCompare(b.id));
        projects.push({
          id: projectId,
          name: projDoc.title ?? projectId,
          description: projDoc.body,
          tasks,
          archived: projDoc.archived || undefined,
        });
      }
      projects.sort((a, b) => a.id.localeCompare(b.id));
      spaces.push({ id: spaceId, name: spaceDoc.title ?? spaceId, projects });
    }
    spaces.sort((a, b) => a.id.localeCompare(b.id));
    return spaces;
  }

  private async readNamedSafe(rel: string): Promise<{ title: string | null; archived: boolean; body: string; unknown: string[] }> {
    try {
      const doc = core.parseNamedDoc(await this.read(rel));
      return { title: doc.title, archived: doc.archived, body: doc.body, unknown: doc.unknownFrontmatter };
    } catch {
      return { title: null, archived: false, body: "", unknown: [] };
    }
  }

  /** updateProjectDescription 的保存路径：外部修改要抛冲突，仅解析失败时回退空文档 */
  private async readNamedForSave(rel: string): Promise<{ title: string | null; archived: boolean; body: string; unknown: string[] }> {
    try {
      const doc = core.parseNamedDoc(await this.readForSave(rel));
      return { title: doc.title, archived: doc.archived, body: doc.body, unknown: doc.unknownFrontmatter };
    } catch (e) {
      if (e instanceof ExternalConflictError) throw e;
      return { title: null, archived: false, body: "", unknown: [] };
    }
  }

  async createSpace(name: string): Promise<Space> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("空间名称不能为空");
    const spaces = await this.adapter.readDir(this.abs(core.paths.spacesDir()));
    const id = core.uniqueId(
      core.slugifyId(trimmed, "space"),
      spaces.map((e) => e.name),
    );
    await this.adapter.mkdir(this.abs(core.paths.projectsDir(id)));
    await this.write(core.paths.spaceFile(id), core.serializeNamedDoc(trimmed, [], ""));
    await this.logActivity("app", "space", core.paths.spaceFile(id), "create_space", { name: trimmed });
    return { id, name: trimmed, projects: [] };
  }

  async createProject(spaceId: string, name: string): Promise<Project> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("项目名称不能为空");
    const projects = await this.adapter.readDir(this.abs(core.paths.projectsDir(spaceId)));
    const id = core.uniqueId(
      core.slugifyId(trimmed, "project"),
      projects.map((e) => e.name),
    );
    await this.adapter.mkdir(this.abs(core.paths.tasksDir(spaceId, id)));
    await this.write(
      core.paths.projectFile(spaceId, id),
      core.serializeNamedDoc(trimmed, [], ""),
    );
    await this.logActivity("app", "project", core.paths.projectFile(spaceId, id), "create_project", { name: trimmed });
    return { id, name: trimmed, description: "", tasks: [] };
  }

  async createTask(
    spaceId: string,
    projectId: string,
    title: string,
    next?: string,
  ): Promise<Task> {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("任务标题不能为空");
    const existing = await this.adapter.readDir(this.abs(core.paths.tasksDir(spaceId, projectId)));
    const date = today();
    const base = core.makeTaskId(date, core.slugifyId(trimmed, "task"));
    const id = core.uniqueId(base, existing.map((e) => e.name));
    const meta: core.TaskFrontmatter = {
      title: trimmed,
      status: "todo",
      star: false,
      next: (next ?? "").trim(),
      created: date,
      updated: date,
    };
    await this.write(
      core.paths.taskFile(spaceId, projectId, id),
      core.serializeTaskDoc(meta, [], { preamble: "", entries: [], extraBody: "" }),
    );
    await this.logActivity("app", "task", core.paths.taskFile(spaceId, projectId, id), "create_task", { title: trimmed });
    return { id, ...meta, entries: [] };
  }

  async getTask(spaceId: string, projectId: string, taskId: string): Promise<Task> {
    const rel = core.paths.taskFile(spaceId, projectId, taskId);
    const text = await this.read(rel); // 不存在会抛
    const doc = core.parseTaskDoc(text);
    return { id: taskId, ...doc.meta, entries: doc.entries };
  }

  async updateTaskMeta(
    spaceId: string,
    projectId: string,
    taskId: string,
    patch: Partial<Pick<TaskMeta, "title" | "status" | "star" | "next">>,
  ): Promise<TaskMeta> {
    const rel = core.paths.taskFile(spaceId, projectId, taskId);
    const doc = core.parseTaskDoc(await this.readForSave(rel));
    // 旧值先拷贝快照——doc.meta 会被就地修改，引用比较必须用快照
    const oldStatus = doc.meta.status;
    const oldStar = doc.meta.star;
    const oldNext = doc.meta.next;
    const oldTitle = doc.meta.title;

    if (patch.title !== undefined) {
      const t = patch.title.trim();
      if (!t) throw new Error("任务标题不能为空");
      doc.meta.title = t;
    }
    if (patch.status !== undefined) doc.meta.status = patch.status;
    if (patch.star !== undefined) doc.meta.star = patch.star;
    if (patch.next !== undefined) doc.meta.next = patch.next.trim();
    doc.meta.updated = today();

    await this.write(rel, core.serializeTaskDoc(doc.meta, doc.unknownFrontmatter, doc));

    // 字段级活动留痕
    if (patch.status !== undefined && patch.status !== oldStatus)
      await this.logActivity("app", "task", rel, "set_status", { from: oldStatus, to: patch.status });
    if (patch.star !== undefined && patch.star !== oldStar)
      await this.logActivity("app", "task", rel, "set_star", { to: patch.star });
    if (patch.next !== undefined && patch.next !== oldNext)
      await this.logActivity("app", "task", rel, "set_next", { to: doc.meta.next });
    if (patch.title !== undefined && doc.meta.title !== oldTitle)
      await this.logActivity("app", "task", rel, "set_title", { to: doc.meta.title });

    const { entries: _entries, ...meta } = { id: taskId, ...doc.meta, entries: [] as ContextEntry[] };
    void _entries;
    return meta;
  }

  async appendEntry(
    spaceId: string,
    projectId: string,
    taskId: string,
    entry: { text: string },
  ): Promise<Task> {
    const text = entry.text.trim();
    if (!text) throw new Error("条目内容不能为空");
    const rel = core.paths.taskFile(spaceId, projectId, taskId);
    const doc = core.parseTaskDoc(await this.readForSave(rel));
    const entryData: ContextEntry = { date: today(), author: "me", text };
    doc.entries.push(entryData);
    doc.meta.updated = today();
    await this.write(rel, core.serializeTaskDoc(doc.meta, doc.unknownFrontmatter, doc));
    await this.logActivity("app", "task", rel, "append_entry", { date: entryData.date });
    return { id: taskId, ...doc.meta, entries: doc.entries };
  }

  async updateEntry(
    spaceId: string,
    projectId: string,
    taskId: string,
    index: number,
    text: string,
  ): Promise<Task> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("条目内容不能为空");
    const rel = core.paths.taskFile(spaceId, projectId, taskId);
    const doc = core.parseTaskDoc(await this.readForSave(rel));
    const entry = doc.entries[index];
    if (!entry) throw new Error("条目不存在");
    if (entry.author !== "me") throw new Error("仅能编辑自己写的条目");
    entry.text = trimmed;
    doc.meta.updated = today();
    await this.write(rel, core.serializeTaskDoc(doc.meta, doc.unknownFrontmatter, doc));
    await this.logActivity("app", "task", rel, "update_entry", { index });
    return { id: taskId, ...doc.meta, entries: doc.entries };
  }

  async updateProjectDescription(
    spaceId: string,
    projectId: string,
    description: string,
  ): Promise<void> {
    const rel = core.paths.projectFile(spaceId, projectId);
    const named = await this.readNamedForSave(rel);
    await this.write(rel, core.serializeNamedDoc(named.title ?? projectId, named.unknown, description, named.archived));
    await this.logActivity("app", "project", rel, "update_description");
  }

  async setProjectArchived(spaceId: string, projectId: string, archived: boolean): Promise<void> {
    const rel = core.paths.projectFile(spaceId, projectId);
    const named = await this.readNamedSafe(rel);
    await this.write(
      rel,
      core.serializeNamedDoc(named.title ?? projectId, named.unknown, named.body, archived),
    );
    await this.logActivity("app", "project", rel, "set_archived", { to: archived });
  }

  // —— 周文档（M3：确定性骨架，见 storage/weekly.ts） ——

  async listWeekly(): Promise<WeeklyDoc[]> {
    const entries = await this.adapter.readDir(this.abs(core.paths.weeklyDir()));
    const ids = entries
      .filter((e) => !e.isDirectory && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a)); // 新的在前
    const docs: WeeklyDoc[] = [];
    for (const id of ids) {
      try {
        docs.push({ id, content: await this.read(core.paths.weeklyFile(id)) });
      } catch {
        // skip
      }
    }
    return docs;
  }

  async getWeekly(id: string): Promise<string> {
    return this.read(core.paths.weeklyFile(id));
  }

  async generateWeekly(dateIso?: string): Promise<WeeklyDoc> {
    const date = dateIso ?? today();
    const weekId = core.weeklyFileId(date);
    const { start, end } = core.weekRange(date);
    const events = await this.readWeekEvents(start, end);
    const spaces = await this.listSpaces();
    const inboxCount = (await this.listInbox()).length;
    const content = buildWeeklySkeleton({ weekId, start, end, spaces, events, inboxCount });
    const id = `${weekId}.md`;
    await this.write(core.paths.weeklyFile(id), content);
    await this.logActivity("app", "weekly", core.paths.weeklyFile(id), "generate_weekly", { weekId });
    return { id, content };
  }

  async saveWeekly(id: string, content: string): Promise<void> {
    if (!/^\d{4}-W\d{2}\.md$/.test(id)) throw new Error("非法的周文档 ID");
    const rel = core.paths.weeklyFile(id);
    if (await this.exists(rel)) await this.readForSave(rel); // 外部修改 → 冲突
    await this.write(rel, content);
    await this.logActivity("app", "weekly", rel, "save_weekly");
  }

  /** 读取活动日志中落在 [start, end] 的记录（宽松：坏行跳过） */
  private async readWeekEvents(start: string, end: string): Promise<WeekEvent[]> {
    let raw = "";
    try {
      raw = await this.read(core.paths.activityLog());
    } catch {
      return [];
    }
    const events: WeekEvent[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const rec = JSON.parse(t) as { ts: string; actor: string; event: string; entity: string; id: string; detail?: unknown };
        const date = (rec.ts ?? "").slice(0, 10);
        if (date >= start && date <= end) {
          events.push({ date, actor: rec.actor, event: rec.event, entity: rec.entity, id: rec.id, detail: rec.detail });
        }
      } catch {
        // 坏行跳过
      }
    }
    return events;
  }

  async deleteTask(spaceId: string, projectId: string, taskId: string): Promise<void> {
    const rel = core.paths.taskFile(spaceId, projectId, taskId);
    await this.remove(rel);
    await this.logActivity("app", "task", rel, "delete_task");
  }

  // —— 收件箱（M2③：快速捕获；文件 = inbox/YYYY-MM-DD-HHMMSS.md，正文即内容） ——

  async listInbox(): Promise<InboxItem[]> {
    const entries = await this.adapter.readDir(this.abs(core.paths.inboxDir()));
    const items: InboxItem[] = [];
    for (const e of entries.filter((e) => !e.isDirectory && e.name.endsWith(".md"))) {
      try {
        const text = (await this.read(core.paths.inboxItem(e.name))).trim();
        const date = /^(\d{4}-\d{2}-\d{2})/.exec(e.name)?.[1] ?? "";
        items.push({ id: e.name, created: date, text });
      } catch {
        // skip broken item
      }
    }
    items.sort((a, b) => b.id.localeCompare(a.id)); // 新的在前
    return items;
  }

  async captureInbox(text: string): Promise<InboxItem> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("捕获内容不能为空");
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const existing = await this.adapter.readDir(this.abs(core.paths.inboxDir()));
    const id = core.uniqueId(`${today()}-${stamp}.md`, existing.map((e) => e.name));
    await this.write(core.paths.inboxItem(id), `${trimmed}\n`);
    await this.logActivity("app", "inbox", core.paths.inboxItem(id), "inbox_capture", { chars: trimmed.length });
    return { id, created: today(), text: trimmed };
  }

  async promoteInbox(id: string, spaceId: string, projectId: string): Promise<Task> {
    const text = (await this.read(core.paths.inboxItem(id))).trim();
    const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
    const title = firstLine.replace(/^#{1,6}\s*|^[-*]\s*|^\d+\.\s*/, "").trim().slice(0, 60) || "未命名任务";
    const task = await this.createTask(spaceId, projectId, title);
    const full = await this.appendEntry(spaceId, projectId, task.id, { text });
    await this.remove(core.paths.inboxItem(id));
    await this.logActivity("app", "inbox", core.paths.inboxItem(id), "inbox_promote", { task: task.id });
    return full;
  }

  async deleteInboxItem(id: string): Promise<void> {
    await this.remove(core.paths.inboxItem(id));
    await this.logActivity("app", "inbox", core.paths.inboxItem(id), "inbox_delete");
  }
}

/** 校验任务 ID 形如 YYYY-MM-DD-slug.md（测试与导入用） */
export function isValidTaskId(id: string): boolean {
  const parsed = core.parseTaskId(id);
  return parsed !== null && TASK_DATE_RE.test(parsed.date);
}
