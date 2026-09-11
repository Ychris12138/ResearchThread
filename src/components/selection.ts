export type Selection = {
  spaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  inbox: boolean;
};

export const EMPTY_SELECTION: Selection = {
  spaceId: null,
  projectId: null,
  taskId: null,
  inbox: false,
};

export const DEFAULT_SELECTION = {
  spaceId: "research",
  projectId: "paper-dft",
  taskId: "2026-08-12-reply-reviewers.md",
} as const;
