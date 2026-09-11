import { cn } from "@/lib/cn";
import { IconTask, IconTerminal } from "@/components/icons";

export function InspectorRail({
  hasTask,
  inspectorOpen,
  bottomOpen,
  onToggleInspector,
  onToggleBottom,
}: {
  hasTask: boolean;
  inspectorOpen: boolean;
  bottomOpen: boolean;
  onToggleInspector: () => void;
  onToggleBottom: () => void;
}) {
  return (
    <div className="rt-rail h-full w-ribbon shrink-0 flex-col items-center border-l border-border-subtle bg-bg-ribbon py-2">
      <button
        type="button"
        data-tip="任务详情  ⌘\\"
        className={cn(
          "ribbon-btn relative grid size-10 place-items-center rounded-lg",
          inspectorOpen
            ? "bg-accent/15 text-accent"
            : "text-text-dim hover:bg-bg-hover hover:text-text",
        )}
        aria-pressed={inspectorOpen}
        aria-label="任务详情"
        onClick={onToggleInspector}
      >
        <IconTask strokeWidth={inspectorOpen ? 2 : 1.6} />
        {hasTask && !inspectorOpen ? (
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent" />
        ) : null}
      </button>
      <button
        type="button"
        data-tip="底部面板  ⌘J"
        className={cn(
          "ribbon-btn mt-0.5 grid size-10 place-items-center rounded-lg",
          bottomOpen
            ? "bg-accent/15 text-accent"
            : "text-text-dim hover:bg-bg-hover hover:text-text",
        )}
        aria-pressed={bottomOpen}
        aria-label="底部面板"
        onClick={onToggleBottom}
      >
        <IconTerminal strokeWidth={bottomOpen ? 2 : 1.6} />
      </button>
    </div>
  );
}
