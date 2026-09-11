import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePref = "light" | "dark" | "system";
export type AccentId = "blue" | "teal" | "ink" | "olive" | "slate" | "rust";
export type Density = "compact" | "comfortable";
export type RadiusPref = "sm" | "md" | "lg";
export type SidebarContrast = "flat" | "soft" | "high";
export type DateFormat = "cn" | "iso";
export type LogOrder = "asc" | "desc";
export type FontPref = "sans" | "serif";
export type CanvasPref = "white" | "paper";
export type EditorWidth = "narrow" | "medium" | "wide";
export type AppView =
  | "files"
  | "search"
  | "inbox"
  | "agent"
  | "plugins"
  | "graph"
  | "today"
  | "weekly";

export const ACCENTS: Record<
  AccentId,
  { label: string; light: string; dark: string; fg: string }
> = {
  blue: { label: "钴蓝", light: "#3b6fd4", dark: "#7aa2ff", fg: "#ffffff" },
  teal: { label: "青绿", light: "#0f766e", dark: "#2dd4bf", fg: "#042f2e" },
  ink: { label: "墨色", light: "#1c1917", dark: "#e7e5e4", fg: "#fafaf9" },
  olive: { label: "橄榄", light: "#4d7c0f", dark: "#a3e635", fg: "#ffffff" },
  slate: { label: "青灰", light: "#475569", dark: "#94a3b8", fg: "#ffffff" },
  rust: { label: "赤陶", light: "#9a3412", dark: "#fb923c", fg: "#ffffff" },
};

export interface PluginFlags {
  files: boolean;
  journal: boolean;
  inbox: boolean;
  agent: boolean;
  today: boolean;
  weekly: boolean;
  graph: boolean;
}

export interface Settings {
  theme: ThemePref;
  accent: AccentId;
  canvas: CanvasPref;
  font: FontPref;
  fontSize: number;
  density: Density;
  radius: RadiusPref;
  sidebarContrast: SidebarContrast;
  windowChrome: boolean;
  showNextInList: boolean;
  collapseDone: boolean;
  dateFormat: DateFormat;
  logOrder: LogOrder;
  defaultTab: "tasks" | "context";
  confirmDelete: boolean;
  showArchived: boolean;
  ribbonLabels: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  focusInspector: boolean;
  editorWidth: EditorWidth;
  agentMode: "plan" | "act";
  agentWriteLog: boolean;
  agentConfirmWrites: boolean;
  plugins: PluginFlags;
  /** 首启欢迎提示是否已看过（种子版安装后引导） */
  introSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  accent: "blue",
  canvas: "white",
  font: "sans",
  fontSize: 13,
  density: "compact",
  radius: "md",
  sidebarContrast: "soft",
  windowChrome: false,
  showNextInList: true,
  collapseDone: true,
  dateFormat: "cn",
  logOrder: "asc",
  defaultTab: "tasks",
  confirmDelete: true,
  showArchived: false,
  ribbonLabels: false,
  leftOpen: true,
  rightOpen: true,
  bottomOpen: false,
  focusInspector: true,
  editorWidth: "medium",
  agentMode: "plan",
  agentWriteLog: true,
  agentConfirmWrites: true,
  introSeen: false,
  plugins: {
    files: true,
    journal: true,
    inbox: true,
    agent: true,
    today: true,
    weekly: true,
    graph: false,
  },
};

type SettingsState = Settings & {
  patch: (partial: Partial<Settings>) => void;
  patchPlugin: (id: keyof PluginFlags, on: boolean) => void;
  reset: () => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      patch: (partial) => set(partial),
      patchPlugin: (id, on) =>
        set((s) => ({ plugins: { ...s.plugins, [id]: on } })),
      reset: () =>
        set((state) => ({
          ...state,
          ...DEFAULT_SETTINGS,
          plugins: { ...DEFAULT_SETTINGS.plugins },
        })),
    }),
    {
      name: "rt-settings-v1",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>;
        return {
          ...current,
          ...p,
          plugins: { ...DEFAULT_SETTINGS.plugins, ...p.plugins },
        };
      },
    },
  ),
);

export function resolvedTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

export function applyAppearance(s: Settings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = resolvedTheme(s.theme);
  const accent = ACCENTS[s.accent];
  root.dataset.theme = theme;
  root.dataset.canvas = s.canvas;
  root.dataset.density = s.density;
  root.dataset.radius = s.radius;
  root.dataset.sidebar = s.sidebarContrast;
  root.dataset.font = s.font;
  root.dataset.width = s.editorWidth;
  root.style.setProperty("--color-accent", theme === "dark" ? accent.dark : accent.light);
  root.style.setProperty("--color-accent-fg", accent.fg);
  if (s.accent === "teal" && theme === "dark") {
    root.style.setProperty("--color-accent-fg", "#042f2e");
  }
  if (s.accent === "ink" && theme === "dark") {
    root.style.setProperty("--color-accent-fg", "#1c1917");
  }
  root.style.setProperty("--text-ui", `${s.fontSize}px`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const light = s.canvas === "paper" ? "#faf9f7" : "#ffffff";
    meta.setAttribute("content", theme === "dark" ? "#222222" : light);
  }
}
