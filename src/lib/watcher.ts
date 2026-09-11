// lib/watcher.ts — 文件变更监听（M2①）。
// 规则（PLAN.md 第四节）：事件去抖；应用自身写入静默（仍触发刷新）；
// 外部修改记 actor=external 活动账，并通知 UI（脏编辑器 → 横幅，否则静默重载）。

import { getStorage } from "@/dataAccess";
import { isSelfWrite } from "@/lib/selfWrites";

export interface WatchHandlers {
  /** 任何事件（含应用自身写入）去抖后触发：UI 静默重载（若编辑器不脏） */
  onQuiet(): void;
  /** 检测到外部修改：UI 决定横幅或重载 */
  onExternal(relPaths: string[]): void;
}

export async function startWatcher(handlers: WatchHandlers): Promise<() => void> {
  const store = getStorage();
  if (!store) return () => undefined;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingPaths: string[] = [];

  const flush = () => {
    timer = null;
    const paths = [...new Set(pendingPaths)];
    pendingPaths = [];
    if (paths.length === 0) return;
    handlers.onQuiet();
    // Windows watcher 返回反斜杠绝对路径，数据目录统一正斜杠——
    // 必须先归一再做前缀剥离，否则 .git/.activity 过滤永远失配（误入账、误横幅）
    const prefix = store.dataDir.replace(/\\/g, "/").replace(/\/+$/, "");
    const external = paths
      .filter((p) => !isSelfWrite(p))
      .map((p) => {
        const abs = p.replace(/\\/g, "/");
        return abs.startsWith(prefix) ? abs.slice(prefix.length + 1) : abs;
      })
      .filter(
        (rel) =>
          !rel.startsWith(".git/") && // git 内部簿记对 agent 无意义
          !rel.endsWith(".rt-tmp") && // 原子写残片
          !rel.endsWith(".rt-bak") && // 原子写备份
          !rel.startsWith(".activity/") &&
          !rel.startsWith(".trash/"), // 软删除暂存（恢复由人操作 spaces/ 时自然可见）
      );
    if (external.length > 0) {
      void store.logExternalModify(external);
      handlers.onExternal(external);
    }
  };

  try {
    const stop = await store.watch((absPaths) => {
      pendingPaths.push(...absPaths);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 400);
    });
    document.title = "ResearchThread — watching";
    return () => {
      if (timer) clearTimeout(timer);
      stop();
    };
  } catch (e) {
    // 监听失败不阻塞应用：仅提示，外部修改将无法自动刷新
    document.title = `ResearchThread（监听不可用）`;
    console.warn("watcher unavailable:", e);
    return () => undefined;
  }
}
