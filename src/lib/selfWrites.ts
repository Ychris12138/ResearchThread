// Tracks files the app itself just wrote, so the fs watcher can tell
// "our own write" apart from an external edit (Obsidian / git / 手改).
// 路径统一归一化为正斜杠：plugin-fs 的 watch 事件在 Windows 上返回反斜杠，
// 而 storage 写入用的是正斜杠——不归一会导致抑制表永远失配（误报 external）。

const recent = new Map<string, number>();

const norm = (p: string): string => p.replace(/\\/g, "/");

export function markSelfWrite(absPath: string): void {
  recent.set(norm(absPath), Date.now());
  if (recent.size > 1000) {
    const cutoff = Date.now() - 10_000;
    for (const [k, t] of recent) if (t < cutoff) recent.delete(k);
  }
}

export function isSelfWrite(absPath: string, withinMs = 2500): boolean {
  const t = recent.get(norm(absPath));
  if (t === undefined) return false;
  if (Date.now() - t > withinMs) {
    recent.delete(norm(absPath));
    return false;
  }
  return true;
}
