# AGENTS.md — 仓库上下文（供 AI agent 阅读）

> 本文件是 agent 在此仓库工作的**入口文档**。开工前请读完本文件与 [PLAN.md](PLAN.md)。
> 每完成一个里程碑或修改关键决策后，请更新本文件（含「当前状态」日期）。

## 项目是什么

ResearchThread 是一个**本地优先**的桌面工具（Tauri 2，macOS + Windows），把用户（科研人员）的手写「思路整理」工作流数字化。

用户原本的纸笔流程：

1. 手写页按分类（科研/实验/开发/学习…）列出所有工作线，每条为「分类 → 任务 → 下一步动作」，用标记体系归纳紧急点：✓ 完成、☆/圈注 重点、划掉 放弃、括注 备注；
2. 下一页逐任务梳理**逻辑与上下文**（为什么做、卡点、关键信息）；
3. 每周人工维护一份文档，保证**项目完整性**（进展、遗留、决策）。

分两步走：

- **第一步（当前）**：实现 空间→项目→任务 层级维护 + 双层上下文（项目整体上下文 / 任务上下文）+ 周文档。
- **第二步（未来，尚未开始）**：引入 LLM agent 自动归纳任务上下文与项目全貌。**第一步的所有设计都必须为这一步铺路**（数据即文件、活动留痕、人写区/agent 区分离）。

## 当前状态

- 更新日期：2026-09-10
- 阶段：**M0 规划完成**（需求、技术选型、数据格式已定），尚无代码
- 下一步：M1 —— `npm create tauri-app`（vanilla-ts 模板）→ 加 `tauri-plugin-fs` → 写 `src/storage.ts` 数据层 → 布局骨架（左树 / 中展示 / 右可开关详情栏；底部终端面板在 M2）

## 关键决策（改动前必须与用户确认）

1. **存储 = Markdown 文件树 + YAML frontmatter，不用数据库**。理由：第二步 agent 直接读写文件；Obsidian 可打开同一目录；git 提供版本历史。数据目录（默认 `~/ResearchThread/`，可在设置中修改）与代码仓库分离。
2. **起步零自定义 Rust**：文件 IO 走官方 `tauri-plugin-fs` 的 JS API。**极简是第一阶段的起步策略而非长期约束**——项目后续会扩展（如真 PTY 终端需少量 Rust），重大引入前与用户确认即可。
3. **第一阶段无前端框架**：原生 TypeScript + Vite（vanilla-ts 模板），手写 CSS，编辑用 `<textarea>`。`storage.ts` 独立封装，将来换 UI 框架时数据层不动。
4. **依赖按需引入**：起步为 `@tauri-apps/api`、`@tauri-apps/plugin-fs`、`@tauri-apps/plugin-shell` + `@xterm/xterm`（底部终端面板）、（可选）`marked`；新增依赖时说明用途，无硬性数量上限。

## 数据格式规范（storage.ts 必须严格遵守）

数据目录结构：

```
~/ResearchThread/                  # 数据目录（与代码仓库分离）
├── inbox/                         # 快速捕获收件箱
├── spaces/
│   ├── research/                  # 空间（≈ 手写页的分类）
│   │   └── projects/
│   │       └── paper-xxx/         # 项目（≈ 一条工作线）
│   │           ├── project.md     # 项目整体上下文
│   │           └── tasks/
│   │               └── 2026-09-10-reply-reviewers.md   # 任务
│   └── dev/
└── weekly/2026-W37.md             # 周文档
```

任务文件 = YAML frontmatter（结构化属性）+ 正文（任务上下文，对应手写第二页）：

```markdown
---
title: 审稿意见回复
status: doing        # todo | doing | done | hold（hold = 搁置）
star: true           # ☆ 紧急/重点
next: 补充静电结合能数据
created: 2026-09-10
updated: 2026-09-10
---

## 任务上下文
为什么做、逻辑、卡点……
```

硬性约定：

- 任务文件名：`YYYY-MM-DD-<slug>.md`，创建后不改名（作为稳定 ID）
- `status` 枚举固定为 `todo | doing | done | hold`，`star` 为布尔
- `project.md` 内划分**人写区**与 **agent 维护区**（约定以 `## AI Summary` 章节作为 agent 专属写入区），agent 永不覆盖人写内容
- 所有数据变更必须经过 `storage.ts`，UI 不得直接调 fs 插件。**例外**：底部终端运行的 CLI agent、以及 Obsidian 等外部工具会直接改文件——因此 M2 起需文件变更监听（plugin-fs 的 watch）用于界面刷新

## UI 布局（已定，用户明确要求）

IDE 式四区布局：

- **左侧栏（常驻）**：空间/项目树 + 收件箱入口
- **中间展示区**：主工作区，按视图切换（任务列表、项目上下文、今日视角…）
- **底部面板（可开关）**：第一阶段为内置终端，工作目录 = 数据目录，用于调用 CLI agent；第二阶段演化为 agent 唤起/对话面板
- **右侧栏（可开关）**：选中任务/项目的详情与上下文编辑

## 计划的代码结构

```
src/
├── storage.ts     # 唯一数据层：文件树读写 + frontmatter 解析（~40 行自写解析，固定 schema）
├── views.ts       # 中间展示区视图（任务列表按状态分组、☆置顶、显示 next；项目上下文）
├── terminal.ts    # 底部终端面板（plugin-shell + xterm.js）
├── main.ts        # 布局骨架与右栏/底部面板开关
└── style.css
```

## 里程碑

- **M1** 脚手架 + storage 层 + 布局骨架（左树 / 中展示 / 右可开关详情栏）：可创建/编辑空间、项目、任务
- **M2** 任务操作：状态/☆/next action + 快速捕获收件箱 + 底部终端面板（plugin-shell + xterm.js，可调 CLI agent）+ 文件变更监听 + 活动留痕（activity log，为第二步 agent 积累素材）
- **M3** 周文档一键生成 + 打磨：全文搜索（内存字符串匹配）、归档、markdown 预览（`marked`）、真 PTY 终端评估

## 协作约定

- 文档与用户交流用**中文**；代码标识符、枚举值、commit message 用英文
- 提交前跑 `npm run tauri dev` 确认应用可启动（M1 起适用）
- 完成里程碑后更新本文件「当前状态」并同步 README.md 的状态行
- 技术栈**起步极简但会扩展**（用户已明确）：第一阶段形态不等于长期形态；建议引入新依赖/框架/自研 Rust 模块时说明理由与替代方案，重大架构变化需用户确认
