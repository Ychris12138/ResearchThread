// lib/editorState.ts — 编辑器脏标记（跨组件）。
// watcher 刷新策略依赖它：脏 → 外部变更出横幅；不脏 → 静默重载。
// 未保存草稿退出保护也读它（research-app 的 onCloseRequested / beforeunload）。

import { create } from "zustand";

interface EditorDirtyState {
  detail: boolean; // 右栏任务元数据编辑
  context: boolean; // 中间项目上下文编辑
  weekly: boolean; // 周文档源码编辑
  setDetail(v: boolean): void;
  setContext(v: boolean): void;
  setWeekly(v: boolean): void;
  any(): boolean;
}

export const useEditorDirty = create<EditorDirtyState>()((set, get) => ({
  detail: false,
  context: false,
  weekly: false,
  setDetail: (v) => set({ detail: v }),
  setContext: (v) => set({ context: v }),
  setWeekly: (v) => set({ weekly: v }),
  any: () => get().detail || get().context || get().weekly,
}));
