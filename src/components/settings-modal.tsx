import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ACCENTS,
  useSettings,
  type AccentId,
  type CanvasPref,
  type Density,
  type EditorWidth,
  type FontPref,
  type RadiusPref,
  type SidebarContrast,
  type ThemePref,
} from "@/lib/settings";
import { Btn } from "@/components/ui-bits";
import {
  currentDataDir,
  getSnapshotHealth,
  isTauri,
  refreshSnapshotHealth,
  type SnapshotHealth,
} from "@/dataAccess";
import { gitSnapshot, openInFileManager } from "@/storage/git";

type Pane =
  | "general"
  | "data"
  | "appearance"
  | "editor"
  | "layout"
  | "hotkeys"
  | "plugins"
  | "agent"
  | "about";

const NAV: { id: Pane; label: string }[] = [
  { id: "general", label: "常规" },
  { id: "data", label: "数据" },
  { id: "appearance", label: "外观" },
  { id: "editor", label: "编辑器" },
  { id: "layout", label: "布局" },
  { id: "hotkeys", label: "快捷键" },
  { id: "plugins", label: "插件" },
  { id: "agent", label: "Agent" },
  { id: "about", label: "关于" },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [pane, setPane] = useState<Pane>("appearance");
  const [query, setQuery] = useState("");
  const settings = useSettings();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV;
    return NAV.filter((n) => n.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-scrim"
        aria-label="关闭设置"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        className="settings-dialog relative flex overflow-hidden rounded-2xl bg-bg-elevated shadow-[var(--shadow-float)]"
      >
        <aside className="flex w-44 shrink-0 flex-col border-r border-border-subtle bg-bg-panel p-3">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索设置"
              className="h-8 w-full rounded-md bg-bg-sunken pr-2 pl-7 text-small placeholder:text-text-subtle focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
            />
          </div>
          <nav className="flex flex-1 flex-col gap-0.5">
            {nav.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setPane(n.id)}
                className={cn(
                  "h-8 rounded-md px-2 text-left text-small",
                  pane === n.id
                    ? "bg-accent/15 font-medium text-accent"
                    : "text-text-dim hover:bg-bg-hover hover:text-text",
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <Btn
            className="mt-2 justify-start gap-1.5 px-2"
            onClick={() => settings.reset()}
          >
            <RotateCcw className="size-3.5" />
            恢复默认
          </Btn>
        </aside>
        <section className="scrollbar-thin min-w-0 flex-1 overflow-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-title font-semibold tracking-tight">
              {NAV.find((n) => n.id === pane)?.label}
            </h2>
            <Btn className="size-8 p-0" aria-label="关闭" onClick={onClose}>
              <X className="size-4" />
            </Btn>
          </div>
          {pane === "general" ? <GeneralPane /> : null}
          {pane === "data" ? <DataPane /> : null}
          {pane === "appearance" ? <AppearancePane /> : null}
          {pane === "editor" ? <EditorPane /> : null}
          {pane === "layout" ? <LayoutPane /> : null}
          {pane === "hotkeys" ? <HotkeysPane /> : null}
          {pane === "plugins" ? <PluginsPane /> : null}
          {pane === "agent" ? <AgentPane /> : null}
          {pane === "about" ? <AboutPane /> : null}
        </section>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-small font-medium">{label}</div>
        {hint ? <p className="mt-0.5 text-micro text-text-dim">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segment<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="flex flex-nowrap rounded-md bg-bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "h-7 rounded px-2.5 text-micro font-medium",
            value === o.id
              ? "bg-bg-elevated text-text shadow-[var(--shadow-border)]"
              : "text-text-dim hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-10 rounded-full transition-colors",
        on ? "bg-accent" : "bg-bg-hover",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-bg-elevated transition-transform",
          on && "translate-x-4",
        )}
      />
    </button>
  );
}

function GeneralPane() {
  const s = useSettings();
  return (
    <div>
      <Row label="界面语言" hint="M1 仅中文。">
        <span className="text-small text-text-dim">简体中文</span>
      </Row>
      <Row label="删除需确认" hint="关闭后，删除任务不再二次确认。">
        <Toggle on={s.confirmDelete} onChange={(v) => s.patch({ confirmDelete: v })} />
      </Row>
      <Row label="显示已归档项目" hint="归档的项目从侧栏、今日视角与搜索中隐藏；打开后以暗淡样式显示。">
        <Toggle on={s.showArchived} onChange={(v) => s.patch({ showArchived: v })} />
      </Row>
      <Row label="默认打开" hint="进入项目时的中间视图。">
        <Segment
          value={s.defaultTab}
          onChange={(v) => s.patch({ defaultTab: v })}
          options={[
            { id: "tasks", label: "任务" },
            { id: "context", label: "项目上下文" },
          ]}
        />
      </Row>
      <Row label="点任务时打开右侧栏">
        <Toggle on={s.focusInspector} onChange={(v) => s.patch({ focusInspector: v })} />
      </Row>
    </div>
  );
}

function DataPane() {
  const dir = currentDataDir();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<SnapshotHealth | null>(() => getSnapshotHealth());
  const [retrying, setRetrying] = useState(false);
  return (
    <div>
      <Row label="数据目录" hint="本地 Markdown 文件树，与代码仓库分离；可被 Obsidian / git 直接打开。">
        <span
          className="max-w-72 truncate font-mono text-micro text-text-dim"
          title={dir ?? undefined}
        >
          {dir ?? "浏览器预览（mock 数据）"}
        </span>
      </Row>
      <Row label="打开目录" hint="在资源管理器中查看原始文件。">
        <Btn disabled={!dir} onClick={() => dir && void openInFileManager(dir)}>
          打开
        </Btn>
      </Row>
      <Row
        label="快照保护（每日自动）"
        hint={
          dir
            ? health?.ok
              ? `git 可用；最近快照 ${health.lastSnapshotDate ?? "—"}。每日首次启动自动提交，应用只写仓库级配置。`
              : "git 不可用或提交失败时数据没有版本历史兜底；安装 git 或修复后在下面重试。"
            : "桌面端功能。"
        }
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-small",
              dir ? (health?.ok ? "text-text-dim" : "text-star") : "text-text-subtle",
            )}
          >
            {dir ? (health ? (health.ok ? "正常" : "未生效") : "检查中…") : "—"}
          </span>
          {dir ? (
            <Btn
              disabled={retrying}
              onClick={() => {
                setRetrying(true);
                refreshSnapshotHealth()
                  .then((h) => {
                    setHealth(h);
                    setMsg(h?.ok ? "快照保护正常" : (h?.reason ?? "仍不可用"));
                  })
                  .catch((e: unknown) =>
                    setMsg(e instanceof Error ? e.message : String(e)),
                  )
                  .finally(() => setRetrying(false));
              }}
            >
              {retrying ? "检查中…" : "重试"}
            </Btn>
          ) : null}
        </div>
      </Row>
      <Row
        label="创建 git 快照"
        hint="git add -A + commit，把当前全部数据存入数据目录的版本历史。"
      >
        <Btn
          variant="primary"
          disabled={!dir || busy}
          onClick={() => {
            if (!dir) return;
            setBusy(true);
            gitSnapshot(dir)
              .then(setMsg)
              .catch((e: unknown) =>
                setMsg(e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "快照中…" : "创建快照"}
        </Btn>
      </Row>
      <Row
        label="AGENTS.md / .mcp.json / settings.yaml"
        hint="数据目录内的 agent 工作区文件，由应用在首次初始化时生成。"
      >
        <span className="text-small text-text-dim">{dir ? "已生成" : "—"}</span>
      </Row>
      {msg ? <p className="mt-3 font-mono text-micro text-text-dim">{msg}</p> : null}
    </div>
  );
}

function AppearancePane() {
  const s = useSettings();
  return (
    <div>
      <Row label="配色" hint="默认浅色。深色是 Obsidian 式炭灰，不是纯黑。">
        <Segment<ThemePref>
          value={s.theme}
          onChange={(v) => s.patch({ theme: v })}
          options={[
            { id: "light", label: "浅色" },
            { id: "dark", label: "深色" },
            { id: "system", label: "系统" },
          ]}
        />
      </Row>
      <Row label="浅色纸张" hint="白色更接近 Codex；暖纸更接近 Obsidian。">
        <Segment<CanvasPref>
          value={s.canvas}
          onChange={(v) => s.patch({ canvas: v })}
          options={[
            { id: "white", label: "白纸" },
            { id: "paper", label: "暖纸" },
          ]}
        />
      </Row>
      <Row label="强调色" hint="按钮、选中、焦点。">
        <div className="flex gap-1.5">
          {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
            <button
              key={id}
              type="button"
              title={ACCENTS[id].label}
              aria-label={ACCENTS[id].label}
              className={cn("swatch", s.accent === id && "is-on")}
              style={{ background: ACCENTS[id].light }}
              onClick={() => s.patch({ accent: id })}
            />
          ))}
        </div>
      </Row>
      <Row label="字体">
        <Segment<FontPref>
          value={s.font}
          onChange={(v) => s.patch({ font: v })}
          options={[
            { id: "sans", label: "无衬线" },
            { id: "serif", label: "衬线" },
          ]}
        />
      </Row>
      <Row label="字号" hint={`${s.fontSize}px`}>
        <input
          type="range"
          min={12}
          max={16}
          value={s.fontSize}
          onChange={(e) => s.patch({ fontSize: Number(e.target.value) })}
          className="w-32 accent-[var(--color-accent)]"
        />
      </Row>
      <Row label="密度">
        <Segment<Density>
          value={s.density}
          onChange={(v) => s.patch({ density: v })}
          options={[
            { id: "compact", label: "紧凑" },
            { id: "comfortable", label: "舒适" },
          ]}
        />
      </Row>
      <Row label="圆角">
        <Segment<RadiusPref>
          value={s.radius}
          onChange={(v) => s.patch({ radius: v })}
          options={[
            { id: "sm", label: "小" },
            { id: "md", label: "中" },
            { id: "lg", label: "大" },
          ]}
        />
      </Row>
      <Row label="侧栏对比" hint="侧栏相对画布的深浅。">
        <Segment<SidebarContrast>
          value={s.sidebarContrast}
          onChange={(v) => s.patch({ sidebarContrast: v })}
          options={[
            { id: "flat", label: "齐平" },
            { id: "soft", label: "轻微分隔" },
            { id: "high", label: "高对比" },
          ]}
        />
      </Row>
      <Row label="窗口控件" hint="左上角红黄绿，可关。">
        <Toggle on={s.windowChrome} onChange={(v) => s.patch({ windowChrome: v })} />
      </Row>
    </div>
  );
}

