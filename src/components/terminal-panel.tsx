// components/terminal-panel.tsx — 底部终端（M2⑤）。
// xterm.js 显示 + AgentRunner（plugin-shell 管道 stdio）执行。cwd = 数据目录。
// 行编辑（回车提交 / 退格 / ↑↓ 历史 / Ctrl+C 中止）；非交互 TUI 降级可接受（PTY 远期可选）。

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { createTauriRunner, parseCommandLine, type RunnerChild } from "@/lib/agentRunner";
import { currentDataDir, isTauri } from "@/dataAccess";

export function TerminalPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const dataDir = currentDataDir();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !isTauri() || !dataDir) return;

    const term = new Terminal({
      fontSize: 12,
      fontFamily:
        'ui-monospace, "IBM Plex Mono", "Source Code Pro", Menlo, Consolas, monospace',
      theme: {
        background: "#1b1d21",
        foreground: "#d6d9de",
        cursor: "#6ea3d7",
        selectionBackground: "#3b6fd455",
      },
      scrollback: 2000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(host);

    const runner = createTauriRunner();
    let line = "";
    let child: RunnerChild | null = null;
    const history: string[] = [];
    let historyIdx = -1;

    const prompt = () => {
      term.write("\r\n\x1b[38;5;68mRT\x1b[0m \x1b[38;5;245m❯\x1b[0m ");
    };
    const redraw = () => {
      term.write(`\r\x1b[K\x1b[38;5;68mRT\x1b[0m \x1b[38;5;245m❯\x1b[0m ${line}`);
    };

    term.writeln("ResearchThread 终端 —— 工作目录：数据目录（M2）");
    term.writeln("试试：git status    claude -p \"总结当前项目状态\"    codex exec \"...\"");
    term.writeln("管道 stdio（非 TUI）；Ctrl+C 中止当前命令。");
    prompt();

    async function submit() {
      const input = line;
      line = "";
      historyIdx = -1;
      const parsed = parseCommandLine(input);
      if (!parsed) {
        prompt();
        return;
      }
      history.unshift(input);
      if (child) {
        term.writeln("\r\n[有命令在运行，先 Ctrl+C 中止]");
        prompt();
        return;
      }
      term.write("\r\n");
      try {
        child = await runner.spawn({
          program: parsed.program,
          args: parsed.args,
          cwd: dataDir!,
          onData: (d) => term.write(d.replace(/\r?\n/g, "\r\n")),
          onExit: (code) => {
            child = null;
            term.write(`\r\n\x1b[38;5;245m[exit ${code ?? "?"}]\x1b[0m\r\n`);
            prompt();
          },
        });
      } catch (e) {
        child = null;
        term.writeln(`\x1b[38;5;131m无法启动：${String(e)}\x1b[0m`);
        term.writeln("\x1b[38;5;245m（程序需在 src-tauri/capabilities 的 shell 白名单内）\x1b[0m");
        prompt();
      }
    }

    const disp = term.onData((data) => {
      if (data === "\r") {
        void submit();
      } else if (data === "\u007f") {
        if (line.length > 0) {
          line = line.slice(0, -1);
          term.write("\b \b");
        }
      } else if (data === "\u0003") {
        line = "";
        if (child) {
          void child.kill().then(() => {
            child = null;
            term.write("^C\r\n");
            prompt();
          });
        } else {
          term.write("^C");
          prompt();
        }
      } else if (data === "\u001b[A" || data === "\u001b[B") {
        if (history.length === 0) return;
        if (data === "\u001b[A") historyIdx = Math.min(historyIdx + 1, history.length - 1);
        else historyIdx = Math.max(historyIdx - 1, -1);
        line = historyIdx >= 0 ? history[historyIdx] : "";
        redraw();
      } else if (data === "\u001b") {
        // 其余转义序列忽略
      } else {
        line += data;
        term.write(data);
      }
    });

    setReady(true);
    return () => {
      disp.dispose();
      ro.disconnect();
      if (child) void child.kill();
      term.dispose();
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isTauri() || !dataDir) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-small text-text-dim">
        终端在 Tauri 桌面端可用（工作目录 = 数据目录）。
      </div>
    );
  }
  return (
    <div className="h-full min-h-0 p-1.5">
      <div
        ref={hostRef}
        className="scrollbar-thin h-full min-h-0 overflow-hidden rounded-lg px-2 py-1.5"
        style={{ background: "#1b1d21" }}
        aria-label="终端"
      />
      {ready ? null : <span className="sr-only">终端加载中</span>}
    </div>
  );
}
