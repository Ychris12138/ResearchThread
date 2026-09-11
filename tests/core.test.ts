// tests/core.test.ts — storage 写回契约的测试防线（PLAN.md 契约第 4 条）。
// 只测纯核心 core.ts；IO 由 fsAdapter 负责（tauri-plugin-fs / node:fs）。

import { describe, expect, it } from "vitest";
import {
  activityLine,
  isoWeek,
  localIsoTs,
  makeTaskId,
  parseNamedDoc,
  parseTaskDoc,
  parseTaskId,
  serializeNamedDoc,
  serializeTaskDoc,
  slugifyId,
  uniqueId,
  weeklyFileId,
  yamlValue,
} from "../src/storage/core";

const ROUNDTRIP_SOURCE = [
  "---",
  "title: 审稿意见回复",
  "status: doing   # 临时标注",
  "star: true",
  "next: 补充静电结合能数据",
  "created: 2026-08-12",
  "updated: 2026-09-08",
  "tags: [dft, revision]   # 用户加的字段",
  "custom-note: 保留我",
  "---",
  "",
  "自定义开头段落（preamble）。",
  "",
  "## 任务上下文",
  "",
  "### 2026-08-12 · 我",
  "收到 major revision。审稿人 #1 质疑因果。",
  "",
  "### 2026-09-05 · agent（转述口述）",
  "检索到 U_eff = 6.2 eV 的文献依据。",
  "",
  "### 2026-09-08 · 我",
  "采纳 6.2 eV。",
  "",
  "## 附注",
  "人为加的额外章节，必须原样保留。",
  "",
].join("\r\n"); // Windows CRLF

