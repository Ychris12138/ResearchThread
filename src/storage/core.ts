// storage/core.ts — 纯逻辑：frontmatter 解析/序列化、路径映射、schema、活动记录构造。
// 不含任何 Tauri API；2b 阶段本文件将原样跑在 Node MCP server 里。
//
// 写回契约（PLAN.md 第三节，违反必须有测试覆盖）：
//   宽松读（容忍 \r\n、行内注释、未知字段、非法枚举）；
//   规范写（已知字段定序重写，未知字段行原样保留——字段级合并，绝不整体重建）；
//   中文/冒号/井号按 YAML 规则加引号；原子写由 fsAdapter 负责。

import type { ContextEntry, TaskStatus } from "../types";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "doing",
  "done",
  "hold",
  "dropped",
];

export interface TaskFrontmatter {
  title: string;
  status: TaskStatus;
  star: boolean;
  next: string;
  created: string;
  updated: string;
}

export interface ParsedTaskDoc {
  meta: TaskFrontmatter;
  /** frontmatter 中不属于已知 schema 的行（含注释），写回时原样保留 */
  unknownFrontmatter: string[];
  /** 正文开头到「## 任务上下文」之前的内容，原样保留 */
  preamble: string;
  entries: ContextEntry[];
  /** 「## 任务上下文」章节之后的其他章节，原样保留 */
  extraBody: string;
}

// ---------------------------------------------------------------------------
// YAML 标量（自写极简实现：值统一单行字符串）
// ---------------------------------------------------------------------------

const PLAIN_SAFE =
  /^[\w\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff][\w\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\-./@()（）：、]*$/;

