import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu, PanelLeft, PanelRight, X } from "lucide-react";
import {
  currentDataDir,
  ExternalConflictError,
  getDataAccess,
  getFullDataAccess,
  getSnapshotHealth,
  getStorage,
  isTauri,
  type Space,
  type Task,
} from "@/dataAccess";
import { cn } from "@/lib/cn";
import { useEditorDirty } from "@/lib/editorState";
import { startWatcher } from "@/lib/watcher";
import {
  DEFAULT_SELECTION,
  EMPTY_SELECTION,
  type Selection,
} from "@/components/selection";
import { Sidebar } from "@/components/sidebar";
import {
  InboxView,
  NothingSelected,
  ProjectContext,
  SpaceOverview,
  TaskList,
} from "@/components/center-views";
import { TaskDetail } from "@/components/task-detail";
import { TerminalPanel } from "@/components/terminal-panel";
import { Btn } from "@/components/ui-bits";
import { IconRibbon } from "@/components/icon-ribbon";
import { InspectorRail } from "@/components/inspector-rail";
import { SettingsModal } from "@/components/settings-modal";
import { AgentView } from "@/components/agent-view";
import { PluginsView } from "@/components/plugins-view";
import { SearchView } from "@/components/search-view";
import { GraphView, TodayView, WeeklyView } from "@/components/extra-views";
import { openInFileManager } from "@/storage/git";
import { useSettings, type AppView } from "@/lib/settings";

type CenterTab = "tasks" | "context";

