import { PanelLeftClose, Plus } from "lucide-react";
import type { Space } from "@/dataAccess";
import { cn } from "@/lib/cn";
import { doingCount } from "@/lib/status";
import { Btn, InlineInput } from "@/components/ui-bits";
import type { Selection } from "@/components/selection";
import { useSettings } from "@/lib/settings";
import { useState } from "react";

export function Sidebar({
  spaces,
  selection,
  collapsedSpaces,
  onSelectSpace,
  onSelectProject,
  onToggleSpace,
  onCreateSpace,
  onCreateProject,
  onCollapse,
}: {
  spaces: Space[];
  selection: Selection;
  collapsedSpaces: Record<string, boolean>;
  onSelectSpace: (spaceId: string) => void;
  onSelectProject: (spaceId: string, projectId: string) => void;
  onToggleSpace: (spaceId: string) => void;
  onCreateSpace: (name: string) => Promise<void>;
  onCreateProject: (spaceId: string, name: string) => Promise<void>;
  onCollapse?: () => void;
}) {
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const chrome = useSettings((s) => s.windowChrome);
  const showArchived = useSettings((s) => s.showArchived);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        {chrome ? (
          <div className="traffic-cluster flex items-center gap-2 pr-1" aria-hidden="true">
            <span className="traffic traffic-close" />
            <span className="traffic traffic-min" />
            <span className="traffic traffic-max" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-small font-semibold tracking-tight">
            文件
          </div>
          <div className="truncate text-micro text-text-subtle">空间 / 项目</div>
        </div>
        {onCollapse ? (
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md text-text-dim hover:bg-bg-hover hover:text-text"
            aria-label="收起文件树"
            title="收起 ⌘B"
            onClick={onCollapse}
          >
            <PanelLeftClose className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="px-2 pb-1">
        <Btn
          className="h-7 w-full justify-start gap-1.5 px-2 text-text-dim"
          onClick={() => {
            setCreatingIn(null);
            setCreatingSpace(true);
          }}
        >
          <Plus className="size-3.5" strokeWidth={2} />
          空间
        </Btn>
      </div>

      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {creatingSpace ? (
          <div className="px-1 py-1">
            <InlineInput
              placeholder="新空间名称"
              onSubmit={async (name) => {
                await onCreateSpace(name);
                setCreatingSpace(false);
              }}
              onCancel={() => setCreatingSpace(false)}
            />
          </div>
        ) : null}

        {spaces.length === 0 && !creatingSpace ? (
          <p className="px-2 py-6 text-center text-small text-text-dim">
            还没有空间。点上方「空间」开始。
          </p>
        ) : null}

        {spaces.map((space) => {
          const collapsed = Boolean(collapsedSpaces[space.id]);
          const spaceSelected =
            !selection.inbox &&
            selection.spaceId === space.id &&
            !selection.projectId;
          return (
            <div key={space.id} className="mb-0.5">
              <div
                className={cn(
                  "tree-row group flex items-center gap-0.5 rounded-md pr-1",
                  spaceSelected && "bg-accent/20",
                  !spaceSelected && "hover:bg-bg-hover",
                )}
              >
                <button
                  type="button"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-text-dim hover:text-text"
                  aria-label={collapsed ? "展开空间" : "折叠空间"}
                  onClick={() => onToggleSpace(space.id)}
                >
                  {collapsed ? (
                    <span className="text-micro text-text-subtle">▸</span>
                  ) : (
                    <span className="text-micro text-text-subtle">▾</span>
                  )}
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-ui font-medium text-text"
                  onClick={() => onSelectSpace(space.id)}
                >
                  {space.name}
                </button>
                <button
                  type="button"
                  className="grid size-6 shrink-0 place-items-center rounded-md text-text-dim opacity-0 hover:bg-bg-elevated hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="在此空间新建项目"
                  onClick={() => {
                    setCreatingSpace(false);
                    setCreatingIn(space.id);
                    if (collapsed) onToggleSpace(space.id);
                  }}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>

              <div className={cn("tree-kids", !collapsed && "open")}>
                <div className="tree-kids-inner">
                  {creatingIn === space.id ? (
                    <div className="py-0.5 pl-7 pr-1">
                      <InlineInput
                        placeholder="新项目名称"
                        onSubmit={async (name) => {
                          await onCreateProject(space.id, name);
                          setCreatingIn(null);
                        }}
                        onCancel={() => setCreatingIn(null)}
                      />
                    </div>
                  ) : null}

                  {space.projects.length === 0 && creatingIn !== space.id ? (
                    <p className="py-1 pl-8 pr-2 text-micro text-text-subtle">
                      暂无项目
                    </p>
                  ) : null}

                  {space.projects
                    .filter((project) => showArchived || !project.archived)
                    .map((project) => {
                    const selected =
                      !selection.inbox &&
                      selection.spaceId === space.id &&
                      selection.projectId === project.id;
                    const n = doingCount(project.tasks);
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => onSelectProject(space.id, project.id)}
                        className={cn(
                          "tree-row flex w-full items-center gap-2 rounded-md py-0 pl-7 pr-2 text-left",
                          selected
                            ? "bg-accent text-accent-fg"
                            : "text-text hover:bg-bg-hover",
                          project.archived && !selected && "opacity-55",
                        )}
                        title={project.archived ? "已归档" : undefined}
                      >
                        <span className="min-w-0 flex-1 truncate text-ui">
                          {project.name}
                        </span>
                        {n > 0 ? (
                          <span
                            className={cn(
                              "inline-flex min-w-4 items-center justify-center rounded-full px-1.5 text-micro font-medium tabular-nums",
                              selected
                                ? "bg-accent-fg/20 text-accent-fg"
                                : "bg-bg-hover text-text-dim",
                            )}
                          >
                            {n}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
