import {
  IconAgent,
  IconFiles,
  IconGraph,
  IconInbox,
  IconJournal,
  IconPlugins,
  IconToday,
  IconWeekly,
} from "@/components/icons";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";
import { useSettings, type PluginFlags } from "@/lib/settings";

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

const CATALOG: {
  id: keyof PluginFlags;
  name: string;
  blurb: string;
  Icon: Glyph;
  stage: "on" | "m2";
  locked?: boolean;
}[] = [
  {
    id: "files",
    name: "文件树",
    blurb: "空间 → 项目 → 任务的本地层级。M1 核心。",
    Icon: IconFiles,
    stage: "on",
    locked: true,
  },
  {
    id: "journal",
    name: "上下文日志",
    blurb: "按日期追加的现场记录，agent 条目只读。",
    Icon: IconJournal,
    stage: "on",
    locked: true,
  },
  {
    id: "inbox",
    name: "收件箱",
    blurb: "未归类的零散思路，先记下来再分到项目。",
    Icon: IconInbox,
    stage: "m2",
  },
  {
    id: "agent",
    name: "AgentRunner",
    blurb: "研究助手：计划只读，执行才允许改工作区。",
    Icon: IconAgent,
    stage: "m2",
  },
  {
    id: "today",
    name: "今日视角",
    blurb: "把标了下一步的任务摊成今天的工作台。",
    Icon: IconToday,
    stage: "m2",
  },
  {
    id: "weekly",
    name: "周文档",
    blurb: "从日志自动汇总一周在做什么、卡在哪。",
    Icon: IconWeekly,
    stage: "m2",
  },
  {
    id: "graph",
    name: "图谱",
    blurb: "空间 / 项目 / 任务之间的弱链接一览。",
    Icon: IconGraph,
    stage: "m2",
  },
];

export function PluginsView() {
  const plugins = useSettings((s) => s.plugins);
  const patchPlugin = useSettings((s) => s.patchPlugin);

  return (
    <div className="fade-rise rt-page px-6 py-6">
      <div className="mb-1 flex items-center gap-2">
        <IconPlugins className="text-accent" />
        <h1 className="text-title font-semibold tracking-tight">插件</h1>
      </div>
      <p className="mb-5 text-small text-text-dim">
        核心能力保持开启。打开 M2 插件后，左侧丝带会出现对应图标，界面先留好位置。
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CATALOG.map((p) => {
          const on = plugins[p.id];
          return (
            <div
              key={p.id}
              className="flex gap-3 rounded-xl bg-bg-elevated p-3 shadow-[var(--shadow-border)]"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-bg-panel text-accent">
                <p.Icon width={16} height={16} strokeWidth={1.6} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-micro",
                      p.stage === "on"
                        ? "bg-st-done/15 text-st-done"
                        : "bg-bg-hover text-text-subtle",
                    )}
                  >
                    {p.stage === "on" ? "M1" : "M2"}
                  </span>
                </div>
                <p className="mt-0.5 text-small text-pretty text-text-dim">{p.blurb}</p>
              </div>
              <button
                type="button"
                disabled={p.locked}
                className={cn(
                  "self-center rounded-full px-0.5",
                  on ? "text-accent" : "text-text-subtle",
                  p.locked && "opacity-50",
                )}
                aria-pressed={on}
                aria-label={on ? `关闭 ${p.name}` : `打开 ${p.name}`}
                onClick={() => {
                  if (!p.locked) patchPlugin(p.id, !on);
                }}
              >
                <ToggleGlyph on={on} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToggleGlyph({ on }: { on: boolean }) {
  return (
    <svg width="28" height="18" viewBox="0 0 28 18" fill="none" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="26"
        height="16"
        rx="8"
        fill={on ? "var(--color-accent)" : "var(--color-bg-hover)"}
      />
      <circle cx={on ? 19 : 9} cy="9" r="6" fill="var(--color-bg-elevated)" />
    </svg>
  );
}
