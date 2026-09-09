# ResearchThread — 需求与技术计划（简化版）

> 目标：把纸笔式「思路整理」工作流数字化为本地优先的桌面工具；第一步实现数据维护，第二步引入 agent 自动归纳任务上下文与项目全貌。

## 一、原始工作流（来自手写笔记）

1. **日常梳理（第一页）**：按分类列出所有工作线，每条为「分类 → 任务 → 下一步动作」，用标记体系手动归纳紧急点：✓ 完成、☆/圈注 重点、划掉 放弃、括注 备注。
2. **任务细节（第二页）**：逐任务梳理逻辑与上下文（为什么做、卡点、关键信息）。
3. **每周**：人工维护一份文档保证项目完整性（进展、遗留、决策）。

## 二、需求

### 第一步（本阶段）：数据与维护界面

- 层级：**空间 → 项目 → 任务**（空间 ≈ 手写页的分类；项目 ≈ 一条工作线）
- 任务属性：状态（todo / doing / done / hold）、紧急标记 star（☆）、下一步动作 next、备注
- **双层上下文**：项目整体上下文（每项目一份）+ 任务上下文（每任务一份）——核心资产
- 周文档（项目完整性快照）
- Tauri 2 桌面应用（macOS + Windows），本地数据

### 第二步（未来）：agent 层

- 自动归纳任务逻辑/上下文、维护项目整体理解、生成周文档
- 前提：数据即文件、活动留痕从第一天开始积累

### 增补需求（建议采纳）

1. 快速捕获：全局快捷键 → 收件箱（inbox），零摩擦记录
2. 下一步动作（next action）作为一等字段，列表直接展示
3. 活动留痕（activity log）：状态变更/追加笔记均记录，供未来 agent 使用
4. 「今日视角」看板：按空间分组 + 紧急高亮，复刻手写页
5. 任务阻塞/依赖关系
6. 全文搜索；已完成项目归档
7. 数据即本地 Markdown：可被 Obsidian 直接打开；git 版本控制

## 三、核心决策：Markdown 文件树 + YAML frontmatter（不用 SQLite）

理由：核心资产本来就是上下文文档；周报 = 拼装 markdown；agent-friendly（第二步直接读写文件，零迁移）；Obsidian / git 无缝衔接。

### 目录结构

```
~/ResearchThread/                  # 数据目录（可在设置中修改）
├── inbox/                         # 快速捕获收件箱
├── spaces/
│   ├── research/                  # 空间
│   │   └── projects/
│   │       └── paper-xxx/         # 项目
│   │           ├── project.md     # 项目整体上下文（人写，未来 agent 维护）
│   │           └── tasks/
│   │               └── 2026-09-10-reply-reviewers.md   # 任务
│   └── dev/
└── weekly/2026-W37.md             # 周文档
```

### 任务文件格式

```markdown
---
title: 审稿意见回复
status: doing        # todo | doing | done | hold
star: true           # ☆ 紧急/重点
next: 补充静电结合能数据
created: 2026-09-10
updated: 2026-09-10
---

## 任务上下文
为什么做、逻辑、卡点……（对应手写第二页）
```

### project.md 约定（为第二步预留）

人写区与 agent 维护区分离，例如以 `## AI Summary` 章节作为 agent 专属写入区，避免覆盖人工内容。

## 四、技术选型（第一阶段）

原则：**起步极简，架构为扩展预留**——零自定义 Rust、无前端框架、依赖按需引入（起步 ~4 个包）。`storage.ts` 独立封装，后续引入框架、组件库或自研 Rust 模块时数据层不动。

| 层 | 选择 | 说明 |
|---|---|---|
| 框架 | Tauri 2（vanilla-ts 模板，`npm create tauri-app` 一条命令） | Rust 侧起步保持模板原样 |
| 文件读写 | 官方 `tauri-plugin-fs`（JS API） | 起步不写 Rust command |
| 前端 | 原生 TypeScript + Vite | 先无框架；规模变大可换，storage 层不动 |
| 状态 | 普通 TS 模块 | 无状态管理库 |
| 样式 | 手写 CSS | IDE 式布局（见下） |
| 编辑 | `<textarea>`；预览可选 `marked` | 无 CodeMirror |
| 终端面板 | `tauri-plugin-shell`（spawn + stdin 写入 + stdout 流式）+ `@xterm/xterm`（+ addon-fit）显示 | 工作目录默认数据目录，可直接调用 CLI agent（`claude -p`、`codex exec` 等）；需在 capabilities 放开 shell 执行权限 |
| frontmatter | ~40 行自写 TS 解析（固定 schema） | 需要时再换 js-yaml |
| 搜索 | 内存中字符串匹配 | 数据量增长后可上索引 |
| 备份 | 数据目录 git 化 | 版本历史 = 项目完整性的一部分 |

终端面板说明：plugin-shell 方案可跑一次性/流式命令，满足调用 agent CLI 的需求；**真 PTY**（完全交互式 TUI）后续如需要，需引入少量 Rust（如 `portable-pty`），届时再决策。

代码结构：

```
src/
├── storage.ts     ← 唯一数据层：markdown 文件树读写 + frontmatter 解析（独立封装，将来换 UI 框架不用动）
├── views.ts       ← 中间展示区视图（任务列表、项目上下文等）
├── terminal.ts    ← 底部终端面板（plugin-shell + xterm.js）
├── main.ts        ← 布局骨架与右栏/底部面板开关
└── style.css
```

已接受的代价：DOM 手动更新（应用本质是树+列表+表单，规模可控）；textarea 无编辑器增强（需要时再引入 CodeMirror）。

## 五、UI（IDE 式四区布局）

- **左侧栏（常驻）**：空间/项目树 + 收件箱入口
- **中间展示区**：主工作区，按视图切换——任务列表（按状态分组、☆ 置顶、显示 next action）、项目上下文、今日视角（M3+）
- **底部面板（可开关）**：第一阶段为内置终端，工作目录即数据目录，方便调用 CLI agent；第二阶段演化为 agent 唤起/对话面板
- **右侧栏（可开关）**：选中任务/项目的详情与上下文编辑（元数据表单 + markdown 编辑）

## 六、里程碑

- **M1** 脚手架 + storage 层 + 布局骨架（左树 / 中展示 / 右可开关详情栏）：可创建/编辑空间、项目、任务
- **M2** 任务操作：状态/☆/next action + 快速捕获收件箱 + 底部终端面板（plugin-shell + xterm.js，可调 CLI agent）
- **M3** 周文档一键生成 + 打磨：全文搜索、归档、markdown 预览、真 PTY 终端评估
