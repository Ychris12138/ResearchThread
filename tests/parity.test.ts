// tests/parity.test.ts — 双实现一致性：MockDataAccess 与 StorageDataAccess
// 对同一操作序列应产生等价的领域状态（UI.md 契约在两层实现上行为一致）。

import { describe, expect, it } from "vitest";
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockDataAccess } from "../src/dataAccess";
import { StorageDataAccess } from "../src/storage";
import { atomicWriteText } from "../src/storage/atomicWrite";
import type { FsAdapter } from "../src/storage/fsAdapter";

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
  async readDir(path: string): Promise<{ name: string; isDirectory: boolean }[]> {
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
  async watch(): Promise<() => void> {
    return () => undefined;
  }
}

/** 同一操作序列分别跑在两个实现上，返回各自的最终领域状态 */
async function runScenario(
  da: import("../src/types").AppDataAccess,
): Promise<{
  spaces: { id: string; name: string; projects: { id: string; name: string; archived?: boolean; tasks: { id: string; title: string; status: string; star: boolean; next: string; entryCount: number; firstEntryText: string }[] }[] }[];
  inboxCount: number;
  weeklyIds: string[];
}> {
  const space = await da.createSpace("科研");
  const project = await da.createProject(space.id, "DFT 论文投稿");
  const task = await da.createTask(space.id, project.id, "回复审稿人", "补充计算");
  await da.updateTaskMeta(space.id, project.id, task.id, { status: "doing", star: true });
  await da.appendEntry(space.id, project.id, task.id, { text: "第一条" });
  const captured = await da.captureInbox("查基准数据");
  const promoted = await da.promoteInbox(captured.id, space.id, project.id);
  const weekly = await da.generateWeekly();
  await da.setProjectArchived(space.id, project.id, false);

  const spaces = await da.listSpaces();
  return {
    spaces: spaces.map((s) => ({
      id: s.id,
      name: s.name,
      projects: s.projects.map((p) => ({
        id: p.id,
        name: p.name,
        archived: p.archived,
        tasks: p.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          star: t.star,
          next: t.next,
          entryCount: t.entries.length,
          firstEntryText: t.entries[0]?.text ?? "",
        })),
      })),
    })),
    inboxCount: (await da.listInbox()).length,
    weeklyIds: (await da.listWeekly()).map((w) => w.id),
  };
}

describe("双实现一致性（Mock vs Storage）", () => {
  it("同一操作序列 → 等价的领域状态", async () => {
    const dir = join(tmpdir(), `rt-parity-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const storage = new StorageDataAccess(new NodeFsAdapter(), dir.replace(/\\/g, "/"));
    await storage.init();

    const mock = new MockDataAccess([]);
    const a = await runScenario(mock);
    const b = await runScenario(storage);

    // 忽略 id 命名差异（mock 的 slug 策略与 storage 的 unicode slug 不同），比对结构化状态
    const strip = (r: Awaited<ReturnType<typeof runScenario>>) =>
      JSON.stringify(
        {
          projectCount: r.spaces[0].projects.length,
          projectNames: r.spaces[0].projects.map((p) => p.name).sort(),
          taskRows: r.spaces[0].projects
            .flatMap((p) => p.tasks)
            .map((t) => ({ title: t.title, status: t.status, star: t.star, next: t.next, entryCount: t.entryCount }))
            .sort((x, y) => x.title.localeCompare(y.title)),
          inboxCount: r.inboxCount,
          weeklyCount: r.weeklyIds.length,
          weeklyHasHeader: true,
        },
        null,
        0,
      );

    expect(strip(a)).toBe(strip(b));
    // 两侧的关键语义一致
    const tasksA = a.spaces[0].projects.flatMap((p) => p.tasks);
    const tasksB = b.spaces[0].projects.flatMap((p) => p.tasks);
    expect(tasksA.map((t) => [t.status, t.star, t.next, t.entryCount]).sort())
      .toEqual(tasksB.map((t) => [t.status, t.star, t.next, t.entryCount]).sort());
    expect(a.spaces[0].projects[0].archived).toBe(b.spaces[0].projects[0].archived);

    await fsp.rm(dir, { recursive: true, force: true });
  });
});