function EditorPane() {
  const s = useSettings();
  return (
    <div>
      <Row label="内容宽度">
        <Segment<EditorWidth>
          value={s.editorWidth}
          onChange={(v) => s.patch({ editorWidth: v })}
          options={[
            { id: "narrow", label: "窄" },
            { id: "medium", label: "中" },
            { id: "wide", label: "宽" },
          ]}
        />
      </Row>
      <Row label="已完成 / 已放弃默认折叠">
        <Toggle on={s.collapseDone} onChange={(v) => s.patch({ collapseDone: v })} />
      </Row>
      <Row label="列表显示下一步">
        <Toggle on={s.showNextInList} onChange={(v) => s.patch({ showNextInList: v })} />
      </Row>
      <Row label="日期格式">
        <Segment
          value={s.dateFormat}
          onChange={(v) => s.patch({ dateFormat: v })}
          options={[
            { id: "cn", label: "9月10日" },
            { id: "iso", label: "2026-09-10" },
          ]}
        />
      </Row>
      <Row label="日志顺序" hint="上下文条目的排列。">
        <Segment
          value={s.logOrder}
          onChange={(v) => s.patch({ logOrder: v })}
          options={[
            { id: "asc", label: "旧 → 新" },
            { id: "desc", label: "新 → 旧" },
          ]}
        />
      </Row>
    </div>
  );
}

