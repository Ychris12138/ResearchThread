import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Svg({ children, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props.title ? undefined : true}
      className={cn("size-4", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconMark({ className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={cn("size-4", className)} {...props}>
      <rect x="2" y="3.4" width="12" height="1.7" rx="0.85" fill="currentColor" />
      <rect x="2" y="7.15" width="8" height="1.7" rx="0.85" fill="var(--color-accent)" />
      <rect x="2" y="10.9" width="10.5" height="1.7" rx="0.85" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

export function IconFiles(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4.2h4.2l1.1 1.4H13v6.6H3z" />
      <path d="M6 8.2h4M6 10.4h2.6" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="3.4" />
      <path d="M9.6 9.6 13 13" />
    </Svg>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 8.4 4.2 3.6h7.6l1.4 4.8v4H2.8z" />
      <path d="M2.8 8.4h3.1l.7 1.5h3l.7-1.5h3.1" />
    </Svg>
  );
}

export function IconAgent(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.2" y="4.2" width="9.6" height="8.2" rx="2.2" />
      <path d="M8 2.6v1.6M6.1 7.4h.1M9.8 7.4h.1M6.2 10h3.6" />
    </Svg>
  );
}

export function IconPlugins(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.2" y="2.2" width="5" height="5" rx="1.1" />
      <rect x="8.8" y="2.2" width="5" height="5" rx="1.1" />
      <rect x="2.2" y="8.8" width="5" height="5" rx="1.1" />
      <rect x="9.4" y="9.4" width="5" height="5" rx="1.1" />
    </Svg>
  );
}

export function IconGraph(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="4.2" cy="4.6" r="1.7" />
      <circle cx="12" cy="5.4" r="1.7" />
      <circle cx="7.6" cy="12" r="1.7" />
      <path d="M5.6 5.4 10.4 5.8M5.2 6.1 6.6 10.5M10.8 6.8 8.8 10.6" />
    </Svg>
  );
}

export function IconToday(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.6" y="3.4" width="10.8" height="10.2" rx="1.4" />
      <path d="M2.6 6.4h10.8M5.2 2.6v1.8M10.8 2.6v1.8" />
    </Svg>
  );
}

export function IconWeekly(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 3.2h6.4L13 5.8v7H4z" />
      <path d="M10.2 3.2v2.8H13M6 8.2h4.4M6 10.6h2.8" />
    </Svg>
  );
}

export function IconJournal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 2.6h9.2v10.8H3.4z" />
      <path d="M3.4 5h9.2M5.4 7.4h6M5.4 9.6h4.2" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 2.4v1.5M8 12.1v1.5M2.4 8h1.5M12.1 8h1.5M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" />
    </Svg>
  );
}

export function IconTask(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 2.8h6.2L13 5.6v7.6H4z" />
      <path d="M10.1 2.8v2.9H13M6.1 8.4h4.2M6.1 10.8h2.6" />
    </Svg>
  );
}

export function IconTerminal(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.4" y="3.2" width="11.2" height="9.6" rx="1.4" />
      <path d="M4.6 6.4 6.6 8l-2 1.6M8.2 10.4H11.2" />
    </Svg>
  );
}
