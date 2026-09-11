// lib/agentRunner.ts — AgentRunner 接口抽象（PLAN.md：终端与未来对话面板的共同后端）。
// M2 后端 = plugin-shell 管道 stdio（一次性/流式命令，非交互 TUI 降级可接受，PTY 远期可选）。

import { Command } from "@tauri-apps/plugin-shell";

export interface RunnerChild {
  write(data: string): Promise<void>;
  kill(): Promise<void>;
}

export interface SpawnOptions {
  program: string;
  args: string[];
  cwd: string;
  onData(data: string): void;
  onExit(code: number | null): void;
}

export interface AgentRunner {
  spawn(opts: SpawnOptions): Promise<RunnerChild>;
}

export function createTauriRunner(): AgentRunner {
  return {
    async spawn({ program, args, cwd, onData, onExit }: SpawnOptions): Promise<RunnerChild> {
      const cmd = Command.create(program, args, { cwd, encoding: "utf-8" });
      cmd.stdout?.on("data", onData);
      cmd.stderr?.on("data", onData);
      cmd.on("error", (e: unknown) => {
        onData(`\r\n[spawn error] ${String(e)}\r\n`);
        onExit(null);
      });
      const closed = new Promise<number | null>((resolve) => {
        cmd.on("close", (payload: { code: number | null }) => resolve(payload.code));
      });
      const child = await cmd.spawn();
      void closed.then(onExit);
      return {
        write: (data: string) => child.write(data),
        kill: () => child.kill(),
      };
    },
  };
}

/** 极简命令行切词：支持双/单引号。返回 null 表示空行。 */
export function parseCommandLine(
  line: string,
): { program: string; args: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    if (m[1] !== undefined) tokens.push(m[1].replace(/\\(.)/g, "$1"));
    else if (m[2] !== undefined) tokens.push(m[2]);
    else tokens.push(m[3]);
  }
  if (tokens.length === 0) return null;
  return { program: tokens[0], args: tokens.slice(1) };
}
