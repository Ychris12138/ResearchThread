// storage/git.ts — 数据目录 git 兜底（快照）。app 侧模块：经 plugin-shell 调 git。
// 健康检查与每日自动快照见 snapshot.ts；本文件只保留原语。

import { Command } from "@tauri-apps/plugin-shell";

export interface GitResult {
  ok: boolean;
  code: number | null;
  output: string;
}

export async function runGit(
  dataDir: string,
  args: string[],
): Promise<GitResult> {
  const cmd = Command.create("git", args, {
    cwd: dataDir,
    encoding: "utf-8",
  });
  let output = "";
  cmd.stdout?.on("data", (line: string) => {
    output += `${line}\n`;
  });
  cmd.stderr?.on("data", (line: string) => {
    output += `${line}\n`;
  });
  const closed = new Promise<number | null>((resolve) => {
    cmd.on("close", (payload: { code: number | null }) => resolve(payload.code));
  });
  await cmd.spawn();
  const code = await closed;
  return { ok: code === 0, code, output: output.trim() };
}

/** 手动快照：add -A + commit。返回给用户的提示信息。label 用于自定义提交说明。 */
export async function gitSnapshot(dataDir: string, label?: string): Promise<string> {
  const add = await runGit(dataDir, ["add", "-A"]);
  if (!add.ok) throw new Error(`git add 失败：${add.output}`);
  // 无变更时 exit 0（--quiet 下无 diff），有变更时 exit 1
  const diff = await runGit(dataDir, ["diff", "--cached", "--quiet"]);
  if (diff.code === 0) return "没有新的变更";
  const commit = await runGit(dataDir, [
    "commit",
    "-m",
    `snapshot: ${label ?? new Date().toISOString()}`,
  ]);
  if (!commit.ok) throw new Error(`git commit 失败：${commit.output}`);
  return "快照已创建";
}

/** 在资源管理器中打开目录 */
export async function openInFileManager(dir: string): Promise<void> {
  const cmd = Command.create("explorer", [dir]);
  await cmd.spawn();
}
