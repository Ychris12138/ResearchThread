// storage/atomicWrite.ts — 事务式写入与中断恢复。
// 契约（发布门槛）：任何一步失败或进程中断后，原文件或备份文件必有一个可恢复。
//   ① 写 .rt-tmp（失败：原文件未动）
//   ② 原文件改名让位为 .rt-bak（此后到 ③ 之间崩溃：启动恢复把 .rt-bak 还原回原文件）
//   ③ .rt-tmp 就位为新内容；失败：尽力把 .rt-bak 还原回去，还原也失败则保留备份（仍可恢复）
//   ④ 成功后清理 .rt-bak（尽力而为）
// Windows 上 rename 不能覆盖已存在目标，因此必须「让位-就位」两步而非直接替换。

import type { FsAdapter } from "./fsAdapter";

const TMP_EXT = ".rt-tmp";
const BAK_EXT = ".rt-bak";
const BAK_RE = /(\.\d+)?\.rt-bak$/;

/** 事务式原子写。io 由适配器提供（TauriFsAdapter / node:fs 测试适配器共用同一实现）。 */
export async function atomicWriteText(
  io: Pick<FsAdapter, "writeRaw" | "exists" | "remove" | "rename">,
  path: string,
  contents: string,
): Promise<void> {
  const tmp = `${path}${TMP_EXT}`;
  await io.writeRaw(tmp, contents); // ①
  if (!(await io.exists(path))) {
    // 新文件：直接就位，失败则清掉残片并抛错（无原文件可保）
    try {
      await io.rename(tmp, path);
    } catch (e) {
      await io.remove(tmp).catch(() => undefined);
      throw e;
    }
    return;
  }
  const bak = await reserveBak(io, path);
  try {
    await io.rename(path, bak); // ② 原文件让位为备份（失败：原文件未动，清残片抛错）
  } catch (e) {
    await io.remove(tmp).catch(() => undefined);
    throw e;
  }
  try {
    await io.rename(tmp, path); // ③ 新内容就位
  } catch (e) {
    try {
      await io.rename(bak, path); // 还原原文件
    } catch {
      // 还原失败：保留备份（启动恢复 / 人工可救），不吞原始错误
    }
    throw new Error(
      `写入失败，原文件已保留为备份（${bak}）：${e instanceof Error ? e.message : String(e)}`,
    );
  }
  await io.remove(bak).catch(() => undefined); // ④
}

/** 挑一个可用的备份名；默认同名 .rt-bak，被占用（删不掉）则加序号。 */
async function reserveBak(
  io: Pick<FsAdapter, "exists" | "remove">,
  path: string,
): Promise<string> {
  const primary = `${path}${BAK_EXT}`;
  if (await io.exists(primary)) {
    try {
      await io.remove(primary);
    } catch {
      for (let i = 2; i < 100; i++) {
        const cand = `${path}.${i}${BAK_EXT}`;
        if (!(await io.exists(cand))) return cand;
      }
    }
  }
  return primary;
}

/**
 * 启动恢复：扫描数据目录，处理上次中断留下的痕迹。
 *   .rt-bak 存在且原文件缺失 → 还原（返回还原后的路径，供活动账记录）；
 *   .rt-bak 存在但原文件在 → 过期备份，删除；.rt-tmp → 残片，删除。
 */
export async function recoverInterruptedWrites(
  io: Pick<FsAdapter, "exists" | "remove" | "rename" | "readDir">,
  root: string,
): Promise<string[]> {
  const restored: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await io.readDir(dir).catch(() => []);
    for (const e of entries) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory) {
        await walk(full);
        continue;
      }
      if (e.name.endsWith(TMP_EXT)) {
        await io.remove(full).catch(() => undefined);
        continue;
      }
      const m = BAK_RE.exec(e.name);
      if (m) {
        const base = full.slice(0, -m[0].length);
        if (await io.exists(base)) {
          await io.remove(full).catch(() => undefined);
        } else {
          try {
            await io.rename(full, base);
            restored.push(base);
          } catch {
            // 还原失败（文件被占用等）：留待下次启动
          }
        }
      }
    }
  };
  await walk(root);
  return restored;
}
