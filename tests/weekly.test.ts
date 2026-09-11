// tests/weekly.test.ts — M3：周文档确定性骨架 + 归档字段 round-trip。

import { describe, expect, it } from "vitest";
import {
  parseNamedDoc,
  serializeNamedDoc,
  weekRange,
} from "../src/storage/core";
import { buildWeeklySkeleton, type WeekEvent } from "../src/storage/weekly";
import type { Space } from "../src/types";

const SPACES: Space[] = [
  {
    id: "research",
    name: "科研",
    projects: [
      {
        id: "paper-dft",
        name: "DFT 论文投稿",
        description: "",
        tasks: [
          {
            id: "2026-09-01-reply.md",
            title: "回复审稿人",
            status: "doing",
            star: true,
            next: "补约束计算",
            created: "2026-09-01",
            updated: "2026-09-12",
            entries: [],
          },
          {
            id: "2026-06-01-stale.md",
            title: "老旧任务",
            status: "doing",
            star: false,
            next: "",
            created: "2026-06-01",
            updated: "2026-08-01",
            entries: [],
          },
          {
            id: "2026-05-01-hold.md",
            title: "搁置任务",
            status: "hold",
            star: false,
            next: "",
            created: "2026-05-01",
            updated: "2026-05-01",
            entries: [],
          },
          {
            id: "2026-04-01-drop.md",
            title: "放弃任务",
            status: "dropped",
            star: false,
            next: "",
            created: "2026-04-01",
            updated: "2026-04-01",
            entries: [],
          },
        ],
      },
      {
        id: "old-project",
        name: "已归档项目",
        description: "",
        tasks: [
          {
            id: "2026-03-01-archived-task.md",
            title: "归档里的任务",
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

const EV = (over: Partial<WeekEvent> & { date: string; event: string }): WeekEvent => ({
  actor: "app",
  entity: "task",
  id: "2026-09-01-reply.md",
  ...over,
});

const BASE = {
  weekId: "2026-W37",
  start: "2026-09-07",
  end: "2026-09-13",
  spaces: SPACES,
  inboxCount: 2,
  staleDays: 14,
};

describe("weekRange（跨年边界）", () => {
  it("常规周：周一到周日", () => {
    expect(weekRange("2026-09-11")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
  });
  it("跨年周：2027-01-01 属于 2026-W53（12-28 ~ 01-03）", () => {
    expect(weekRange("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });
  it("年初月初", () => {
    expect(weekRange("2024-12-30")).toEqual({ start: "2024-12-30", end: "2025-01-05" });
  });
});

describe("buildWeeklySkeleton（确定性骨架）", () => {
  const events: WeekEvent[] = [
    EV({ date: "2026-09-08", event: "create_task", detail: { title: "新任务X" }, id: "2026-09-08-new.md" }),
    EV({
      date: "2026-09-09",
      event: "set_status",
      detail: { from: "todo", to: "doing" },
    }),
    EV({ date: "2026-09-10", event: "append_entry" }),
    EV({
      date: "2026-09-10",
      event: "external_modify_placeholder", // external actor 走汇总
      actor: "external",
      event: "modify",
      entity: "file",
      id: "spaces\\research\\projects\\paper-dft\\tasks\\2026-09-01-reply.md",
    }),
  ];

  const md = buildWeeklySkeleton({ ...BASE, events });

  it("标题与周范围", () => {
    expect(md).toContain("# 周报 2026-W37（2026-09-07 ~ 2026-09-13）");
  });

  it("本周动态：新建 / 状态流转 / 外部编辑汇总", () => {
    expect(md).toContain("新建任务「新任务X」");
    expect(md).toContain("状态：todo → doing");
    expect(md).toContain("外部编辑 ×1");
    expect(md).not.toContain("external_modify_placeholder");
  });

  it("活跃工作线：☆ 置顶、显示下一步；已归档项目被排除", () => {
    const active = md.split("## 当前活跃工作线")[1].split("## 需要关注")[0];
    expect(active).toContain("☆ 回复审稿人");
    expect(active).toContain("下一步：补约束计算");
    expect(active).not.toContain("归档里的任务");
  });

  it("需要关注：滞留（进行中超 14 天未更新）+ 收件箱积压", () => {
    const attention = md.split("## 需要关注")[1].split("## 搁置")[0];
    expect(attention).toContain("老旧任务");
    expect(attention).toContain("天未更新");
    expect(attention).toContain("收件箱积压 2 条");
  });

  it("搁置与放弃分区", () => {
    const rest = md.split("## 搁置")[1];
    expect(rest).toContain("搁置任务");
    expect(rest.split("## 已放弃")[1]).toContain("放弃任务");
  });

  it("确定性：同输入两次生成完全一致", () => {
    expect(buildWeeklySkeleton({ ...BASE, events })).toBe(md);
  });

  it("空周：动态提示无记录", () => {
    const empty = buildWeeklySkeleton({ ...BASE, events: [] });
    expect(empty).toContain("本周没有记录到操作。");
  });
});

describe("任务定位与排序修正", () => {
  const SAME = "2026-09-10-same.md";
  const mk = (title: string, star = false): Space["projects"][number]["tasks"][number] => ({
    id: SAME,
    title,
    status: "doing",
    star,
    next: "",
    created: "2026-09-10",
    updated: "2026-09-12",
    entries: [],
  });
  const spaces2: Space[] = [
    {
      id: "alpha",
      name: "空间甲",
      projects: [
        { id: "p1", name: "项目一", description: "", tasks: [mk("甲项目的同名任务")] },
      ],
    },
    {
      id: "beta",
      name: "空间乙",
      projects: [
        { id: "p2", name: "项目二", description: "", tasks: [mk("乙项目的同名任务", true)] },
      ],
    },
  ];

  it("跨项目同名任务：活动记录的完整相对路径归到正确项目", () => {
    const md = buildWeeklySkeleton({
      ...BASE,
      spaces: spaces2,
      events: [
        {
          date: "2026-09-10",
          actor: "app",
          entity: "task",
          event: "append_entry",
          id: "spaces/beta/projects/p2/tasks/" + SAME,
        },
      ],
    });
    expect(md).toContain("「乙项目的同名任务」追加上下文");
    expect(md).not.toContain("「甲项目的同名任务」追加上下文");
  });

  it("☆ 工作线置顶（即使其在遍历顺序中靠后）", () => {
    const md = buildWeeklySkeleton({ ...BASE, spaces: spaces2, events: [] });
    const active = md.split("## 当前活跃工作线")[1].split("## 需要关注")[0];
    const rows = active.split("\n").filter((l) => l.startsWith("- "));
    expect(rows[0]).toContain("☆ 乙项目的同名任务");
    expect(rows[1]).not.toContain("☆");
  });
});

describe("归档字段（project.md frontmatter）", () => {  it("archived: true 读回为真；未知字段保留", () => {
    const src = ["---", "title: 旧项目", "archived: true", "pinned: yes", "---", "", "正文。"].join("\n");
    const doc = parseNamedDoc(src);
    expect(doc.archived).toBe(true);
    expect(doc.unknownFrontmatter).toContain("pinned: yes");

    // 取消归档：archived 行消失（false 不写回），未知字段保留
    const out = serializeNamedDoc(doc.title!, doc.unknownFrontmatter, doc.body, false);
    expect(out).not.toContain("archived");
    expect(out).toContain("pinned: yes");
    expect(parseNamedDoc(out).archived).toBe(false);
  });

  it("非 archived 的项目序列化不写入该字段", () => {
    const out = serializeNamedDoc("新项目", [], "内容");
    expect(out).not.toContain("archived");
    expect(parseNamedDoc(out).archived).toBe(false);
  });
});
