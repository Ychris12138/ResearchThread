import { cn } from "@/lib/cn";
import {
  IconAgent,
  IconFiles,
  IconGraph,
  IconInbox,
  IconMark,
  IconPlugins,
  IconSearch,
  IconSettings,
  IconToday,
  IconWeekly,
} from "@/components/icons";
import type { AppView, PluginFlags } from "@/lib/settings";
import { useSettings } from "@/lib/settings";

const ITEMS: {
  id: AppView;
  label: string;
  shortcut?: string;
  Icon: typeof IconFiles;
  plugin?: keyof PluginFlags;
  stage?: "m1" | "m2";
}[] = [
  { id: "files", label: "文件", shortcut: "⌘1", Icon: IconFiles, plugin: "files" },
  { id: "search", label: "搜索", shortcut: "⌘2", Icon: IconSearch, stage: "m2" },
  { id: "inbox", label: "收件箱", shortcut: "⌘3", Icon: IconInbox, plugin: "inbox", stage: "m2" },
  { id: "today", label: "今日", Icon: IconToday, plugin: "today", stage: "m2" },
  { id: "weekly", label: "周报", Icon: IconWeekly, plugin: "weekly", stage: "m2" },
  { id: "agent", label: "Agent", shortcut: "⌘4", Icon: IconAgent, plugin: "agent" },
  { id: "graph", label: "图谱", Icon: IconGraph, plugin: "graph", stage: "m2" },
  { id: "plugins", label: "插件", Icon: IconPlugins },
];

export function IconRibbon({
  view,
  onView,
  onSettings,
}: {
  view: AppView;
  onView: (view: AppView) => void;
  onSettings: () => void;
}) {
  const labels = useSettings((s) => s.ribbonLabels);
  const plugins = useSettings((s) => s.plugins);
  const items = ITEMS.filter((item) => (item.plugin ? plugins[item.plugin] : true));

  return (
    <div className="flex h-full w-ribbon shrink-0 flex-col items-center border-r border-border-subtle bg-bg-ribbon py-2">
      <div
        className="mb-3 grid size-8 place-items-center rounded-lg bg-bg-elevated text-text shadow-[var(--shadow-border)]"
        title="ResearchThread"
        aria-hidden="true"
      >
        <IconMark />
      </div>

      <nav className="flex flex-1 flex-col items-center gap-0.5">
        {items.map((item) => {
          const on = view === item.id;
          const tip = `${item.label}${item.shortcut ? `  ${item.shortcut}` : ""}${item.stage === "m2" ? " · M2" : ""}`;
          return (
            <button
              key={item.id}
              type="button"
              data-tip={labels ? undefined : tip}
              className={cn(
                "ribbon-btn flex flex-col items-center justify-center rounded-lg",
                labels ? "h-14 w-11 gap-0.5" : "size-10",
                on
                  ? "bg-accent/15 text-accent"
                  : "text-text-dim hover:bg-bg-hover hover:text-text",
              )}
              aria-current={on ? "page" : undefined}
              aria-label={item.label}
              onClick={() => onView(item.id)}
            >
              <item.Icon strokeWidth={on ? 2 : 1.6} />
              {labels ? <span className="ribbon-label">{item.label}</span> : null}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        data-tip={labels ? undefined : "设置  ⌘,"}
        className={cn(
          "ribbon-btn mt-1 flex flex-col items-center justify-center rounded-lg text-text-dim hover:bg-bg-hover hover:text-text",
          labels ? "h-14 w-11 gap-0.5" : "size-10",
        )}
        aria-label="设置"
        onClick={onSettings}
      >
        <IconSettings />
        {labels ? <span className="ribbon-label">设置</span> : null}
      </button>
    </div>
  );
}
