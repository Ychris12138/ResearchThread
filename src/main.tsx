import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { ResearchApp } from "@/components/research-app";
import { AppearanceSync } from "@/components/appearance-sync";
import { initDataAccess, isTauri, type Space, type Task } from "@/dataAccess";
import { DEFAULT_SELECTION } from "@/components/selection";

/** 全局快捷键：任意应用下 Ctrl+Shift+Space 唤起窗口并打开收件箱（M2③） */
async function registerGlobalShortcut(): Promise<void> {
  try {
    const gs = await import("@tauri-apps/plugin-global-shortcut");
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await gs.unregisterAll();
    await gs.register("CommandOrControl+Shift+Space", (event) => {
      if (event.state === "Pressed") {
        const w = getCurrentWindow();
        void w.show();
        void w.setFocus();
        window.dispatchEvent(new CustomEvent("rt:open-inbox"));
      }
    });
  } catch (e) {
    console.warn("global shortcut unavailable:", e);
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;

  let spaces: Space[] = [];
  let initialTask: Task | null = null;
  try {
    const da = await initDataAccess();
    spaces = await da.listSpaces();
    try {
      initialTask = await da.getTask(
        DEFAULT_SELECTION.spaceId,
        DEFAULT_SELECTION.projectId,
        DEFAULT_SELECTION.taskId,
      );
    } catch {
      initialTask = null;
    }
  } catch (e) {
    root.innerHTML = `
      <div style="font-family:system-ui,sans-serif;padding:48px;max-width:560px;margin:0 auto;color:#1c1917">
        <h1 style="font-size:18px;margin-bottom:12px">ResearchThread 数据层初始化失败</h1>
        <p style="color:#666;line-height:1.6">${String(e)}</p>
        <p style="color:#999;margin-top:16px">请检查数据目录（~/ResearchThread）权限后重启应用。</p>
      </div>`;
    return;
  }

  createRoot(root).render(
    <StrictMode>
      <AppearanceSync />
      <ResearchApp initialSpaces={spaces} initialTask={initialTask} />
    </StrictMode>,
  );

  if (isTauri()) void registerGlobalShortcut();
}

void boot();
