import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Star } from "lucide-react";
import { getFullDataAccess, type InboxItem, type Project, type Space, type Task, type TaskStatus } from "@/dataAccess";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown";
import { useEditorDirty } from "@/lib/editorState";
import {
  doingCount,
  groupTasks,
  latestUpdated,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
  todoCount,
} from "@/lib/status";
import { Btn, EmptyState, Field } from "@/components/ui-bits";
import { useSettings } from "@/lib/settings";

export function InboxView({
  spaces,
  onChanged,
  onOpenTask,
}: {
  spaces: Space[];
  onChanged: () => void;
  onOpenTask: (spaceId: string, projectId: string, taskId: string) => void;
}) {
  const da = getFullDataAccess();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [capture, setCapture] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<
    Record<string, { spaceId: string; projectId: string }>
  >({});
  const [armed, setArmed] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setItems(await da.listInbox());
  }, [da]);
  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await reload();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (items === null) {
    return <div className="px-6 py-6 text-small text-text-dim">加载中…</div>;
  }

  return (
    <div className="fade-rise mx-auto flex h-full min-h-0 max-w-2xl flex-col gap-3 px-6 py-6">
      <div className="mb-1">
        <h1 className="text-title font-semibold tracking-tight">收件箱</h1>
        <p className="mt-0.5 text-small text-text-dim">
          快速捕获的零散思路，回头转成某个项目里的任务。全局 Ctrl+Shift+Space 随时唤起。
        </p>
      </div>

      <div className="rounded-xl bg-bg-elevated p-3 shadow-[var(--shadow-border)]">
        <textarea
          autoFocus
          rows={3}
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              const text = capture.trim();
              if (!text) return;
              void run(async () => {
                await da.captureInbox(text);
                setCapture("");
              });
            } else if (e.key === "Escape") {
              e.preventDefault();
              setCapture("");
            }
          }}
          placeholder="想到什么就丢进来… Ctrl + Enter 捕获"
          className="w-full resize-none rounded-lg bg-bg-sunken px-2.5 py-2 text-ui leading-relaxed placeholder:text-text-subtle focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
        />
        <div className="mt-2 flex justify-end">
          <Btn
            variant="primary"
            disabled={busy || !capture.trim()}
            onClick={() =>
              void run(async () => {
                await da.captureInbox(capture.trim());
                setCapture("");
              })
            }
          >
            捕获
          </Btn>
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-8 text-center text-small text-text-dim">
            收件箱是空的。想到什么，随手记一条。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const t = target[item.id];
              const space = spaces.find((s) => s.id === t?.spaceId);
              const projects = space?.projects ?? [];
              const canPromote = Boolean(
                t?.spaceId && t?.projectId && projects.some((p) => p.id === t.projectId),
              );
              return (
                <li
                  key={item.id}
                  className="group rounded-xl bg-bg-elevated px-3 py-2.5 shadow-[var(--shadow-border)]"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-micro text-text-subtle">
                      {item.created}
                    </span>
                    <button
                      type="button"
                      className={cn(
                        "text-micro",
                        armed === item.id
                          ? "font-medium text-st-dropped"
                          : "text-text-dim opacity-0 hover:text-text focus-visible:opacity-100 group-hover:opacity-100",
                      )}
                      onClick={() => {
                        if (armed === item.id) {
                          void run(() => da.deleteInboxItem(item.id));
                        } else {
                          setArmed(item.id);
                        }
                      }}
                    >
                      {armed === item.id ? "确认删除？" : "删除"}
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-ui leading-relaxed text-pretty">
                    {item.text}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {t ? (
                      <>
                        <select
                          value={t.spaceId}
                          onChange={(e) =>
                            setTarget((prev) => ({
                              ...prev,
                              [item.id]: { spaceId: e.target.value, projectId: "" },
                            }))
                          }
                          className="h-7 rounded-md bg-bg-sunken px-1.5 text-small focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
                        >
                          {spaces.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={t.projectId}
                          onChange={(e) =>
                            setTarget((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], projectId: e.target.value },
                            }))
                          }
                          className="h-7 rounded-md bg-bg-sunken px-1.5 text-small focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
                        >
                          <option value="">选项目…</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <Btn
                          variant="primary"
                          disabled={!canPromote || busy}
                          onClick={() =>
                            void run(async () => {
                              const task = await da.promoteInbox(
                                item.id,
                                t.spaceId,
                                t.projectId,
                              );
                              setTarget((prev) => {
                                const next = { ...prev };
                                delete next[item.id];
                                return next;
                              });
                              onOpenTask(t.spaceId, t.projectId, task.id);
                            })
                          }
                        >
                          转为任务
                        </Btn>
                        <Btn
                          onClick={() =>
                            setTarget((prev) => {
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            })
                          }
                        >
                          取消
                        </Btn>
                      </>
                    ) : (
                      <Btn
                        disabled={spaces.length === 0}
                        title={spaces.length === 0 ? "先创建空间与项目" : undefined}
                        onClick={() =>
                          setTarget((prev) => ({
                            ...prev,
                            [item.id]: { spaceId: spaces[0]?.id ?? "", projectId: "" },
                          }))
                        }
                      >
                        转为任务…
                      </Btn>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function NothingSelected() {
  return (
    <EmptyState
      title="未选择内容"
      hint="在左侧选择一个空间查看总览，或打开项目开始整理任务。"
    />
  );
}

export function SpaceOverview({
  space,
  onOpenProject,
}: {
  space: Space;
  onOpenProject: (projectId: string) => void;
}) {
  const dateFormat = useSettings((s) => s.dateFormat);
  const showArchived = useSettings((s) => s.showArchived);
  const visibleProjects = space.projects.filter(
    (p) => showArchived || !p.archived,
  );
  if (visibleProjects.length === 0) {
    return (
      <EmptyState
        title={`「${space.name}」还没有项目`}
        hint="将鼠标移到左侧空间名称上，点 + 即可新建项目。"
      />
    );
  }

  return (
    <div className="fade-rise rt-page px-6 py-6">
      <div className="mb-4">
        <h1 className="text-title font-semibold tracking-tight">{space.name}</h1>
        <p className="mt-1 text-small text-text-dim">
          {space.projects.length} 个项目
        </p>
      </div>
      <div className="grid gap-2">
        {visibleProjects.map((project) => {
          const doing = doingCount(project.tasks);
          const todo = todoCount(project.tasks);
          const updated = latestUpdated(project.tasks);
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onOpenProject(project.id)}
              className={cn(
                "flex items-center gap-4 rounded-xl bg-bg-elevated px-4 py-3 text-left shadow-[var(--shadow-border)] transition-shadow duration-150 hover:shadow-[var(--shadow-border-hover)] active:scale-[0.99]",
                project.archived && "opacity-55",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{project.name}</div>
                <div className="mt-0.5 text-small text-text-dim">
                  {project.archived ? "已归档 · " : ""}进行中 {doing} · 待办 {todo}
                </div>
              </div>
              <div className="shrink-0 font-mono text-micro text-text-subtle">
                {updated ? formatShortDate(updated, dateFormat) : "尚无任务"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TaskList({
  project,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
}: {
  project: Project;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onCreateTask: (title: string, next?: string) => Promise<void>;
}) {
  const collapseDone = useSettings((s) => s.collapseDone);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<TaskStatus, boolean>>({
    todo: false,
    doing: false,
    hold: false,
    done: collapseDone,
    dropped: collapseDone,
  });

  const groups = useMemo(() => groupTasks(project.tasks), [project.tasks]);

  useEffect(() => {
    setCollapsed({
      todo: false,
      doing: false,
      hold: false,
      done: collapseDone,
      dropped: collapseDone,
    });
  }, [project.id, collapseDone]);

  if (project.tasks.length === 0 && !creating) {
    return (
      <EmptyState
        title="这个项目还没有任务"
        hint="把一件具体要做的事写下来，下一步动作可以稍后补。"
        action={
          <Btn variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" />
            新任务
          </Btn>
        }
      />
    );
  }

  return (
    <div className="fade-rise rt-page px-4 py-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <Btn
          className="justify-start gap-1.5 px-2"
          onClick={() => setCreating(true)}
        >
          <Plus className="size-3.5" />
          新任务
        </Btn>
      </div>

      {creating ? (
        <NewTaskForm
          onCancel={() => setCreating(false)}
          onSubmit={async (title, next) => {
            await onCreateTask(title, next);
            setCreating(false);
          }}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {STATUS_ORDER.map((status) => {
          const items = groups[status];
          if (items.length === 0) return null;
          const isCollapsed = collapsed[status];
          return (
            <section key={status}>
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }))
                }
                className="mb-1 flex h-7 w-full items-center gap-1.5 rounded-md px-1 text-left"
              >
                {isCollapsed ? (
                  <ChevronRight className="size-3.5 text-text-subtle" />
                ) : (
                  <ChevronDown className="size-3.5 text-text-subtle" />
                )}
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: STATUS_COLOR[status] }}
                />
                <span className="text-small font-medium text-text-dim">
                  {STATUS_LABEL[status]}
                  {status === "done" ? " ✓" : ""}
                  <span className="tabular-nums"> · {items.length}</span>
                </span>
              </button>
              {isCollapsed ? null : (
                <ul className="flex flex-col gap-0.5">
                  {items.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={task.id === selectedTaskId}
                      onSelect={() => onSelectTask(task.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
}) {
  const dateFormat = useSettings((s) => s.dateFormat);
  const showNext = useSettings((s) => s.showNextInList);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-150",
          selected ? "bg-accent/15" : "hover:bg-bg-hover",
        )}
      >
        <Star
          className={cn(
            "mt-0.5 size-3.5 shrink-0",
            task.star ? "fill-star text-star" : "text-transparent",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-medium",
              task.status === "dropped" && "strike-title text-text-dim",
            )}
          >
            {task.title}
          </span>
          {showNext && task.next ? (
            <span className="mt-0.5 block truncate text-small text-text-dim">
              → {task.next}
            </span>
          ) : null}
        </span>
        <span className="mt-px shrink-0 font-mono text-micro text-text-subtle">
          {formatShortDate(task.updated, dateFormat)}
        </span>
      </button>
    </li>
  );
}

function NewTaskForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string, next?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  async function commit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(title.trim(), next.trim() || undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl bg-bg-elevated p-3 shadow-[var(--shadow-border)]">
      <Field
        autoFocus
        placeholder="任务标题（必填）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <Field
        className="mt-2"
        placeholder="下一步动作（可选）"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="mt-2 flex justify-end gap-1">
        <Btn onClick={onCancel}>取消</Btn>
        <Btn variant="primary" disabled={!title.trim() || busy} onClick={() => void commit()}>
          创建
        </Btn>
      </div>
    </div>
  );
}

export function ProjectContext({
  project,
  onSave,
  onSetArchived,
}: {
  project: Project;
  onSave: (description: string) => Promise<void>;
  onSetArchived?: (archived: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState(project.description);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [archiveArmed, setArchiveArmed] = useState(false);

  useEffect(() => {
    setDraft(project.description);
    setMode("edit");
  }, [project.id, project.description]);

  const dirty = draft !== project.description;
  const html = useMemo(() => renderMarkdown(draft), [draft]);

  const setContextDirty = useEditorDirty((s) => s.setContext);
  useEffect(() => {
    setContextDirty(dirty);
    return () => setContextDirty(false);
  }, [dirty, setContextDirty]);

  useEffect(() => {
    if (!archiveArmed) return;
    const t = window.setTimeout(() => setArchiveArmed(false), 6000);
    return () => window.clearTimeout(t);
  }, [archiveArmed]);

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-rise flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2">
        <div className="flex rounded-md bg-bg-elevated p-0.5 shadow-[var(--shadow-border)]">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={cn(
              "h-6 rounded px-2.5 text-micro font-medium",
              mode === "edit" ? "bg-bg-hover text-text" : "text-text-dim",
            )}
          >
            编辑
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cn(
              "h-6 rounded px-2.5 text-micro font-medium",
              mode === "preview" ? "bg-bg-hover text-text" : "text-text-dim",
            )}
          >
            预览
          </button>
        </div>
        {project.archived ? (
          <span className="rounded bg-bg-hover px-1.5 py-0.5 text-micro text-text-dim">
            已归档
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {onSetArchived ? (
            <Btn
              variant={archiveArmed ? "danger" : "quiet"}
              className="text-micro"
              disabled={busy}
              title="归档后项目从侧栏与今日视角隐藏，可随时取消归档找回。"
              onClick={() => {
                if (archiveArmed) {
                  setArchiveArmed(false);
                  void onSetArchived(!project.archived);
                } else {
                  setArchiveArmed(true);
                }
              }}
            >
              {project.archived
                ? archiveArmed
                  ? "确认取消归档？"
                  : "取消归档"
                : archiveArmed
                  ? "确认归档？"
                  : "归档"}
            </Btn>
          ) : null}
          {dirty ? <span className="dirty-dot" title="未保存" /> : null}
          <Btn
            variant={dirty ? "primary" : "ghost"}
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            保存
          </Btn>
        </div>
      </div>
      {mode === "edit" ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(project.description);
            }
          }}
          spellCheck={false}
          placeholder="用 Markdown 写下项目的整体上下文：目标、约定、还没写进任务里的背景。"
          className="scrollbar-thin min-h-0 flex-1 bg-transparent px-5 py-4 font-mono text-small leading-relaxed text-text placeholder:text-text-subtle focus-visible:outline-none"
        />
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-5 py-4">
          {draft.trim() ? (
            <div
              className="md-preview max-w-2xl text-ui text-text"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-small text-text-dim">暂无项目上下文</p>
          )}
        </div>
      )}
    </div>
  );
}
