// tests/search-markdown.test.ts — M3 搜索纯函数 + markdown 渲染（含 XSS 转义）。

import { describe, expect, it } from "vitest";
import { makeSnippet, searchAll } from "../src/lib/search";
import { renderMarkdown } from "../src/lib/markdown";
import type { InboxItem, Space } from "../src/types";

const SPACES: Space[] = [
  {
    id: "research",
    name: "科研",
    projects: [
      {
        id: "paper-dft",
        name: "DFT 论文投稿",
        description: "# 目标\nPRB 投稿，审稿意见回复中。",
        tasks: [
          {
            id: "2026-09-01-reply.md",
            title: "回复审稿人",
            status: "doing",
            star: true,
            next: "补约束计算",
            created: "2026-09-01",
            updated: "2026-09-12",
            entries: [
              { date: "2026-09-05", author: "agent", text: "检索到 U_eff = 6.2 eV 文献依据。" },
            ],
          },
          {
            id: "2026-08-01-hold.md",
            title: "补充 Supp",
            status: "hold",
            star: false,
            next: "",
            created: "2026-08-01",
            updated: "2026-08-01",
            entries: [],
          },
        ],
      },
      {
        id: "old",
        name: "已归档项目",
        description: "归档说明里含关键词 磁矩。",
        tasks: [
          {
            id: "2026-03-01-x.md",
            title: "归档任务 磁矩",
            status: "doing",
            star: false,
            next: "",
            created: "2026-03-01",
            updated: "2026-03-01",
            entries: [],
          },
        ],
        archived: true,
      },
    ],
  },
];

const INBOX: InboxItem[] = [
  { id: "2026-09-10-120000.md", created: "2026-09-10", text: "查一下 Materials Cloud 的 NiO 基准" },
];

describe("searchAll（搜索纯函数）", () => {
  it("命中任务标题与上下文条目", () => {
    const hits = searchAll(SPACES, INBOX, "审稿");
    expect(hits.some((h) => h.kind === "任务" && h.title === "回复审稿人")).toBe(true);
    expect(hits.some((h) => h.kind === "项目" && h.title === "DFT 论文投稿")).toBe(true);
  });
  it("命中上下文条目正文（agent 条目也参与索引）", () => {
    const hits = searchAll(SPACES, INBOX, "6.2 eV");
    expect(hits.some((h) => h.kind === "任务" && h.taskId === "2026-09-01-reply.md")).toBe(true);
  });
  it("命中收件箱；大小写不敏感", () => {
    const hits = searchAll(SPACES, INBOX, "materials cloud");
    expect(hits.some((h) => h.kind === "收件箱")).toBe(true);
  });
  it("已归档项目默认排除；includeArchived 可找回", () => {
    expect(searchAll(SPACES, [], "磁矩").length).toBe(0);
    expect(searchAll(SPACES, [], "磁矩", { includeArchived: true }).length).toBeGreaterThan(0);
  });
  it("空查询返回空；结果上限生效", () => {
    expect(searchAll(SPACES, INBOX, "")).toHaveLength(0);
    const many = searchAll(SPACES, INBOX, "e", { limit: 3 }); // 'e' 大面积命中
    expect(many.length).toBeLessThanOrEqual(3);
  });
  it("makeSnippet 截取窗口并给出匹配词", () => {
    const s = makeSnippet("a".repeat(50) + "NEEDLE" + "b".repeat(50), "needle");
    expect(s.matchText).toBe("NEEDLE");
    expect(s.snippet).toContain("NEEDLE");
    expect(s.snippet.startsWith("…")).toBe(true);
  });
});

describe("renderMarkdown（零依赖渲染器）", () => {
  it("XSS 转义：script/标签/引号不透传", () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(2)>"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
  it("标题 / 列表 / 段落结构", () => {
    const html = renderMarkdown("# 标题\n\n- 甲\n- 乙\n\n正文");
    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain("<ul><li>甲</li><li>乙</li></ul>");
    expect(html).toContain("<p>正文</p>");
  });
  it("行内 code / bold / em", () => {
    const html = renderMarkdown("用 `U_eff` 与 **因果** *相关*");
    expect(html).toContain("<code>U_eff</code>");
    expect(html).toContain("<strong>因果</strong>");
    expect(html).toContain("<em>相关</em>");
  });
  it("CRLF 与多级标题", () => {
    const html = renderMarkdown("## 二级\r\n### 三级");
    expect(html).toContain("<h2>二级</h2>");
    expect(html).toContain("<h3>三级</h3>");
  });
});
