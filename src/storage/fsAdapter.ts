// storage/fsAdapter.ts — IO 接口 + tauri-plugin-fs 实现。
// 2b 阶段：同一接口配 node:fs 实现即可跑 MCP server。

import { atomicWriteText } from "./atomicWrite";

export interface DirEntryLite {
  name: string;
  isDirectory: boolean;
}

export interface FsAdapter {
  readTextFile(path: string): Promise<string>;
  appendTextFile(path: string, contents: string): Promise<void>;
  /** 事务式原子写（见 atomicWrite.ts）：失败/中断后原文件或备份必有一个可恢复 */
  writeTextFile(path: string, contents: string): Promise<void>;
  /** 底层单次写（非原子；atomicWriteText 的原语） */
  writeRaw(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** 递归创建目录 */
  mkdir(path: string): Promise<void>;
  readDir(path: string): Promise<DirEntryLite[]>;
  remove(path: string): Promise<void>;
  /** 改名（Windows 上不能覆盖已存在目标） */
  rename(from: string, to: string): Promise<void>;
  /** 递归监听目录，回调带触发事件的绝对路径集合（调用方去抖） */
  watch(root: string, cb: (paths: string[]) => void): Promise<() => void>;
}

export class TauriFsAdapter implements FsAdapter {
  async readTextFile(path: string): Promise<string> {
    return await fsRead(path);
  }

  async appendTextFile(path: string, contents: string): Promise<void> {
    await fsWrite(path, contents, { append: true });
  }

  async writeTextFile(path: string, contents: string): Promise<void> {
    await atomicWriteText(this, path, contents);
  }

  async writeRaw(path: string, contents: string): Promise<void> {
    await fsWrite(path, contents);
  }

  async exists(path: string): Promise<boolean> {
    return await fsExists(path);
  }

  async mkdir(path: string): Promise<void> {
    await fsMkdir(path, { recursive: true });
  }

  async readDir(path: string): Promise<DirEntryLite[]> {
    const entries = await fsReadDir(path).catch(() => []);
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
  }

  async remove(path: string): Promise<void> {
    await fsRemove(path);
  }

  async rename(from: string, to: string): Promise<void> {
    await fsRename(from, to);
  }

  async watch(
    root: string,
    cb: (paths: string[]) => void,
  ): Promise<() => void> {
    const unwatch = await fsWatch(
      root,
      (event) => {
        const ps = event.paths ?? [];
        if (ps.length > 0) cb(ps);
      },
      { recursive: true },
    );
    return () => unwatch();
  }
}

// —— plugin-fs 薄封装（集中 import，便于 mock/测试替换） ——

import { readTextFile, writeTextFile, mkdir, exists, readDir, remove, rename, watch as fsWatchRaw } from "@tauri-apps/plugin-fs";

const fsRead = (p: string) => readTextFile(p);
const fsWrite = (
  p: string,
  c: string,
  opts?: { append: boolean },
) => writeTextFile(p, c, opts);
const fsMkdir = (p: string, opts: { recursive: boolean }) => mkdir(p, opts);
const fsExists = (p: string) => exists(p);
const fsReadDir = (p: string) => readDir(p);
const fsRemove = (p: string) => remove(p);
const fsRename = (a: string, b: string) => rename(a, b);
const fsWatch = fsWatchRaw;