describe("task doc round-trip（写回契约）", () => {
  it("宽松读：CRLF、行内注释、中文、冒号", () => {
    const doc = parseTaskDoc(ROUNDTRIP_SOURCE);
    expect(doc.meta.title).toBe("审稿意见回复");
    expect(doc.meta.status).toBe("doing");
    expect(doc.meta.star).toBe(true);
    expect(doc.meta.next).toBe("补充静电结合能数据");
    expect(doc.meta.created).toBe("2026-08-12");
    expect(doc.meta.updated).toBe("2026-09-08");
    expect(doc.entries).toHaveLength(3);
    expect(doc.entries[0]).toEqual({
      date: "2026-08-12",
      author: "me",
      text: "收到 major revision。审稿人 #1 质疑因果。",
    });
    expect(doc.entries[1].author).toBe("agent");
  });

  it("规范写：已知字段定序、未知字段原样保留、preamble 与 extraBody 不丢", () => {
    const doc = parseTaskDoc(ROUNDTRIP_SOURCE);
    const out = serializeTaskDoc(doc.meta, doc.unknownFrontmatter, doc);
    const reparsed = parseTaskDoc(out);

    // 字段级合并：未知字段原样保留（含注释与内联数组写法）
    expect(doc.unknownFrontmatter).toContain("tags: [dft, revision]   # 用户加的字段");
    expect(doc.unknownFrontmatter).toContain("custom-note: 保留我");
    expect(reparsed.unknownFrontmatter).toEqual(doc.unknownFrontmatter);

    // 已知字段行内注释被规范写丢弃
    expect(out).toMatch(/^title: 审稿意见回复$/m);
    expect(out).toMatch(/^status: doing$/m);
    expect(out).not.toMatch(/# 临时标注/m);

    // 正文各段不丢
    expect(reparsed.preamble).toContain("自定义开头段落");
    expect(reparsed.entries).toHaveLength(3);
    expect(reparsed.entries[1].text).toContain("6.2 eV");
    expect(reparsed.extraBody).toContain("## 附注");
    expect(reparsed.extraBody).toContain("人为加的额外章节");

    // 幂等：serialize(parse(serialize(x))) === serialize(parse(x))
    const twice = serializeTaskDoc(reparsed.meta, reparsed.unknownFrontmatter, reparsed);
    expect(twice).toBe(out);
  });

  it("写回使用 LF 规范换行", () => {
    const doc = parseTaskDoc(ROUNDTRIP_SOURCE);
    const out = serializeTaskDoc(doc.meta, doc.unknownFrontmatter, doc);
    expect(out).not.toContain("\r");
  });

  it("非法状态宽松归一为 todo", () => {
    const doc = parseTaskDoc("---\ntitle: x\nstatus: archived\n---\n");
    expect(doc.meta.status).toBe("todo");
  });

  it("无 frontmatter / 空文档不崩溃", () => {
    const doc = parseTaskDoc("随便一段话");
    expect(doc.meta.status).toBe("todo");
    expect(doc.entries).toHaveLength(0);
  });

  it("修改 meta 后追加条目：原条目与未知字段仍在", () => {
    const doc = parseTaskDoc(ROUNDTRIP_SOURCE);
    doc.meta.status = "done";
    doc.entries.push({ date: "2026-09-11", author: "me", text: "收尾" });
    const out = serializeTaskDoc(doc.meta, doc.unknownFrontmatter, doc);
    const reparsed = parseTaskDoc(out);
    expect(reparsed.meta.status).toBe("done");
    expect(reparsed.entries).toHaveLength(4);
    expect(reparsed.unknownFrontmatter).toEqual(doc.unknownFrontmatter);
    expect(out).toContain("### 2026-09-11 · 我");
  });

  it("标题含冒号/井号：读回一致（写回加引号）", () => {
    const title = "审稿: 回复 #2";
    const doc = parseTaskDoc(ROUNDTRIP_SOURCE);
    doc.meta.title = title;
    const out = serializeTaskDoc(doc.meta, doc.unknownFrontmatter, doc);
    expect(yamlValue(title)).toBe(JSON.stringify(title));
    expect(parseTaskDoc(out).meta.title).toBe(title);
  });

  it("agent 署名条目读回 author=agent，序列化署名统一为 agent", () => {
    const doc = parseTaskDoc(ROUNDTRIP_SOURCE);
    const out = serializeTaskDoc(doc.meta, doc.unknownFrontmatter, doc);
    expect(out).toContain("### 2026-09-05 · agent");
    expect(parseTaskDoc(out).entries[1].author).toBe("agent");
  });
});

describe("named doc（project.md / space.md）", () => {
  it("title + 正文 round-trip，未知字段保留", () => {
    const src = ['---', 'title: DFT 论文投稿', 'pinned: true', '---', '', '# 目标', 'PRB 投稿。'].join("\n");
    const doc = parseNamedDoc(src);
    expect(doc.title).toBe("DFT 论文投稿");
    expect(doc.unknownFrontmatter).toContain("pinned: true");
    const out = serializeNamedDoc(doc.title!, doc.unknownFrontmatter, doc.body);
    expect(parseNamedDoc(out).body).toBe(doc.body);
    expect(out).toContain("pinned: true");
  });
});

describe("命名与 slug", () => {
  it("中文 slug 保留（任务文件名允许中文）", () => {
    expect(slugifyId("回复审稿人", "task")).toBe("回复审稿人");
    expect(makeTaskId("2026-09-10", slugifyId("回复审稿人!", "task"))).toBe(
      "2026-09-10-回复审稿人.md",
    );
    expect(parseTaskId("2026-09-10-回复审稿人.md")).toEqual({
      date: "2026-09-10",
      slug: "回复审稿人",
    });
  });

  it("slug 空值回退；uniqueId 追加序号", () => {
    expect(slugifyId("!!!", "task")).toBe("task");
    expect(uniqueId("2026-09-10-a.md", [])).toBe("2026-09-10-a.md");
    expect(uniqueId("2026-09-10-a.md", ["2026-09-10-a.md"])).toBe("2026-09-10-a-2.md");
    expect(uniqueId("x", ["x", "x-2"])).toBe("x-3");
  });
});

describe("ISO 周（周文档命名，跨年边界）", () => {
  it("常规周", () => {
    expect(weeklyFileId("2026-09-10")).toBe("2026-W37");
  });
  it("1月1日可能属于上一年最后一周", () => {
    // 2027-01-01 周五 → 属于 2026-W53
    expect(weeklyFileId("2027-01-01")).toBe("2026-W53");
    // 2016-01-01 周五 → 2015-W53
    expect(weeklyFileId("2016-01-01")).toBe("2015-W53");
  });
  it("12月末可能已进入下一年第1周", () => {
    // 2024-12-30 周一 → 2025-W01
    expect(weeklyFileId("2024-12-30")).toBe("2025-W01");
    // 2020-12-31 周四 → 2020-W53
    expect(weeklyFileId("2020-12-31")).toBe("2020-W53");
  });
  it("isoWeek 数值边界", () => {
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2024-12-30")).toEqual({ year: 2025, week: 1 });
  });
});

describe("活动留痕", () => {
  it("JSONL 键序固定，detail 可选", () => {
    const line = activityLine(
      { actor: "app", entity: "task", id: "a.md", event: "set_status", detail: { from: "todo", to: "doing" } },
      "2026-09-10T23:47:12+08:00",
    );
    expect(JSON.parse(line)).toEqual({
      ts: "2026-09-10T23:47:12+08:00",
      actor: "app",
      entity: "task",
      id: "a.md",
      event: "set_status",
      detail: { from: "todo", to: "doing" },
    });
    expect(line.indexOf('"ts"')).toBeLessThan(line.indexOf('"actor"'));
    const noDetail = activityLine({ actor: "external", entity: "file", id: "x", event: "modify" }, "t");
    expect(JSON.parse(noDetail)).not.toHaveProperty("detail");
  });

  it("本地时间戳带时区偏移", () => {
    expect(localIsoTs(new Date(2026, 8, 10, 23, 47, 12))).toMatch(
      /^2026-09-10T23:47:12[+-]\d{2}:\d{2}$/,
    );
  });
});