/** 把标量值序列化为 YAML 单行：安全字符裸写，否则 JSON 双引号（合法的 YAML double-quoted）。 */
export function yamlValue(v: string): string {
  if (v === "") return '""';
  if (PLAIN_SAFE.test(v) && !/[:#]\s/.test(v) && !/\s/.test(v.slice(-1))) return v;
  return JSON.stringify(v);
}

/** 读端：去掉已知键值的行内注释并解引号（宽松）。 */
export function yamlScalar(raw: string): string {
  let v = raw.trim();
  const comment = /\s#/.exec(v);
  if (comment && !(v.startsWith('"') || v.startsWith("'"))) v = v.slice(0, comment.index).trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

// ---------------------------------------------------------------------------
// frontmatter 拆分
// ---------------------------------------------------------------------------

export interface SplitDoc {
  frontmatterLines: string[]; // 不含 --- 围栏
  bodyLines: string[];
  hadFrontmatter: boolean;
}

export function splitFrontmatter(text: string): SplitDoc {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") {
    return { frontmatterLines: [], bodyLines: lines, hadFrontmatter: false };
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---" || lines[i].trim() === "...") {
      return {
        frontmatterLines: lines.slice(1, i),
        bodyLines: lines.slice(i + 1),
        hadFrontmatter: true,
      };
    }
  }
  return { frontmatterLines: [], bodyLines: lines, hadFrontmatter: false };
}

function serializeFrontmatter(known: string[], unknown: string[]): string[] {
  return ["---", ...known, ...unknown, "---"];
}

// ---------------------------------------------------------------------------
// 任务文档
// ---------------------------------------------------------------------------

const CONTEXT_HEADING = "## 任务上下文";
const ENTRY_HEADING_RE = /^###\s+(.+)$/;
const ENTRY_META_RE = /^(\d{4}-\d{2}-\d{2})\s*·\s*(.*)$/;

function parseAuthor(raw: string): "me" | "agent" {
  const a = raw.trim();
  if (/^agent/i.test(a)) return "agent";
  return "me"; // 「我」及任何未知署名都视为人写
}

export function parseTaskDoc(text: string): ParsedTaskDoc {
  const { frontmatterLines, bodyLines } = splitFrontmatter(text);

  const meta: TaskFrontmatter = {
    title: "",
    status: "todo",
    star: false,
    next: "",
    created: "",
    updated: "",
  };
  const unknownFrontmatter: string[] = [];
  for (const line of frontmatterLines) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s?(.*)$/.exec(line);
    if (!m) {
      unknownFrontmatter.push(line);
      continue;
    }
    const [, key, rawVal] = m;
    switch (key) {
      case "title":
        meta.title = yamlScalar(rawVal);
        break;
      case "status": {
        const s = yamlScalar(rawVal) as TaskStatus;
        meta.status = TASK_STATUSES.includes(s) ? s : "todo";
        break;
      }
      case "star":
        meta.star = /^true$/i.test(yamlScalar(rawVal));
        break;
      case "next":
        meta.next = yamlScalar(rawVal);
        break;
      case "created":
        meta.created = yamlScalar(rawVal);
        break;
      case "updated":
        meta.updated = yamlScalar(rawVal);
        break;
      default:
        unknownFrontmatter.push(line);
    }
  }

  // 正文：preamble / 任务上下文章节 / 其余章节
  const headingIdx = bodyLines.findIndex((l) => l.trim() === CONTEXT_HEADING);
  const preambleLines =
    headingIdx < 0 ? bodyLines : bodyLines.slice(0, headingIdx);
  const restLines = headingIdx < 0 ? [] : bodyLines.slice(headingIdx + 1);
  let extraLines: string[] = [];
  const entries: ContextEntry[] = [];

  if (headingIdx >= 0) {
    const sectionEnd = restLines.findIndex((l) => /^##\s+/.test(l.trim()));
    const sectionLines =
      sectionEnd < 0 ? restLines : restLines.slice(0, sectionEnd);
    extraLines = sectionEnd < 0 ? [] : restLines.slice(sectionEnd);

    let current: { date: string; author: "me" | "agent"; lines: string[] } | null = null;
    const flush = () => {
      if (!current) return;
      const text = trimBlankEdges(current.lines).join("\n");
      entries.push({ date: current.date, author: current.author, text });
      current = null;
    };
    for (const line of sectionLines) {
      const h = ENTRY_HEADING_RE.exec(line.trimEnd());
      const meta2 = h ? ENTRY_META_RE.exec(h[1].trim()) : null;
      if (meta2) {
        flush();
        current = { date: meta2[1], author: parseAuthor(meta2[2]), lines: [] };
      } else if (current) {
        current.lines.push(line);
      }
      // 章节头后的空行 / 无主条目的行：忽略
    }
    flush();
  }

  return {
    meta,
    unknownFrontmatter,
    preamble: trimBlankEdges(preambleLines).join("\n"),
    entries,
    extraBody: trimBlankEdges(extraLines).join("\n"),
  };
}

/** 两端去空行：保证「解析 → 序列化」幂等（连接处的空行数由序列化器统一控制） */
function trimBlankEdges(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[0].trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out;
}

export function serializeTaskDoc(
  meta: TaskFrontmatter,
  unknownFrontmatter: string[],
  doc: { preamble: string; entries: ContextEntry[]; extraBody: string },
): string {
  const known = [
    `title: ${yamlValue(meta.title)}`,
    `status: ${meta.status}`,
    `star: ${meta.star}`,
    `next: ${yamlValue(meta.next)}`,
    `created: ${yamlValue(meta.created)}`,
    `updated: ${yamlValue(meta.updated)}`,
  ];
  const out: string[] = [...serializeFrontmatter(known, unknownFrontmatter), ""];
  if (doc.preamble) out.push(...doc.preamble.split("\n"), "");
  out.push(CONTEXT_HEADING, "");
  doc.entries.forEach((e, i) => {
    if (i > 0) out.push("");
    out.push(`### ${e.date} · ${e.author === "me" ? "我" : "agent"}`, "", ...e.text.split("\n"));
  });
  if (doc.extraBody) out.push("", ...doc.extraBody.split("\n"));
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// 项目 / 空间文档（frontmatter: title + 未知行；正文为上下文）
// ---------------------------------------------------------------------------

export interface ParsedNamedDoc {
  title: string | null;
  archived: boolean;
  unknownFrontmatter: string[];
  body: string;
}

export function parseNamedDoc(text: string): ParsedNamedDoc {
  const { frontmatterLines, bodyLines } = splitFrontmatter(text);
  let title: string | null = null;
  let archived = false;
  const unknownFrontmatter: string[] = [];
  for (const line of frontmatterLines) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s?(.*)$/.exec(line);
    if (m && m[1] === "title") title = yamlScalar(m[2]);
    else if (m && m[1] === "archived") archived = /^true$/i.test(yamlScalar(m[2]));
    else unknownFrontmatter.push(line);
  }
  return {
    title,
    archived,
    unknownFrontmatter,
    body: trimBlankEdges(bodyLines).join("\n"),
  };
}

export function serializeNamedDoc(
  title: string,
  unknownFrontmatter: string[],
  body: string,
  archived = false,
): string {
  const known = [`title: ${yamlValue(title)}`];
  if (archived) known.push("archived: true");
  const out: string[] = [
    ...serializeFrontmatter(known, unknownFrontmatter),
    "",
  ];
  if (body) out.push(...body.split("\n"));
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// 路径映射（相对数据目录，统一 '/' 分隔）
// ---------------------------------------------------------------------------

export const paths = {
  spacesDir: () => "spaces",
  spaceFile: (spaceId: string) => `spaces/${spaceId}/space.md`,
  projectsDir: (spaceId: string) => `spaces/${spaceId}/projects`,
  projectDir: (spaceId: string, projectId: string) =>
    `spaces/${spaceId}/projects/${projectId}`,
  projectFile: (spaceId: string, projectId: string) =>
    `spaces/${spaceId}/projects/${projectId}/project.md`,
  tasksDir: (spaceId: string, projectId: string) =>
    `spaces/${spaceId}/projects/${projectId}/tasks`,
  taskFile: (spaceId: string, projectId: string, taskId: string) =>
    `spaces/${spaceId}/projects/${projectId}/tasks/${taskId}`,
  inboxDir: () => "inbox",
  inboxItem: (id: string) => `inbox/${id}`,
  trashDir: () => ".trash",
  weeklyDir: () => "weekly",
  weeklyFile: (id: string) => `weekly/${id}`,
  dailyDir: () => "daily",
  activityLog: () => ".activity/log.jsonl",
  settingsFile: () => "settings.yaml",
  agentsFile: () => "AGENTS.md",
  mcpFile: () => ".mcp.json",
  gitignoreFile: () => ".gitignore",
};

// ---------------------------------------------------------------------------
// 命名：稳定 ID 与 slug
// ---------------------------------------------------------------------------

/** 任务文件名 → { date, slug }；不合法返回 null */
export function parseTaskId(
  id: string,
): { date: string; slug: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(id);
  return m ? { date: m[1], slug: m[2] } : null;
}

export function makeTaskId(date: string, slug: string): string {
  return `${date}-${slug}.md`;
}

/** unicode 保留版 slug：中文/日文等字母数字保留，其余折为 '-' */
export function slugifyId(name: string, fallback: string): string {
  const s = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || fallback;
}

export function uniqueId(base: string, existing: readonly string[]): string {
  if (!existing.includes(base)) return base;
  // 文件名感知：序号插在扩展名前（2026-09-10-a.md → 2026-09-10-a-2.md）
  const ext = base.endsWith(".md") ? ".md" : "";
  const stem = ext ? base.slice(0, -ext.length) : base;
  let i = 2;
  while (existing.includes(`${stem}-${i}${ext}`)) i++;
  return `${stem}-${i}${ext}`;
}

// ---------------------------------------------------------------------------
// ISO 周（周文档命名，跨年边界见 tests）
// ---------------------------------------------------------------------------

export function isoWeek(dateIso: string): { year: number; week: number } {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const dayNum = date.getUTCDay() || 7; // 周一=1 … 周日=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // 本周所在的周四
  const year = date.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return { year, week };
}

export function weeklyFileId(dateIso: string): string {
  const { year, week } = isoWeek(dateIso);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** 给定某天，返回其 ISO 周的周一与周日（含），用于周文档的动态过滤 */
export function weekRange(dateIso: string): { start: string; end: string } {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1)); // 本周周一
  const fmt = (x: Date) =>
    `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
  const start = fmt(date);
  date.setUTCDate(date.getUTCDate() + 6);
  const end = fmt(date);
  return { start, end };
}

// ---------------------------------------------------------------------------
// 活动留痕
// ---------------------------------------------------------------------------

export type ActivityActor = "app" | "agent" | "external";

export interface ActivityRecord {
  ts: string;
  actor: ActivityActor;
  entity: string;
  id: string;
  event: string;
  detail?: unknown;
}

/** 本地时区 ISO 时间戳（含偏移），如 2026-09-10T23:47:12+08:00 */
export function localIsoTs(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
  );
}

/** 构造一行 JSONL（不含换行符）。键序固定，便于 diff 与 grep。 */
export function activityLine(
  rec: Omit<ActivityRecord, "ts">,
  ts?: string,
): string {
  return JSON.stringify({
    ts: ts ?? localIsoTs(),
    actor: rec.actor,
    entity: rec.entity,
    id: rec.id,
    event: rec.event,
    ...(rec.detail !== undefined ? { detail: rec.detail } : {}),
  });
}

// ---------------------------------------------------------------------------
// 数据目录初始化模板（AGENTS.md / settings.yaml / .mcp.json / .gitignore）
// ---------------------------------------------------------------------------

export function templateAgentsMd(): string {
  return `# AGENTS.md — ResearchThread 数据目录（agent 行为规范）

> 本文件由 ResearchThread 应用生成与维护。任何 agent 在此目录工作前必须读完。
> 人写内容是最高权威；本规范描述你（agent）可以做什么、绝不可以做什么。

## 目录结构

- \`spaces/<空间>/projects/<项目>/project.md\` —— 项目上下文。人写区；\`## AI Summary\` 章节是 agent 专属写入区。
- \`spaces/<空间>/projects/<项目>/tasks/YYYY-MM-DD-<slug>.md\` —— 任务。frontmatter（title/status/star/next/created/updated）+ 按日期带署名的追加式上下文条目。
- \`inbox/\` —— 快速捕获收件箱（未来的自然语言命令队列）。
- \`weekly/\` \`daily/\` —— 周文档 / 日报。
- \`.activity/log.jsonl\` —— 活动留痕（追加式，勿改写）。
- \`settings.yaml\` —— agent 相关设置（调度、按用途的命令）。

## 写入规则（机制，不是约定）

1. **上下文条目只能追加**：在任务文件的 \`## 任务上下文\` 下新增 \`### YYYY-MM-DD · agent\` 条目。**永不改写、移动、删除已有条目或正文。**
2. **项目层面只能写 \`## AI Summary\` 章节**，绝不覆盖人写内容。
3. frontmatter 中你只可通过应用/MCP 工具修改 \`status\` \`star\` \`next\`；\`title\` \`created\` 不可改；文件名（稳定 ID）永不改。
4. 破坏性操作（删除任务、置 dropped、改名）必须先向用户确认。
5. 每次写操作都会被记录到 \`.activity/log.jsonl\`（actor=agent）。会话结束会自动 git commit。
6. 未知 frontmatter 字段是用户资产，原样保留。

## 状态枚举（固定）

todo=待办 doing=进行中 done=已完成 hold=搁置（会回来） dropped=放弃（不做）
`;
}

export function templateSettingsYaml(): string {
  return `version: 1
# ResearchThread agent 设置（应用与外部 agent 共读）
summary:
  weekly_day: monday      # 周报生成日（2d 生效）
  weekly_time: "09:00"
  daily_enabled: false
agents:
  claude: claude          # 按用途的 CLI agent 命令（终端面板与 2a AgentRunner 读取）
  codex: codex
terminal:
  encoding: utf-8
`;
}

export const TEMPLATE_MCP_JSON = `{
  "mcpServers": {}
}
`;

export const DATA_GITIGNORE = `.mcp.json
*.rt-tmp
*.rt-bak
`;
