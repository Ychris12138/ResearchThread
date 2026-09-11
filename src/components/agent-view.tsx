import { useState } from "react";
import { ArrowUp, Plus } from "lucide-react";
import { Btn } from "@/components/ui-bits";
import { cn } from "@/lib/cn";
import { useSettings } from "@/lib/settings";
import { IconAgent } from "@/components/icons";

const THREADS = [
  {
    title: "回复审稿人 · 检索 U 值",
    preview: "建议采用 U_eff = 6.2 eV，并补 Dudarev 说明。",
    when: "3 天前",
    status: "已归档（示例）",
  },
  {
    title: "EIS 拟合电路",
    preview: "高频半圆指认晶界；建议加 CPE。",
    when: "上周",
    status: "等待 M2",
  },
];

export function AgentView({ projectName }: { projectName?: string }) {
  const mode = useSettings((s) => s.agentMode);
  const patch = useSettings((s) => s.patch);
  const writeLog = useSettings((s) => s.agentWriteLog);
  const confirmWrites = useSettings((s) => s.agentConfirmWrites);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border-subtle bg-bg-panel p-3 md:flex">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-micro font-medium tracking-wide text-text-subtle">会话</span>
          <Btn
            className="size-7 p-0"
            aria-label="新会话"
            onClick={() => setNotice("新会话将在 M2 与 AgentRunner 接通。")}
          >
            <Plus className="size-3.5" />
          </Btn>
        </div>
        <div className="flex flex-col gap-1">
          {THREADS.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => {
                setActive(t.title);
                setNotice("线程回放属于 M2。现在只能浏览结构。");
              }}
              className={cn(
                "rounded-lg px-2.5 py-2 text-left",
                active === t.title ? "bg-accent/15 text-text" : "hover:bg-bg-hover",
              )}
            >
              <div className="truncate text-small font-medium">{t.title}</div>
              <div className="mt-0.5 truncate text-micro text-text-subtle">{t.when}</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="fade-rise mx-auto flex min-w-0 flex-1 flex-col px-5 py-5">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-text">
              <span className="grid size-8 place-items-center rounded-lg bg-bg-panel text-accent">
                <IconAgent />
              </span>
              <h1 className="text-title font-semibold tracking-tight">Agent</h1>
            </div>
            <p className="mt-1 text-small text-text-dim">
              {projectName
                ? `当前项目：${projectName}。助手只追加日志，不改你已确认的条目。`
                : "选一个项目后，助手会带着项目上下文工作。"}
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-6 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-bg-panel text-accent shadow-[var(--shadow-border)]">
            <IconAgent className="size-7" strokeWidth={1.5} />
          </div>
          <p className="mt-4 text-title font-medium tracking-tight">研究助手还在工位上待命</p>
          <p className="mt-1 max-w-md text-small text-pretty text-text-dim">
            M2 会上线 AgentRunner。计划模式只给建议；执行模式才允许改工作区，并且默认要你确认。
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-micro text-text-subtle">
            <span className="rounded-full bg-bg-panel px-2 py-0.5">
              {mode === "plan" ? "计划 · 只读建议" : "执行 · 可改任务"}
            </span>
            {writeLog ? <span className="rounded-full bg-bg-panel px-2 py-0.5">写入日志</span> : null}
            {confirmWrites ? (
              <span className="rounded-full bg-bg-panel px-2 py-0.5">改前确认</span>
            ) : null}
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl rounded-2xl bg-bg-elevated p-2 shadow-[var(--shadow-border)]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="描述你卡在哪、希望助手查什么或改哪份计算…"
            className="w-full bg-transparent px-2 py-1.5 text-ui placeholder:text-text-subtle focus-visible:outline-none"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
            <div className="flex rounded-md bg-bg-sunken p-0.5">
              {(["plan", "act"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => patch({ agentMode: m })}
                  className={cn(
                    "h-6 rounded px-2.5 text-micro font-medium",
                    mode === m
                      ? "bg-bg-elevated text-text shadow-[var(--shadow-border)]"
                      : "text-text-dim",
                  )}
                >
                  {m === "plan" ? "计划" : "执行"}
                </button>
              ))}
            </div>
            <Btn
              variant="primary"
              disabled={!draft.trim()}
              onClick={() => setNotice("发送通道属于 M2。草稿已留在输入框。")}
            >
              <ArrowUp className="size-3.5" />
              发送
            </Btn>
          </div>
        </div>
        {notice ? (
          <p className="mt-2 text-center text-micro text-text-dim">{notice}</p>
        ) : null}
      </div>
    </div>
  );
}