function LayoutPane() {
  const s = useSettings();
  return (
    <div>
      <Row label="展开文件树" hint="左侧收到只剩图标栏。快捷键 ⌘B。">
        <Toggle on={s.leftOpen} onChange={(v) => s.patch({ leftOpen: v })} />
      </Row>
      <Row label="展开右侧栏" hint="右侧收到只剩图标栏。快捷键 ⌘\\。">
        <Toggle on={s.rightOpen} onChange={(v) => s.patch({ rightOpen: v })} />
      </Row>
      <Row label="展开底部面板">
        <Toggle on={s.bottomOpen} onChange={(v) => s.patch({ bottomOpen: v })} />
      </Row>
      <Row label="图标栏显示文字" hint="丝带下方加短标签。">
        <Toggle on={s.ribbonLabels} onChange={(v) => s.patch({ ribbonLabels: v })} />
      </Row>
    </div>
  );
}

function HotkeysPane() {
  const rows = [
    ["设置", "⌘ / Ctrl + ,"],
    ["收起 / 展开文件树", "⌘ / Ctrl + B"],
    ["收起 / 展开右侧栏", "⌘ / Ctrl + \\"],
    ["底部面板", "⌘ / Ctrl + J"],
    ["文件", "⌘ / Ctrl + 1"],
    ["搜索", "⌘ / Ctrl + 2"],
    ["收件箱", "⌘ / Ctrl + 3"],
    ["Agent", "⌘ / Ctrl + 4"],
    ["全局唤起收件箱（桌面端）", "Ctrl + Shift + Space"],
    ["确认输入", "Enter"],
    ["取消编辑", "Esc"],
  ];
  return (
    <div>
      {rows.map(([k, v]) => (
        <Row key={k} label={k}>
          <kbd className="rounded-md bg-bg-sunken px-2 py-0.5 font-mono text-micro text-text-dim">
            {v}
          </kbd>
        </Row>
      ))}
    </div>
  );
}

