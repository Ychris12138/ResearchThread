// components/search-view.tsx — 全文搜索（M3）：内存字符串匹配，
// 覆盖任务（标题 / 下一步 / 上下文条目）、项目（名称 / 描述）、收件箱。
// 已归档项目默认排除。匹配逻辑在 lib/search.ts（纯函数，可单测）。

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getFullDataAccess, type Space } from "@/dataAccess";
import { cn } from "@/lib/cn";
import { searchAll, type SearchHit } from "@/lib/search";
import { Field } from "@/components/ui-bits";

export function SearchView({
  spaces,
  onOpenTask,
  onOpenProject,
}: {
  spaces: Space[];
  onOpenTask: (spaceId: string, projectId: string, taskId: string) => void;
  onOpenProject: (spaceId: string, projectId: string) => void;
}) {
  const da = getFullDataAccess();
  const [query, setQuery] = useState("");
  const [inbox, setInbox] = useState<Awaited<ReturnType<typeof da.listInbox>>>([]);

  useEffect(() => {
    void da.listInbox().then(setInbox).catch(() => setInbox([]));
  }, [da]);

  const hits = useMemo(
    () => searchAll(spaces, inbox, query),
    [spaces, inbox, query],
  );

  function open(hit: SearchHit) {
    if (hit.kind === "任务" && hit.spaceId && hit.projectId && hit.taskId) {
      onOpenTask(hit.spaceId, hit.projectId, hit.taskId);
    } else if (hit.kind === "项目" && hit.spaceId && hit.projectId) {
      onOpenProject(hit.spaceId, hit.projectId);
    }
  }

  return (
    <div className="fade-rise mx-auto flex h-full min-h-0 max-w-2xl flex-col px-6 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Search className="size-4 text-accent" />
        <h1 className="text-title font-semibold tracking-tight">搜索</h1>
      </div>
      <Field
        autoFocus
        placeholder="搜任务、上下文日志、项目、收件箱…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
          }
        }}
      />
      <div className="scrollbar-thin mt-3 min-h-0 flex-1 overflow-y-auto">
        {!query.trim() ? (
          <p className="py-8 text-center text-small text-text-dim">
            输入关键词开始检索（内存匹配，已归档项目不参与）。
          </p>
        ) : hits.length === 0 ? (
          <p className="py-8 text-center text-small text-text-dim">
            没有匹配「{query}」的内容。
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {hits.map((hit, i) => (
              <li key={`${hit.kind}-${i}`}>
                <button
                  type="button"
                  disabled={hit.kind === "收件箱"}
                  onClick={() => open(hit)}
                  className={cn(
                    "w-full rounded-xl bg-bg-elevated px-3 py-2.5 text-left shadow-[var(--shadow-border)]",
                    hit.kind === "收件箱" ? "cursor-default" : "hover:shadow-[var(--shadow-border-hover)]",
                  )}
                >
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="rounded bg-bg-hover px-1.5 py-0.5 text-micro font-medium text-text-dim">
                      {hit.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{hit.title}</span>
                    <span className="shrink-0 font-mono text-micro text-text-subtle">{hit.path}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-small leading-relaxed text-text-dim">
                    {hit.snippet}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
