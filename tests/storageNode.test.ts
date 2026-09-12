// tests/storageNode.test.ts — StorageDataAccess 全生命周期集成测试（node:fs 适配器）。
// 这正是 2b 阶段 MCP server 将复用的适配器形态：同一 storage 核心 + node:fs。

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fsp, existsSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DirEntryLite, FsAdapter } from "../src/storage/fsAdapter";
import { atomicWriteText } from "../src/storage/atomicWrite";
import { StorageDataAccess, ExternalConflictError } from "../src/storage";

class NodeFsAdapter implements FsAdapter {
  async readTextFile(path: string): Promise<string> {
    return fsp.readFile(path, "utf8");
  }
  async appendTextFile(path: string, contents: string): Promise<void> {
    await fsp.appendFile(path, contents, "utf8");
  }
  async writeTextFile(path: string, contents: string): Promise<void> {
    await atomicWriteText(this, path, contents);
  }
  async writeRaw(path: string, contents: string): Promise<void> {
    await fsp.writeFile(path, contents, "utf8");
  }
  async exists(path: string): Promise<boolean> {
    try {
      await fsp.access(path);
      return true;
    } catch {
      return false;
    }
  }
  async mkdir(path: string): Promise<void> {
    await fsp.mkdir(path, { recursive: true });
  }
  async readDir(path: string): Promise<DirEntryLite[]> {
    try {
      const entries = await fsp.readdir(path, { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    } catch {
      return [];
    }
  }
  async remove(path: string): Promise<void> {
    await fsp.rm(path, { force: true });
  }
  async rename(from: string, to: string): Promise<void> {
    await fsp.rename(from, to);
  }
  async watch(root: string, cb: (paths: string[]) => void): Promise<() => void> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: string[] = [];
    const watcher = watch(root, { recursive: true }, (event, filename) => {
      if (filename) pending.push(join(root, filename.toString()));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const paths = pending;
        pending = [];
        cb(paths);
      }, 50);
    });
    return () => watcher.close();
  }
}

let dataDir: string;
let store: StorageDataAccess;