function PluginsPane() {
  return (
    <p className="text-small leading-relaxed text-text-dim">
      插件的开关在主界面左侧丝带的「插件」页里，和 Obsidian 社区插件列表类似。核心的文件树与上下文日志会保持开启。打开今日 / 周报 / 图谱后，对应图标会出现在丝带上。
    </p>
  );
}

function AgentPane() {
  const s = useSettings();
  return (
    <div>
      <Row label="默认模式" hint="计划只读建议；执行才允许改工作区（M2）。">
        <Segment
          value={s.agentMode}
          onChange={(v) => s.patch({ agentMode: v })}
          options={[
            { id: "plan", label: "计划" },
            { id: "act", label: "执行" },
          ]}
        />
      </Row>
      <Row label="把回复写入上下文日志">
        <Toggle on={s.agentWriteLog} onChange={(v) => s.patch({ agentWriteLog: v })} />
      </Row>
      <Row label="改任务前需确认" hint="助手不能静默改 status / next。">
        <Toggle
          on={s.agentConfirmWrites}
          onChange={(v) => s.patch({ agentConfirmWrites: v })}
        />
      </Row>
      <p className="mt-3 text-small text-text-dim">
        这些选项会在 M2 交给 AgentRunner。现在改了会立刻存下来，接线时直接读取。
      </p>
    </div>
  );
}

function AboutPane() {
  const [version, setVersion] = useState<string>("…");
  useEffect(() => {
    if (!isTauri()) {
      setVersion("浏览器预览");
      return;
    }
    void import("@tauri-apps/api/app")
      .then((m) => m.getVersion())
      .then(setVersion)
      .catch(() => setVersion("0.1.0"));
  }, []);
  return (
    <div className="space-y-2 text-small leading-relaxed text-text-dim">
      <p className="text-text font-medium">
        ResearchThread {version} · 种子测试版（Seed）
      </p>
      <p>本地优先的科研思路整理：空间、项目、任务，以及按日期追加的上下文日志。</p>
      <p>
        所有数据以 Markdown 文件保存在本机数据目录；应用本身不联网、不上传任何数据。
        通过终端运行外部 CLI agent（如 claude / codex）时，对应内容会按该服务自身的条款离开本机。
      </p>
      <p>种子反馈渠道与隐私说明见随附的《种子测试手册》。</p>
    </div>
  );
}
