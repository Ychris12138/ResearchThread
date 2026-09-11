import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

export function Btn({
  variant = "ghost",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "quiet" | "danger" | "toolbar";
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-md px-2.5 text-small font-medium",
        "transition-[background-color,color,transform,opacity] duration-150 ease-out",
        "active:not-disabled:scale-[0.96]",
        variant === "primary" &&
          "h-7 bg-accent px-3 text-accent-fg hover:brightness-110",
        variant === "ghost" &&
          "h-7 text-text-dim hover:bg-bg-hover hover:text-text",
        variant === "toolbar" &&
          "h-7 text-text-dim hover:bg-bg-hover hover:text-text",
        variant === "quiet" && "h-7 text-text-dim hover:text-text",
        variant === "danger" &&
          "h-7 text-st-dropped hover:bg-st-dropped/15",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md bg-bg-sunken px-2.5 text-ui text-text",
        "shadow-[var(--shadow-border)] placeholder:text-text-subtle",
        "transition-shadow duration-150",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]",
        className,
      )}
      {...props}
    />
  );
}

export function InlineInput({
  placeholder,
  onSubmit,
  onCancel,
  className,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [value, setValue] = useState("");
  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = value.trim();
          if (v) onSubmit(v);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className={cn(
        "h-7 w-full rounded-md bg-bg-sunken px-2 text-ui text-text",
        "shadow-[var(--shadow-border)] placeholder:text-text-subtle",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]",
        className,
      )}
    />
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="fade-rise flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-title font-medium tracking-tight text-text">{title}</p>
      {hint ? (
        <p className="max-w-sm text-small text-pretty text-text-dim">{hint}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-bg-hover px-1.5 text-micro font-medium tabular-nums text-text-dim">
      {children}
    </span>
  );
}
