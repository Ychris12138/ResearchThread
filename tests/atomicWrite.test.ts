// tests/atomicWrite.test.ts — 事务式写入契约（发布门槛第 1 条）：
// 任何一步失败或进程中断后，原文件或备份文件必有一个可恢复。
// 用故障注入的 node:fs 最小 IO 验证：rename 失败、持续故障、崩溃残留、过期备份。

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  atomicWriteText,
  recoverInterruptedWrites,
} from "../src/storage/atomicWrite";
import type { DirEntryLite } from "../src/storage/fsAdapter";

/** 最小 IO + rename 故障注入（模拟权限拒绝 / 目标被占用） */
class FaultyIo {
  /** 命中时抛错的目标路径；fired 一次性触发 */
  failRenameTo: { test: (to: string) => boolean; once: boolean; fired: boolean } | null = null;

  constructor(readonly root: string) {}

  async writeRaw(p: string, c: string): Promise<void> {
    await fsp.writeFile(p, c, "utf8");
  }
  async exists(p: string): Promise<boolean> {
    try {
      await fsp.access(p);
      return true;
    } catch {
      return false;
    }
  }
  async remove(p: string): Promise<void> {
    await fsp.rm(p, { force: true });
  }
  async readDir(p: string): Promise<DirEntryLite[]> {
    const entries = await fsp.readdir(p, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
  }
  async rename(from: string, to: string): Promise<void> {
    const f = this.failRenameTo;
    if (f && f.test(to) && (!f.once || !f.fired)) {
      f.fired = true;
      throw new Error("EINJECTED: rename refused");
    }
    await fsp.rename(from, to);
  }
}

let root: string;
let io: FaultyIo;

beforeAll(async () => {
  root = join(tmpdir(), `rt-atomic-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fsp.mkdir(root, { recursive: true });
  io = new FaultyIo(root.replace(/\\/g, "/"));
});

afterAll(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

describe("atomicWriteText", () => {
  it("新文件：写入成功且无 tmp/bak 残留", async () => {
    const p = `${root}/new.md`;
    await atomicWriteText(io, p, "hello");
    expect(await fsp.readFile(p, "utf8")).toBe("hello");
    expect(await io.exists(`${p}.rt-tmp`)).toBe(false);
    expect(await io.exists(`${p}.rt-bak`)).toBe(false);
  });

  it("覆盖已有文件：内容更新，旧备份清理", async () => {
    const p = `${root}/over.md`;
    await fsp.writeFile(p, "v1", "utf8");
    // 预置一个过期备份（上次中断留下的），本次写入应能重新占用备份名
    await fsp.writeFile(`${p}.rt-bak`, "stale", "utf8");
    await atomicWriteText(io, p, "v2");
    expect(await fsp.readFile(p, "utf8")).toBe("v2");
    expect(await io.exists(`${p}.rt-bak`)).toBe(false);
    expect(await io.exists(`${p}.rt-tmp`)).toBe(false);
  });

  it("rename(新内容就位) 失败：自动还原原文件，内容不变", async () => {
    const p = `${root}/failonce.md`;
    await fsp.writeFile(p, "original", "utf8");
    io.failRenameTo = { test: (to) => to === p, once: true, fired: false };
    await expect(atomicWriteText(io, p, "broken")).rejects.toThrow("写入失败");
    io.failRenameTo = null;
    expect(await fsp.readFile(p, "utf8")).toBe("original"); // 原文件可恢复
  });

  it("rename 持续失败：原文件缺失但备份保留（启动恢复可救）", async () => {
    const p = `${root}/failalways.md`;
    await fsp.writeFile(p, "precious", "utf8");
    io.failRenameTo = { test: (to) => to === p, once: false, fired: false };
    await expect(atomicWriteText(io, p, "broken")).rejects.toThrow("写入失败");
    io.failRenameTo = null;
    expect(await io.exists(p)).toBe(false); // 目标缺失……
    expect(await fsp.readFile(`${p}.rt-bak`, "utf8")).toBe("precious"); // ……但备份在
  });
});

describe("recoverInterruptedWrites", () => {
  it("bak 存在且原文件缺失 → 还原", async () => {
    const p = `${root}/crash.md`;
    await fsp.writeFile(`${p}.rt-bak`, "before-crash", "utf8");
    const restored = await recoverInterruptedWrites(io, root);
    expect(restored.some((r) => r === p)).toBe(true);
    expect(await fsp.readFile(p, "utf8")).toBe("before-crash");
  });

  it("带序号的备份变体也能还原", async () => {
    const p = `${root}/crash2.md`;
    await fsp.writeFile(`${p}.3.rt-bak`, "variant", "utf8");
    await recoverInterruptedWrites(io, root);
    expect(await fsp.readFile(p, "utf8")).toBe("variant");
  });

  it("bak 存在但原文件也在 → 过期备份删除", async () => {
    const p = `${root}/stale.md`;
    await fsp.writeFile(p, "current", "utf8");
    await fsp.writeFile(`${p}.rt-bak`, "stale", "utf8");
    await recoverInterruptedWrites(io, root);
    expect(await fsp.readFile(p, "utf8")).toBe("current");
    expect(await io.exists(`${p}.rt-bak`)).toBe(false);
  });

  it("stray .rt-tmp 残片清理", async () => {
    const p = `${root}/stray.md`;
    await fsp.writeFile(p, "keep", "utf8");
    await fsp.writeFile(`${p}.rt-tmp`, "garbage", "utf8");
    await recoverInterruptedWrites(io, root);
    expect(await fsp.readFile(p, "utf8")).toBe("keep");
    expect(await io.exists(`${p}.rt-tmp`)).toBe(false);
  });
});