beforeAll(async () => {
  dataDir = join(tmpdir(), `rt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  store = new StorageDataAccess(new NodeFsAdapter(), dataDir.replace(/\\/g, "/"));
  await store.init(); // git 不在能力范围内由 ensureGitRepo 静默跳过失败
});

afterAll(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe("StorageDataAccess 生命周期", () => {
  it("init 生成数据目录骨架与 agent 工作区文件", async () => {
    expect(existsSync(join(dataDir, "spaces"))).toBe(true);
    expect(existsSync(join(dataDir, "inbox"))).toBe(true);
    expect(existsSync(join(dataDir, "weekly"))).toBe(true);
    expect(existsSync(join(dataDir, "daily"))).toBe(true);
    expect(existsSync(join(dataDir, ".activity"))).toBe(true);
    expect(await fsp.readFile(join(dataDir, "AGENTS.md"), "utf8")).toContain("agent 行为规范");
    expect(await fsp.readFile(join(dataDir, "settings.yaml"), "utf8")).toContain("agents:");
    expect(JSON.parse(await fsp.readFile(join(dataDir, ".mcp.json"), "utf8"))).toEqual({ mcpServers: {} });
    expect(await fsp.readFile(join(dataDir, ".gitignore"), "utf8")).toContain(".mcp.json");
  });

  it("空间 → 项目 → 任务创建并落盘为规范 Markdown", async () => {
    const space = await store.createSpace("科研");
    expect(space.id).toBe("科研");
    const project = await store.createProject(space.id, "DFT 论文投稿");
    const task = await store.createTask(space.id, project.id, "回复审稿人", "补充静电结合能数据");

    const raw = await fsp.readFile(join(dataDir, "spaces", "科研", "projects", project.id, "tasks", task.id), "utf8");
    expect(raw).toContain("title: 回复审稿人");
    expect(raw).toContain("status: todo");
    expect(raw).toContain("next: 补充静电结合能数据");
    expect(raw).toContain("## 任务上下文");

    const back = await store.getTask(space.id, project.id, task.id);
    expect(back.title).toBe("回复审稿人");
    expect(back.next).toBe("补充静电结合能数据");
    expect(back.entries).toHaveLength(0);
  });

  it("更新元数据走字段级合并：未知字段保留、状态流转入账", async () => {
    const [space] = await store.listSpaces();
    const project = space.projects[0];
    const task = project.tasks[0];
    const taskPath = join(dataDir, "spaces", space.id, "projects", project.id, "tasks", task.id);

    // 模拟外部工具（Obsidian / 用户）加了一个未知字段和上下文条目
    await fsp.writeFile(
      taskPath,
      (await fsp.readFile(taskPath, "utf8"))
        .replace("updated: ", "due: 2026-10-01\nupdated: ")
        .replace("## 任务上下文", "## 任务上下文\n\n### 2026-09-11 · 我\n外部补充的背景。"),
      "utf8",
    );
    // watcher → UI 重载建立新基准（不重载直接保存会被冲突守卫阻止，见并发策略测试）
    await store.getTask(space.id, project.id, task.id);

    const updated = await store.updateTaskMeta(space.id, project.id, task.id, { status: "doing", star: true });
    expect(updated.status).toBe("doing");
    expect(updated.star).toBe(true);

    const raw = await fsp.readFile(taskPath, "utf8");
    expect(raw).toContain("due: 2026-10-01"); // 未知字段存活
    expect(raw).toContain("### 2026-09-11 · 我"); // 外部条目存活
    expect(raw).toMatch(/^status: doing$/m);
    expect(raw).toMatch(/^star: true$/m);
  });

  it("上下文条目追加 / 编辑保护（agent 条目只读）", async () => {
    const [space] = await store.listSpaces();
    const project = space.projects[0];
    const task = project.tasks[0];

    const t1 = await store.appendEntry(space.id, project.id, task.id, { text: "我的第一条记录" });
    expect(t1.entries.at(-1)?.author).toBe("me");

    // 直接写一条 agent 条目进文件，验证编辑保护
    const taskPath = join(dataDir, "spaces", space.id, "projects", project.id, "tasks", task.id);
    await fsp.writeFile(
      taskPath,
      (await fsp.readFile(taskPath, "utf8")) + "\n### 2026-09-11 · agent\nagent 的归纳。\n",
      "utf8",
    );
    const withAgent = await store.getTask(space.id, project.id, task.id);
    const agentIdx = withAgent.entries.findIndex((e) => e.author === "agent");
    expect(agentIdx).toBeGreaterThanOrEqual(0);
    await expect(
      store.updateEntry(space.id, project.id, task.id, agentIdx, "篡改"),
    ).rejects.toThrow("仅能编辑自己写的条目");

    const mine = await store.updateEntry(space.id, project.id, task.id, 0, "改后的记录");
    expect(mine.entries[0].text).toBe("改后的记录");
  });

  it("收件箱：捕获 → 转为任务 → inbox 文件消失", async () => {
    const item = await store.captureInbox("查一下 Materials Cloud 的 NiO 基准数据");
    let items = await store.listInbox();
    expect(items.some((i) => i.id === item.id)).toBe(true);

    const [space] = await store.listSpaces();
    const project = space.projects[0];
    const task = await store.promoteInbox(item.id, space.id, project.id);
    expect(task.title).toContain("Materials Cloud");
    expect(task.entries.some((e) => e.text.includes("Materials Cloud"))).toBe(true);
    items = await store.listInbox();
    expect(items.some((i) => i.id === item.id)).toBe(false);
  });

  it("删除任务 → 软删除进 .trash（可恢复）；项目描述可更新", async () => {
    const [space] = await store.listSpaces();
    const project = space.projects[0];
    const task = await store.createTask(space.id, project.id, "待删除的任务");
    const taskRel = `spaces/${space.id}/projects/${project.id}/tasks/${task.id}`;
    const taskPath = join(dataDir, "spaces", space.id, "projects", project.id, "tasks", task.id);
    await fsp.appendFile(taskPath, "\n### 2026-09-11 · 我\n重要：别丢这段上下文。\n", "utf8");

    await store.deleteTask(space.id, project.id, task.id);
    const after = await store.listSpaces();
    expect(
      after.flatMap((s) => s.projects.flatMap((p) => p.tasks.map((t) => t.id))),
    ).not.toContain(task.id);

    // 软删除：文件进了 .trash/ 而非物理消失（当天未进 git 快照的新文件也不丢）
    const trashDir = join(dataDir, ".trash");
    const trashed = (await fsp.readdir(trashDir)).filter((f) => f.endsWith(`_${task.id}`));
    expect(trashed).toHaveLength(1);
    const trashedContent = await fsp.readFile(join(trashDir, trashed[0]), "utf8");
    expect(trashedContent).toContain("别丢这段上下文");

    // 恢复演练：从 .trash 移回原位 → 任务可读、内容完整
    await fsp.rename(join(trashDir, trashed[0]), taskPath);
    const restored = await store.getTask(space.id, project.id, task.id);
    expect(restored.entries.some((e) => e.text.includes("别丢这段上下文"))).toBe(true);
    void taskRel;

    await store.updateProjectDescription(space.id, project.id, "# 目标\nPRB 投稿。");
    const afterDesc = await store.listSpaces();
    expect(afterDesc[0].projects[0].description).toContain("PRB 投稿");
    // frontmatter title 仍在
    const raw = await fsp.readFile(
      join(dataDir, "spaces", space.id, "projects", project.id, "project.md"),
      "utf8",
    );
    expect(raw).toContain("title:");
  });

  it("活动日志：应用操作全部留痕", async () => {
    const log = await fsp.readFile(join(dataDir, ".activity", "log.jsonl"), "utf8");
    const events = log.trim().split("\n").map((l) => JSON.parse(l) as { actor: string; event: string });
    const kinds = events.map((e) => `${e.actor}:${e.event}`);
    expect(kinds).toContain("app:create_space");
    expect(kinds).toContain("app:create_project");
    expect(kinds).toContain("app:create_task");
    expect(kinds).toContain("app:set_status");
    expect(kinds).toContain("app:append_entry");
    expect(kinds).toContain("app:inbox_capture");
    expect(kinds).toContain("app:inbox_promote");
    expect(kinds).toContain("app:delete_task");
  });

  it("watcher：能观察外部修改（递归）", async () => {
    const events: string[][] = [];
    const stop = await store.watch((paths) => events.push(paths));
    const [space] = await store.listSpaces();
    const project = space.projects[0];
    const task = await store.createTask(space.id, project.id, "watcher 探针");
    // 直接用 node:fs 改文件 = 外部编辑
    const taskPath = join(dataDir, "spaces", space.id, "projects", project.id, "tasks", task.id);
    await fsp.writeFile(taskPath, (await fsp.readFile(taskPath, "utf8")).replace("status: todo", "status: hold"), "utf8");
    const deadline = Date.now() + 5000;
    while (events.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    stop();
    expect(events.length).toBeGreaterThan(0);
    expect(events.flat().some((p) => p.includes(task.id))).toBe(true);
  });

  // —— 并发策略（发布门槛）：保存前外部修改检查 —— 

  it("外部修改后保存被阻止；acknowledge 后可覆盖（字段级合并保留外部 next）", async () => {
    const [space] = await store.listSpaces();
    const project = space.projects[0];
    const task = await store.createTask(space.id, project.id, "并发任务", "旧 next");
    const rel = `spaces/${space.id}/projects/${project.id}/tasks/${task.id}`;
    const taskPath = join(dataDir, "spaces", space.id, "projects", project.id, "tasks", task.id);

    await store.getTask(space.id, project.id, task.id); // UI 读过 → 建立基准
    // 外部（Obsidian）改了 next
    await fsp.writeFile(
      taskPath,
      (await fsp.readFile(taskPath, "utf8")).replace("旧 next", "外部 next"),
      "utf8",
    );
    await expect(
      store.updateTaskMeta(space.id, project.id, task.id, { title: "并发任务改" }),
    ).rejects.toBeInstanceOf(ExternalConflictError);

    // 用户选择覆盖：acknowledge 基准 → 重试（只 patch title，外部 next 保留）
    await store.acknowledgeExternalChange(rel);
    const updated = await store.updateTaskMeta(space.id, project.id, task.id, { title: "并发任务改" });
    expect(updated.title).toBe("并发任务改");
    expect(updated.next).toBe("外部 next");
  });

  it("周文档：外部修改后 saveWeekly 被阻止，acknowledge 后可保存", async () => {
    const doc = await store.generateWeekly("2026-09-09");
    await store.getWeekly(doc.id); // UI 读过 → 基准
    const weeklyPath = join(dataDir, "weekly", doc.id);
    await fsp.appendFile(weeklyPath, "\n手工补充。\n", "utf8"); // 外部编辑
    await expect(store.saveWeekly(doc.id, "整篇覆盖")).rejects.toBeInstanceOf(ExternalConflictError);
    await store.acknowledgeExternalChange(`weekly/${doc.id}`);
    await store.saveWeekly(doc.id, "整篇覆盖");
    expect(await fsp.readFile(weeklyPath, "utf8")).toBe("整篇覆盖");
  });
});