export function ResearchApp({
  initialSpaces,
  initialTask,
}: {
  initialSpaces: Space[];
  initialTask: Task | null;
}) {
  const da = getDataAccess();
  const leftOpen = useSettings((s) => s.leftOpen);
  const rightOpen = useSettings((s) => s.rightOpen);
  const bottomOpen = useSettings((s) => s.bottomOpen);
  const defaultTab = useSettings((s) => s.defaultTab);
  const focusInspector = useSettings((s) => s.focusInspector);
  const plugins = useSettings((s) => s.plugins);
  const introSeen = useSettings((s) => s.introSeen);
  const patch = useSettings((s) => s.patch);

  const [spaces, setSpaces] = useState<Space[]>(initialSpaces);
  const [selection, setSelection] = useState<Selection>({
    spaceId: DEFAULT_SELECTION.spaceId,
    projectId: DEFAULT_SELECTION.projectId,
    taskId: initialTask ? DEFAULT_SELECTION.taskId : null,
    inbox: false,
  });
  const [activeTask, setActiveTask] = useState<Task | null>(initialTask);
  const [tab, setTab] = useState<CenterTab>(defaultTab);
  const [view, setView] = useState<AppView>("files");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsedSpaces, setCollapsedSpaces] = useState<Record<string, boolean>>({});
  const [mobileNav, setMobileNav] = useState(false);
  const [mobileRight, setMobileRight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingExternal, setPendingExternal] = useState(false);
  const [conflict, setConflict] = useState<{ rel: string; retry: () => Promise<void> } | null>(null);
  const [snapshotWarn, setSnapshotWarn] = useState<string | null>(null);

  // 快照保护未生效 → 持久警告（发布门槛：git 缺失/提交失败必须在界面可见）
  useEffect(() => {
    const h = getSnapshotHealth();
    if (h && !h.ok) setSnapshotWarn(h.reason ?? "快照保护未生效");
  }, []);

  // 未保存草稿退出保护：脏编辑器存在时拦截窗口关闭（浏览器 dev 走 beforeunload）
  useEffect(() => {
    if (!isTauri()) {
      const h = (e: BeforeUnloadEvent) => {
        if (useEditorDirty.getState().any()) {
          e.preventDefault();
          e.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", h);
      return () => window.removeEventListener("beforeunload", h);
    }
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlisten = await getCurrentWindow().onCloseRequested((event) => {
          if (!useEditorDirty.getState().any()) return; // 不脏：放行默认关闭
          event.preventDefault();
          if (window.confirm("有未保存的修改（任务 / 项目上下文 / 周文档）。确定放弃并退出吗？")) {
            void getCurrentWindow().destroy();
          }
        });
      } catch (e) {
        console.warn("close guard unavailable:", e);
      }
    })();
    return () => unlisten?.();
  }, []);

  const refresh = useCallback(async (sel: Selection = selection) => {
    const list = await da.listSpaces();
    setSpaces(list);
    if (sel.taskId && sel.spaceId && sel.projectId) {
      try {
        setActiveTask(await da.getTask(sel.spaceId, sel.projectId, sel.taskId));
      } catch {
        setActiveTask(null);
        setSelection((s) => ({ ...s, taskId: null }));
      }
    } else {
      setActiveTask(null);
    }
  }, [da, selection]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // M2① 文件监听：编辑器不脏 → 静默重载；脏 → 外部变更横幅
  useEffect(() => {
    if (!isTauri()) return;
    let stop: (() => void) | null = null;
    let disposed = false;
    void startWatcher({
      onQuiet: () => {
        if (!useEditorDirty.getState().any()) void refreshRef.current();
      },
      onExternal: () => {
        if (useEditorDirty.getState().any()) setPendingExternal(true);
      },
    }).then((s) => {
      if (disposed) s();
      else stop = s;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);

  // 全局快捷键（Ctrl+Shift+Space）唤起收件箱
  useEffect(() => {
    function open() {
      setSelection((s) => ({ ...s, inbox: true }));
      setActiveTask(null);
      setView("inbox");
    }
    window.addEventListener("rt:open-inbox", open);
    return () => window.removeEventListener("rt:open-inbox", open);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        setView("files");
        patch({ leftOpen: !useSettings.getState().leftOpen });
      } else if (e.key === "\\") {
        e.preventDefault();
        patch({ rightOpen: !useSettings.getState().rightOpen });
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        patch({ bottomOpen: !useSettings.getState().bottomOpen });
      } else if (e.key === "1") {
        e.preventDefault();
        setView("files");
        patch({ leftOpen: true });
        setMobileNav(true);
      } else if (e.key === "2") {
        e.preventDefault();
        setView("search");
        setMobileNav(false);
      } else if (e.key === "3") {
        e.preventDefault();
        setView("inbox");
        setMobileNav(false);
      } else if (e.key === "4") {
        e.preventDefault();
        setView("agent");
        setMobileNav(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patch]);

  useEffect(() => {
    if (view === "graph" && !plugins.graph) setView("files");
    if (view === "today" && !plugins.today) setView("files");
    if (view === "weekly" && !plugins.weekly) setView("files");
    if (view === "inbox" && !plugins.inbox) setView("files");
    if (view === "agent" && !plugins.agent) setView("files");
  }, [plugins, view]);

  const space = useMemo(
    () => spaces.find((s) => s.id === selection.spaceId) ?? null,
    [spaces, selection.spaceId],
  );
  const project = useMemo(
    () => space?.projects.find((p) => p.id === selection.projectId) ?? null,
    [space, selection.projectId],
  );

  function handleView(next: AppView) {
    if (next === "files") {
      if (view === "files") {
        patch({ leftOpen: !useSettings.getState().leftOpen });
      } else {
        setView("files");
        if (!useSettings.getState().leftOpen) patch({ leftOpen: true });
      }
      setMobileNav(true);
      return;
    }
    setView(next);
    setMobileNav(false);
    if (next === "inbox") {
      setSelection((s) => ({ ...s, inbox: true }));
      setActiveTask(null);
    }
  }

  function selectSpace(spaceId: string) {
    setSelection({ spaceId, projectId: null, taskId: null, inbox: false });
    setActiveTask(null);
    setTab(defaultTab);
    setView("files");
    setMobileNav(false);
  }

  function selectProject(spaceId: string, projectId: string) {
    setSelection({ spaceId, projectId, taskId: null, inbox: false });
    setActiveTask(null);
    setTab(defaultTab);
    setView("files");
    setMobileNav(false);
  }

  async function selectTask(taskId: string) {
    if (!selection.spaceId || !selection.projectId) return;
    const next: Selection = { ...selection, taskId, inbox: false };
    setSelection(next);
    setView("files");
    if (focusInspector) {
      patch({ rightOpen: true });
      setMobileRight(true);
    }
    try {
      setActiveTask(await da.getTask(selection.spaceId, selection.projectId, taskId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法打开任务");
    }
  }

  async function openTask(spaceId: string, projectId: string, taskId: string) {
    const next: Selection = { spaceId, projectId, taskId, inbox: false };
    setSelection(next);
    setView("files");
    if (focusInspector) {
      patch({ rightOpen: true });
      setMobileRight(true);
    }
    setMobileNav(false);
    try {
      setActiveTask(await da.getTask(spaceId, projectId, taskId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法打开任务");
    }
  }

  async function withError(fn: () => Promise<void>) {
    try {
      setError(null);
      await fn();
      setConflict(null);
    } catch (e) {
      if (e instanceof ExternalConflictError) {
        // 外部修改冲突：不静默覆盖，交用户选择（发布门槛：并发策略）
        setConflict({ rel: e.rel, retry: fn });
        return;
      }
      setError(e instanceof Error ? e.message : "操作失败");
    }
  }

  const breadcrumb =
    view === "search"
      ? "搜索"
      : view === "inbox"
        ? "收件箱"
        : view === "agent"
          ? "Agent"
          : view === "plugins"
            ? "插件"
            : view === "graph"
              ? "图谱"
              : view === "today"
                ? "今日"
                : view === "weekly"
                  ? "周文档"
                  : project && space
                    ? `${space.name} / ${project.name}`
                    : space
                      ? space.name
                      : "ResearchThread";

  const treeCollapsed = view !== "files" || !leftOpen;

  return (
    <div className="app-shell relative flex h-full overflow-hidden">
      <IconRibbon
        view={view}
        onView={handleView}
        onSettings={() => setSettingsOpen(true)}
      />

      {mobileNav ? (
        <button
          type="button"
          className="rt-scrim absolute inset-0 z-20 bg-scrim"
          aria-label="关闭侧栏"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      {mobileRight ? (
        <button
          type="button"
          className="rt-scrim absolute inset-0 z-10 bg-scrim"
          aria-label="关闭任务详情"
          onClick={() => setMobileRight(false)}
        />
      ) : null}

      <aside
        className={cn(
          "rt-sidebar rt-tree flex h-full shrink-0 flex-col border-r border-border-subtle bg-bg-panel",
          treeCollapsed && "is-collapsed",
          mobileNav && "is-open",
        )}
        aria-hidden={treeCollapsed && !mobileNav}
        inert={treeCollapsed && !mobileNav ? true : undefined}
      >
        <Sidebar
          spaces={spaces}
          selection={selection}
          collapsedSpaces={collapsedSpaces}
          onSelectSpace={selectSpace}
          onSelectProject={selectProject}
          onToggleSpace={(id) =>
            setCollapsedSpaces((prev) => ({ ...prev, [id]: !prev[id] }))
          }
          onCollapse={() => patch({ leftOpen: false })}
          onCreateSpace={async (name) => {
            await withError(async () => {
              const created = await da.createSpace(name);
              const next = { ...EMPTY_SELECTION, spaceId: created.id };
              await refresh(next);
              setSelection(next);
              setView("files");
            });
          }}
          onCreateProject={async (spaceId, name) => {
            await withError(async () => {
              const created = await da.createProject(spaceId, name);
              const next: Selection = {
                spaceId,
                projectId: created.id,
                taskId: null,
                inbox: false,
              };
              await refresh(next);
              setSelection(next);
              setTab("tasks");
              setView("files");
            });
          }}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-titlebar shrink-0 items-center gap-2 border-b border-border-subtle bg-bg px-3">
          <Btn
            className="rt-menu-btn"
            aria-label="打开空间列表"
            onClick={() => {
              setView("files");
              setMobileNav(true);
              patch({ leftOpen: true });
            }}
          >
            <Menu className="size-4" />
          </Btn>
          <Btn
            variant="toolbar"
            className="rt-desk-toggle"
            aria-pressed={leftOpen && view === "files"}
            aria-label="切换文件树"
            title="文件树 Ctrl+B"
            onClick={() => {
              setView("files");
              patch({ leftOpen: !leftOpen });
            }}
          >
            <PanelLeft className="size-3.5" />
          </Btn>
          <div className="min-w-0 flex-1 truncate text-small text-text-dim">
            {breadcrumb}
          </div>
          {view === "files" && project && !selection.inbox ? (
            <div className="flex rounded-md bg-bg-elevated p-0.5 shadow-[var(--shadow-border)]">
              <TabBtn active={tab === "tasks"} onClick={() => setTab("tasks")}>
                任务
              </TabBtn>
              <TabBtn active={tab === "context"} onClick={() => setTab("context")}>
                项目上下文
              </TabBtn>
            </div>
          ) : null}
          <div className="ml-1 flex items-center gap-0.5">
            <Btn
              variant="toolbar"
              className="rt-mobile-inspector-btn"
              aria-pressed={mobileRight}
              aria-label="切换右侧栏"
              title="右侧栏 Ctrl+\\"
              onClick={() => {
                setMobileRight((v) => {
                  const next = !v;
                  if (next) patch({ rightOpen: true });
                  return next;
                });
              }}
            >
              <PanelRight className="size-3.5" />
            </Btn>
          </div>
        </header>

        <main className="scrollbar-thin relative min-h-0 flex-1 overflow-auto bg-bg">
          {view === "search" ? (
            <SearchView
              spaces={spaces}
              onOpenTask={(a, b, c) => void openTask(a, b, c)}
              onOpenProject={(s, p) => selectProject(s, p)}
            />
          ) : view === "inbox" ? (
            <InboxView
              spaces={spaces}
              onChanged={() => void refreshRef.current()}
              onOpenTask={(a, b, c) => void openTask(a, b, c)}
            />
          ) : view === "agent" ? (
            <AgentView projectName={project?.name} />
          ) : view === "plugins" ? (
            <PluginsView />
          ) : view === "graph" ? (
            <GraphView spaces={spaces} />
          ) : view === "today" ? (
            <TodayView spaces={spaces} onOpenTask={(a, b, c) => void openTask(a, b, c)} />
          ) : view === "weekly" ? (
            <WeeklyView />
          ) : project && tab === "context" ? (
            <ProjectContext
              project={project}
              onSave={async (description) => {
                await withError(async () => {
                  await da.updateProjectDescription(
                    selection.spaceId!,
                    project.id,
                    description,
                  );
                  await refresh();
                });
              }}
              onSetArchived={async (archived) => {
                await withError(async () => {
                  await getFullDataAccess().setProjectArchived(
                    selection.spaceId!,
                    project.id,
                    archived,
                  );
                  await refresh();
                });
              }}
            />
          ) : project && tab === "tasks" ? (
            <TaskList
              project={project}
              selectedTaskId={selection.taskId}
              onSelectTask={(id) => void selectTask(id)}
              onCreateTask={async (title, next) => {
                await withError(async () => {
                  const created = await da.createTask(
                    selection.spaceId!,
                    selection.projectId!,
                    title,
                    next,
                  );
                  const nextSel: Selection = {
                    ...selection,
                    taskId: created.id,
                    inbox: false,
                  };
                  await refresh(nextSel);
                  setSelection(nextSel);
                  setActiveTask(created);
                  if (focusInspector) {
                    patch({ rightOpen: true });
                    setMobileRight(true);
                  }
                });
              }}
            />
          ) : space ? (
            <SpaceOverview
              space={space}
              onOpenProject={(projectId) => selectProject(space.id, projectId)}
            />
          ) : (
            <NothingSelected />
          )}
        </main>

        {bottomOpen ? (
          <div className="flex h-bottom shrink-0 flex-col border-t border-border-subtle bg-bg-sunken">
            <div className="flex h-8 items-center justify-between border-b border-border-subtle px-3">
              <span className="text-micro font-medium tracking-wide text-text-subtle">
                终端 · AgentRunner{currentDataDir() ? "" : "（桌面端可用）"}
              </span>
              <Btn
                className="size-7 p-0"
                aria-label="关闭底部面板"
                onClick={() => patch({ bottomOpen: false })}
              >
                <X className="size-3.5" />
              </Btn>
            </div>
            <div className="min-h-0 flex-1">
              <TerminalPanel />
            </div>
          </div>
        ) : null}
      </div>

      {rightOpen ? (
        <aside className={cn(
          "rt-inspector z-20 flex h-full w-inspector min-w-0 shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-bg-panel",
          mobileRight && "is-open",
        )}>
          <TaskDetail
            task={activeTask}
            onPatchMeta={async (patchMeta) => {
              if (!selection.spaceId || !selection.projectId || !selection.taskId) return;
              await withError(async () => {
                await da.updateTaskMeta(
                  selection.spaceId!,
                  selection.projectId!,
                  selection.taskId!,
                  patchMeta,
                );
                await refresh();
              });
            }}
            onSaveText={async (title, next) => {
              if (!selection.spaceId || !selection.projectId || !selection.taskId) return;
              await withError(async () => {
                await da.updateTaskMeta(
                  selection.spaceId!,
                  selection.projectId!,
                  selection.taskId!,
                  { title, next },
                );
                await refresh();
              });
            }}
            onAppend={async (text) => {
              if (!selection.spaceId || !selection.projectId || !selection.taskId) return;
              await withError(async () => {
                const updated = await da.appendEntry(
                  selection.spaceId!,
                  selection.projectId!,
                  selection.taskId!,
                  { text },
                );
                setActiveTask(updated);
                await refresh();
              });
            }}
            onUpdateEntry={async (index, text) => {
              if (!selection.spaceId || !selection.projectId || !selection.taskId) return;
              await withError(async () => {
                const updated = await da.updateEntry(
                  selection.spaceId!,
                  selection.projectId!,
                  selection.taskId!,
                  index,
                  text,
                );
                setActiveTask(updated);
                await refresh();
              });
            }}
            onDelete={async () => {
              if (!selection.spaceId || !selection.projectId || !selection.taskId) return;
              await withError(async () => {
                await da.deleteTask(
                  selection.spaceId!,
                  selection.projectId!,
                  selection.taskId!,
                );
                const next: Selection = { ...selection, taskId: null };
                setSelection(next);
                setActiveTask(null);
                await refresh(next);
              });
            }}
          />
        </aside>
      ) : null}

      <InspectorRail
        hasTask={Boolean(activeTask)}
        inspectorOpen={rightOpen}
        bottomOpen={bottomOpen}
        onToggleInspector={() => patch({ rightOpen: !rightOpen })}
        onToggleBottom={() => patch({ bottomOpen: !bottomOpen })}
      />

      {settingsOpen ? <SettingsModal onClose={() => setSettingsOpen(false)} /> : null}

      {!introSeen ? (
        <FirstRunIntro onClose={() => patch({ introSeen: true })} />
      ) : null}

      {conflict ? (
        <div className="absolute left-1/2 top-10 z-40 flex max-w-[80%] -translate-x-1/2 items-center gap-3 rounded-full border border-border-subtle bg-bg-elevated px-4 py-1.5 text-small shadow-[var(--shadow-float)]">
          <span className="min-w-0 truncate text-text-dim">
            保存被阻止：{conflict.rel} 在外部（Obsidian / git / 手改）被修改过。
          </span>
          <button
            type="button"
            className="shrink-0 font-medium text-accent hover:underline"
            onClick={() => {
              const { rel, retry } = conflict;
              setConflict(null);
              void (async () => {
                const st = getStorage();
                if (st) await st.acknowledgeExternalChange(rel);
                try {
                  await retry();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "操作失败");
                }
              })();
            }}
          >
            覆盖保存
          </button>
          <button
            type="button"
            className="shrink-0 font-medium text-accent hover:underline"
            onClick={() => {
              setConflict(null);
              void refreshRef.current();
            }}
          >
            重新加载
          </button>
          <button
            type="button"
            className="shrink-0 text-text-dim hover:text-text"
            onClick={() => setConflict(null)}
          >
            取消
          </button>
        </div>
      ) : null}

      {snapshotWarn ? (
        <div className="absolute bottom-4 left-4 z-40 flex max-w-md items-start gap-2.5 rounded-xl border border-border-subtle bg-bg-elevated px-4 py-2.5 text-small shadow-[var(--shadow-float)]">
          <span className="shrink-0 text-star" aria-hidden="true">⚠</span>
          <span className="min-w-0 leading-relaxed text-text-dim">
            快照保护未生效：{snapshotWarn}。数据仍会正常保存，但没有版本历史兜底。
          </span>
          <button
            type="button"
            className="shrink-0 font-medium text-accent hover:underline"
            onClick={() => setSettingsOpen(true)}
          >
            查看
          </button>
          <button
            type="button"
            aria-label="本次会话不再提示"
            className="shrink-0 text-text-dim hover:text-text"
            onClick={() => setSnapshotWarn(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      {pendingExternal ? (
        <div className="absolute left-1/2 top-10 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border-subtle bg-bg-elevated px-4 py-1.5 text-small shadow-[var(--shadow-float)]">
          <span className="text-text-dim">
            文件在外部被修改（Obsidian / git / 手改），当前有未保存编辑。
          </span>
          <button
            type="button"
            className="font-medium text-accent hover:underline"
            onClick={() => {
              setPendingExternal(false);
              void refreshRef.current();
            }}
          >
            重新加载
          </button>
          <button
            type="button"
            className="text-text-dim hover:text-text"
            onClick={() => setPendingExternal(false)}
          >
            忽略
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="toast-error absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full px-3 py-1.5 text-small shadow-[var(--shadow-float)]">
          {error}
          <button
            type="button"
            className="ml-2 opacity-80 hover:opacity-100"
            onClick={() => setError(null)}
          >
            关闭
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-6 rounded px-2.5 text-micro font-medium",
        active ? "bg-bg-hover text-text" : "text-text-dim hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

/** 种子版安装后的首启提示：数据在哪、快照警告含义、并发与反馈渠道 */
function FirstRunIntro({ onClose }: { onClose: () => void }) {
  const dir = currentDataDir();
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-scrim"
        aria-label="关闭提示"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="欢迎"
        className="relative w-full max-w-lg rounded-2xl bg-bg-elevated p-6 shadow-[var(--shadow-float)]"
      >
        <h2 className="mb-1 text-title font-semibold tracking-tight">
          欢迎使用 ResearchThread（种子测试版）
        </h2>
        <p className="mb-4 text-small text-text-dim">
          三件事值得先知道，之后随时能在「设置 → 数据」里查：
        </p>
        <ol className="mb-5 flex flex-col gap-3 text-small leading-relaxed">
          <li className="flex gap-2.5">
            <span className="shrink-0 font-mono text-text-subtle">1</span>
            <span>
              所有数据都是<strong>本机 Markdown 文件</strong>，存放在
              <span className="mx-1 break-all font-mono text-micro text-text-dim">
                {dir ?? "（浏览器预览为 mock 数据）"}
              </span>
              。应用不联网、不上传任何内容；可以直接用 Obsidian / 记事本打开这个目录。
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="shrink-0 font-mono text-text-subtle">2</span>
            <span>
              数据目录每天第一次启动会自动做 <strong>git 快照</strong>。如果左下角出现
              「快照保护未生效」警告，说明这台电脑没装 git——数据照常保存，但没有版本历史兜底，装
              Git for Windows 后在设置里点「重试」即可。
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="shrink-0 font-mono text-text-subtle">3</span>
            <span>
              用外部工具编辑文件时应用会<strong>阻止静默覆盖</strong>（保存时弹选择）；
              反馈问题请用《种子测试手册》里的脱敏模板，<strong>不要打包整个数据目录</strong>。
            </span>
          </li>
        </ol>
        <div className="flex items-center justify-between gap-2">
          <Btn
            disabled={!dir}
            onClick={() => dir && void openInFileManager(dir)}
          >
            打开数据目录
          </Btn>
          <Btn variant="primary" onClick={onClose}>
            开始使用
          </Btn>
        </div>
      </div>
    </div>
  );
}
