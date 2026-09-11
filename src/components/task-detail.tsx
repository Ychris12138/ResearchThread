import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import type { Task, TaskStatus } from "@/dataAccess";
import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
import { STATUS_FORM_ORDER, STATUS_LABEL } from "@/lib/status";
import { useEditorDirty } from "@/lib/editorState";
import { Btn, EmptyState, Field } from "@/components/ui-bits";
import { useSettings } from "@/lib/settings";

export function TaskDetail({
  task,
  onPatchMeta,
  onSaveText,
  onAppend,
  onUpdateEntry,
  onDelete,
}: {
  task: Task | null;
  onPatchMeta: (patch: { status?: TaskStatus; star?: boolean }) => Promise<void>;
  onSaveText: (title: string, next: string) => Promise<void>;
  onAppend: (text: string) => Promise<void>;
  onUpdateEntry: (index: number, text: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  if (!task) {
    return (
      <EmptyState
        title="未选择任务"
        hint="在中间列表点一项，细节与上下文日志会显示在这里。"
      />
    );
  }

  return (
    <TaskDetailInner
      key={task.id}
      task={task}
      onPatchMeta={onPatchMeta}
      onSaveText={onSaveText}
      onAppend={onAppend}
      onUpdateEntry={onUpdateEntry}
      onDelete={onDelete}
    />
  );
}

function TaskDetailInner({
  task,
  onPatchMeta,
  onSaveText,
  onAppend,
  onUpdateEntry,
  onDelete,
}: {
  task: Task;
  onPatchMeta: (patch: { status?: TaskStatus; star?: boolean }) => Promise<void>;
  onSaveText: (title: string, next: string) => Promise<void>;
  onAppend: (text: string) => Promise<void>;
  onUpdateEntry: (index: number, text: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [next, setNext] = useState(task.next);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const logOrder = useSettings((s) => s.logOrder);
  const confirmDelete = useSettings((s) => s.confirmDelete);
  const dateFormat = useSettings((s) => s.dateFormat);

  useEffect(() => {
    setTitle(task.title);
    setNext(task.next);
  }, [task.title, task.next, task.updated]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = logOrder === "desc" ? 0 : el.scrollHeight;
  }, [task.id, task.entries.length, logOrder]);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const dirty = title.trim() !== task.title || next !== task.next;
  const listed = task.entries.map((entry, index) => ({ entry, index }));
  if (logOrder === "desc") listed.reverse();

  // 脏状态上报给 watcher 刷新策略（脏 → 外部变更出横幅，不静默覆盖）
  const setDetailDirty = useEditorDirty((s) => s.setDetail);
  useEffect(() => {
    setDetailDirty(dirty);
    return () => setDetailDirty(false);
  }, [dirty, setDetailDirty]);

  async function saveText() {
    if (!dirty || busy) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onSaveText(trimmed, next);
    } finally {
      setBusy(false);
    }
  }

  function onTextKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void saveText();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTitle(task.title);
      setNext(task.next);
    }
  }

  async function append() {
    const text = note.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onAppend(text);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (confirmDelete && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-subtle px-4 py-3">
        <Field
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onTextKeyDown}
          aria-label="标题"
        />

        <div className="mt-3 overflow-hidden rounded-xl bg-bg-elevated shadow-[var(--shadow-border)]">
          <label className="flex h-9 items-center gap-3 border-b border-border-subtle px-3">
            <span className="w-16 shrink-0 text-small text-text-dim">状态</span>
            <select
              className="h-8 min-w-0 flex-1 bg-transparent text-ui focus-visible:outline-none"
              value={task.status}
              onChange={(e) => void onPatchMeta({ status: e.target.value as TaskStatus })}
            >
              {STATUS_FORM_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex h-9 items-center gap-3 border-b border-border-subtle px-3">
            <span className="w-16 shrink-0 text-small text-text-dim">重点</span>
            <button
              type="button"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md px-2 text-ui",
                task.star ? "text-star" : "text-text-dim hover:text-text",
              )}
              onClick={() => void onPatchMeta({ star: !task.star })}
              aria-pressed={task.star}
              aria-label={task.star ? "取消重点" : "标为重点"}
            >
              <Star className={cn("size-3.5", task.star && "fill-star")} />
              {task.star ? "重点" : "标记"}
            </button>
          </div>
          <label className="flex items-center gap-3 px-3 py-1.5">
            <span className="w-16 shrink-0 text-small text-text-dim">下一步</span>
            <input
              value={next}
              onChange={(e) => setNext(e.target.value)}
              onKeyDown={onTextKeyDown}
              placeholder="下一步动作"
              className="h-8 min-w-0 flex-1 bg-transparent text-ui placeholder:text-text-subtle focus-visible:outline-none"
            />
          </label>
        </div>

        <div className="mt-2 flex items-start justify-between gap-2">
          <p className="min-w-0 break-all font-mono text-micro leading-relaxed text-text-subtle">
            {task.id}
            <br />
            创建 {task.created} · 更新 {task.updated}
          </p>
          {dirty ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="dirty-dot" />
              <Btn
                onClick={() => {
                  setTitle(task.title);
                  setNext(task.next);
                }}
              >
                放弃
              </Btn>
              <Btn variant="primary" disabled={busy || !title.trim()} onClick={() => void saveText()}>
                保存
              </Btn>
            </div>
          ) : null}
        </div>
      </div>

      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 text-micro font-medium tracking-wide text-text-subtle">
          上下文日志
        </div>
        {task.entries.length === 0 ? (
          <p className="py-6 text-center text-small text-text-dim">
            还没有条目。把「为什么做、卡在哪」记在下面。
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {listed.map(({ entry, index }) => (
              <EntryItem
                key={`${entry.date}-${index}`}
                date={formatShortDate(entry.date, dateFormat)}
                author={entry.author}
                text={entry.text}
                onSave={
                  entry.author === "me"
                    ? (text) => onUpdateEntry(index, text)
                    : undefined
                }
              />
            ))}
          </ol>
        )}
      </div>

      <div className="shrink-0 border-t border-border-subtle p-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void append();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setNote("");
            }
          }}
          rows={3}
          placeholder="追加一条上下文… ⌘/Ctrl + Enter"
          className="w-full rounded-lg bg-bg-sunken px-2.5 py-2 text-ui leading-relaxed shadow-[var(--shadow-border)] placeholder:text-text-subtle focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
        />
        <div className="mt-2 flex items-center justify-between">
          <Btn
            variant={armed ? "danger" : "quiet"}
            disabled={busy}
            onClick={() => void handleDelete()}
            className="px-1 text-micro"
          >
            {armed ? "确认删除？" : "删除任务"}
          </Btn>
          <Btn variant="primary" disabled={busy || !note.trim()} onClick={() => void append()}>
            追加
          </Btn>
        </div>
      </div>
    </div>
  );
}

