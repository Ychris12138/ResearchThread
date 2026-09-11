import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalConflictError,
  getFullDataAccess,
  getStorage,
  type Space,
  type WeeklyDoc,
} from "@/dataAccess";
import { todayISO } from "@/lib/format";
import { useEditorDirty } from "@/lib/editorState";
import { weeklyFileId } from "@/storage/core";
import { cn } from "@/lib/cn";
import { renderMarkdown } from "@/lib/markdown";
import { sortTasks, STATUS_COLOR } from "@/lib/status";
import { Btn, EmptyState } from "@/components/ui-bits";
import { IconGraph, IconToday, IconWeekly } from "@/components/icons";

/** 今日视角（M2④）：手写第一页的数字化——按空间分组列出活跃工作线，☆ 置顶。 */
export function TodayView({
  spaces,
  onOpenTask,
}: {
  spaces: Space[];
  onOpenTask: (spaceId: string, projectId: string, taskId: string) => void;
}) {
  const sections = spaces
    .map((space) => ({
      space,
      rows: space.projects
        .filter((project) => !project.archived)
        .flatMap((project) =>
          sortTasks(
            project.tasks.filter(
              (t) => t.status === "doing" || t.status === "todo" || t.status === "hold",
            ),
          ).map((task) => ({ project, task })),
        ),
    }))
    .filter((s) => s.rows.length > 0);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div className="fade-rise rt-page px-6 py-6">
      <div className="mb-1 flex items-center gap-2">
        <IconToday className="text-accent" />
        <h1 className="text-title font-semibold tracking-tight">今日</h1>
        <span className="text-small text-text-dim tabular-nums">
          {total} 条活跃工作线
        </span>
      </div>
      <p className="mb-5 text-small text-text-dim">
        手写第一页的数字化：按空间分组列出进行中 / 待办 / 搁置的工作线，☆ 置顶。
      </p>
      {total === 0 ? (
        <EmptyState
          title="今天没有活跃的工作线"
          hint="打开一个项目，写下下一步动作，它就会出现在这里。"
        />
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(({ space, rows }) => (
            <section key={space.id}>
              <h2 className="mb-1.5 text-small font-semibold tracking-wide text-text-dim">
                {space.name}
                <span className="ml-1.5 font-normal text-text-subtle tabular-nums">
                  {rows.length}
                </span>
              </h2>
              <ul className="flex flex-col">
                {rows.map(({ project, task }) => (
                  <li key={`${space.id}/${project.id}/${task.id}`}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(space.id, project.id, task.id)}
                      className="flex w-full items-start gap-2.5 rounded-lg border-b border-border-subtle px-2 py-2 text-left hover:bg-bg-hover"
                    >
                      <span
                        className={cn(
                          "mt-0.5 w-3.5 shrink-0 text-center text-small",
                          task.star ? "text-star" : "text-transparent",
                        )}
                        aria-hidden="true"
                      >
                        ☆
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate font-medium",
                            task.status === "hold" && "text-text-dim",
                          )}
                        >
                          {task.title}
                        </span>
                        {task.next ? (
                          <span className="mt-0.5 block truncate text-small text-text-dim">
                            → {task.next}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex shrink-0 items-center gap-1.5 text-micro text-text-subtle">
                        <span className="max-w-32 truncate">{project.name}</span>
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: STATUS_COLOR[task.status] }}
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** 周文档（M3）：一键生成确定性骨架（本周动态 / 活跃工作线 / 需要关注 / 搁置 / 放弃）。 */
export function WeeklyView() {
  const da = getFullDataAccess();
  const [docs, setDocs] = useState<WeeklyDoc[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [overwriteArmed, setOverwriteArmed] = useState(false); // 重新生成覆盖确认
  const [saveArmed, setSaveArmed] = useState(false); // 外部修改覆盖保存确认

  const reload = useCallback(
    async (keepId?: string | null) => {
      const list = await da.listWeekly();
      setDocs(list);
      const target = keepId ?? list[0]?.id ?? null;
      setSelectedId(target);
      setContent(target ? ((await da.getWeekly(target)) ?? "") : "");
      setDraft(null);
    },
    [da],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const dirty = draft !== null && draft !== content;

  // 脏状态上报全局（未保存草稿退出保护 + watcher 刷新策略）
  const setWeeklyDirty = useEditorDirty((s) => s.setWeekly);
  useEffect(() => {
    setWeeklyDirty(dirty);
    return () => setWeeklyDirty(false);
  }, [dirty, setWeeklyDirty]);

  // 覆盖确认 3 秒后自动解除
  useEffect(() => {
    if (!overwriteArmed) return;
    const t = window.setTimeout(() => setOverwriteArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [overwriteArmed]);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      setErr(null);
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const selectDocs = useMemo(
    () =>
      (docs ?? []).map((d) => (
        <option key={d.id} value={d.id}>
          {d.id.replace(/\.md$/, "")}
        </option>
      )),
    [docs],
  );

  // 本周已生成过 → 重新生成会覆盖手工修改，需二次确认
  const currentWeekFileId = `${weeklyFileId(todayISO())}.md`;

  async function generate() {
    await run(async () => {
      const existsNow = (docs ?? []).some((d) => d.id === currentWeekFileId);
      if (existsNow && !overwriteArmed) {
        setOverwriteArmed(true);
        return;
      }
      setOverwriteArmed(false);
      const doc = await da.generateWeekly();
      await reload(doc.id);
    });
  }

  async function save() {
    if (!selectedId || draft === null) return;
    await run(async () => {
      try {
        await da.saveWeekly(selectedId, draft);
      } catch (e) {
        if (e instanceof ExternalConflictError) {
          if (!saveArmed) {
            setSaveArmed(true);
            setErr("周文档已被外部修改——再次点「保存」将覆盖外部修改（或「放弃」后重新加载）。");
            return;
          }
          const st = getStorage();
          if (st) await st.acknowledgeExternalChange(`weekly/${selectedId}`);
          await da.saveWeekly(selectedId, draft);
        } else {
          throw e;
        }
      }
      setSaveArmed(false);
      setContent(draft);
      setDraft(null);
    });
  }

  return (
    <div className="fade-rise mx-auto flex h-full min-h-0 max-w-3xl flex-col px-6 py-6">
      <div className="mb-3 flex items-center gap-2">
        <IconWeekly className="text-accent" />
        <h1 className="text-title font-semibold tracking-tight">周文档</h1>
        <div className="ml-auto flex items-center gap-2">
          <Btn
            variant={overwriteArmed ? "danger" : "primary"}
            disabled={busy}
            onClick={() => void generate()}
          >
            {overwriteArmed ? "覆盖本周（确认）" : "生成本周周报"}
          </Btn>
        </div>
      </div>
      <p className="mb-3 text-small text-text-dim">
        一键生成确定性骨架：本周动态、活跃工作线、滞留与积压提醒、搁置 / 放弃清单。
        同一周重新生成会覆盖手工修改，需再次点击确认。
      </p>

      {err ? (
        <p className="mb-2 flex items-center gap-2 rounded-md bg-bg-sunken px-3 py-1.5 text-micro text-text-dim">
          <span className="min-w-0 break-all">{err}</span>
          <button
            type="button"
            className="ml-auto shrink-0 hover:text-text"
            onClick={() => setErr(null)}
          >
            关闭
          </button>
        </p>
      ) : null}

      {docs !== null && docs.length > 0 ? (
        <div className="mb-2 flex items-center gap-2">
          <select
            value={selectedId ?? ""}
            onChange={(e) =>
              void run(async () => {
                setSelectedId(e.target.value);
                setContent(await da.getWeekly(e.target.value));
                setDraft(null);
                setMode("preview");
              })
            }
            className="h-7 rounded-md bg-bg-sunken px-1.5 text-small focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
          >
            {selectDocs}
          </select>
          <div className="flex rounded-md bg-bg-sunken p-0.5">
            {(["preview", "source"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  if (m === "source") setDraft(content);
                }}
                className={cn(
                  "h-6 rounded px-2.5 text-micro font-medium",
                  mode === m ? "bg-bg-elevated text-text shadow-[var(--shadow-border)]" : "text-text-dim",
                )}
              >
                {m === "preview" ? "预览" : "源码"}
              </button>
            ))}
          </div>
          {mode === "source" && draft !== null ? (
            <>
              {dirty ? <span className="dirty-dot" title="未保存" /> : null}
              <Btn
                variant={dirty ? (saveArmed ? "danger" : "primary") : "ghost"}
                disabled={!dirty || busy}
                onClick={() => void save()}
              >
                {saveArmed ? "覆盖保存（确认）" : "保存"}
              </Btn>
              <Btn
                disabled={!dirty || busy}
                onClick={() => {
                  setDraft(content);
                  setSaveArmed(false);
                }}
              >
                放弃
              </Btn>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-xl bg-bg-elevated px-5 py-4 shadow-[var(--shadow-border)]">
        {docs === null ? (
          <p className="text-small text-text-dim">加载中…</p>
        ) : docs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="还没有周文档"
              hint="点右上角「生成本周周报」，应用会从活动日志和项目地图汇总一份骨架。"
            />
          </div>
        ) : selectedId === null ? (
          <p className="text-small text-text-dim">选择一篇周文档查看。</p>
        ) : mode === "source" && draft !== null ? (
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaveArmed(false);
            }}
            spellCheck={false}
            className="scrollbar-thin h-full min-h-0 w-full resize-none bg-transparent font-mono text-small leading-relaxed text-text focus-visible:outline-none"
          />
        ) : (
          <div
            className="md-preview max-w-2xl text-ui text-text"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}
      </div>
    </div>
  );
}

export function GraphView({ spaces }: { spaces: Space[] }) {
  const cols = Math.max(spaces.length, 1);
  const width = 80 + cols * 280;
  const maxProjects = Math.max(1, ...spaces.map((s) => s.projects.length));
  const height = 160 + maxProjects * 88;

  return (
    <div className="fade-rise flex h-full min-h-0 flex-col px-6 py-5">
      <div className="mb-1 flex items-center gap-2">
        <IconGraph className="text-accent" />
        <h1 className="text-title font-semibold tracking-tight">图谱</h1>
      </div>
      <p className="mb-4 text-small text-text-dim">
        现在画出空间 → 项目 → 任务的层级骨架。任务之间的弱链接会在 M2 接上。
      </p>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto rounded-xl bg-bg-sunken px-2 py-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mx-auto block"
          style={{ width: Math.min(width, 920), height: Math.min(height, 520) }}
          role="img"
          aria-label="空间与项目图谱"
        >
          {spaces.map((space, si) => {
            const sx = 80 + si * 280;
            const sy = 48;
            return (
              <g key={space.id}>
                {space.projects.map((project, pi) => {
                  const px = sx;
                  const py = 150 + pi * 88;
                  const dots = project.tasks.slice(0, 6);
                  return (
                    <g key={project.id}>
                      <line className="graph-edge" x1={sx} y1={sy + 18} x2={px} y2={py - 18} />
                      <rect
                        className="graph-node"
                        x={px - 70}
                        y={py - 18}
                        width={140}
                        height={36}
                        rx={10}
                      />
                      <text className="graph-label" x={px} y={py + 4} textAnchor="middle">
                        {truncate(project.name, 10)}
                      </text>
                      {dots.map((task, di) => (
                        <circle
                          key={task.id}
                          className={cn("graph-dot", !task.star && "opacity-40")}
                          cx={px - 28 + di * 12}
                          cy={py + 28}
                          r={3}
                        />
                      ))}
                    </g>
                  );
                })}
                <rect
                  className="graph-node is-space"
                  x={sx - 58}
                  y={sy - 18}
                  width={116}
                  height={36}
                  rx={10}
                />
                <text className="graph-label" x={sx} y={sy + 4} textAnchor="middle">
                  {space.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