function EntryItem({
  date,
  author,
  text,
  onSave,
}: {
  date: string;
  author: "me" | "agent";
  text: string;
  onSave?: (text: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    setDraft(text);
    setEditing(false);
  }, [text]);

  const readonly = !onSave;

  async function save() {
    if (!onSave) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === text) {
      setDraft(text);
      setEditing(false);
      return;
    }
    await onSave(trimmed);
    setEditing(false);
  }

  return (
    <li
      className={cn(
        "group rounded-lg px-3 py-2",
        readonly ? "entry-agent" : "bg-bg-elevated/60",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-micro text-text-subtle">
          {date} · {author === "me" ? "我" : "agent"}
        </span>
        {readonly || editing ? null : (
          <button
            type="button"
            className="text-micro text-text-dim opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-text"
            onClick={() => setEditing(true)}
          >
            编辑
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(text);
                setEditing(false);
              }
            }}
            rows={4}
            className="w-full rounded-md bg-bg-sunken px-2 py-1.5 text-ui leading-relaxed focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
          />
          <div className="mt-1.5 flex justify-end gap-1">
            <Btn
              onClick={() => {
                setDraft(text);
                setEditing(false);
              }}
            >
              取消
            </Btn>
            <Btn variant="primary" onClick={() => void save()}>
              保存
            </Btn>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-ui leading-relaxed text-pretty">{text}</p>
      )}
    </li>
  );
}
