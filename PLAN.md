# ResearchThread — 需求与技术计划

> 目标：把纸笔式「思路整理」工作流数字化为本地优先的桌面工具。第一步实现数据维护界面；第二步引入 agent——**人对 agent 说自然语言即可维护整个项目地图，agent 按设置定时产出日报/周报**。
>
> **北极星指标：回到工作现场的时间**——一条工作线搁置数周后，从打开应用到明白「当时在干嘛、卡在哪、下一步是什么」的耗时。一切取舍以此为准：值得投入的是上下文质量、`updated` 时间戳、活动时间线；不值得的是甘特图、日历、依赖图。

## 一、原始工作流（来自手写笔记）

1. **日常梳理（第一页）**：按分类列出所有工作线，每条为「分类 → 任务 → 下一步动作」，用标记体系手动归纳紧急点：✓ 完成、☆/圈注 重点、划掉 放弃、括注 备注。
2. **任务细节（第二页）**：逐任务梳理逻辑与上下文（为什么做、卡点、关键信息）。
3. **每周**：人工维护一份文档保证项目完整性（进展、遗留、决策）。

标记体系到数据模型的**完整**映射：✓ → `status: done`；☆/圈注 → `star: true`；**划掉放弃 → `status: dropped`**；括注备注 → 上下文条目 / `next`；搁置（还会回来）→ `status: hold`。

## 二、需求

### 第一步（本阶段）：数据与维护界面

- 层级：**空间 → 项目 → 任务**（空间 ≈ 手写页的分类；项目 ≈ 一条工作线）
- 任务属性：状态（`todo | doing | done | hold | dropped`）、紧急标记 star（☆）、下一步动作 next、备注
- **双层上下文**：项目整体上下文（每项目一份）+ 任务上下文（每任务一份，**追加式带署名条目**，见下）——核心资产
- 周文档（项目完整性快照）
- Tauri 2 桌面应用（macOS + Windows），本地数据

### 第二步：agent 层（终态）

**人只说自然语言，agent 维护整个项目地图：**

- 口述「新任务 / 新项目 / 这个任务出现转折……」→ agent 执行结构变更（立即执行，不走审批）
- agent 自主归纳（项目全貌、任务摘要）只写 AI 专属区
- **定时日报/周报**（频率与时间可配置；确定性骨架 + LLM 叙事，见第七节）
- 接口形态：**MCP server**——复用 storage 纯核心 + `node:fs` 适配器，agent 通过类型化工具（`create_task` / `set_status` / `append_context` / `get_project_map` / `query_activity` / `write_ai_summary`…）操作数据，**不裸读文件**。好处：写入禁区成为机制而非约定；activity log 自动带 `actor=agent`；校验与消歧有了收口

前提：数据即文件、活动留痕从第一天积累、写入分级信任模型（第六节）、git 兜底。

### 增补需求

1. 快速捕获：全局快捷键 → 收件箱（inbox），零摩擦记录；inbox 同时是未来的**自然语言命令队列**
2. 下一步动作（next action）作为一等字段，列表直接展示
3. 活动留痕（activity log）：应用内变更 + watcher 观察到的**外部编辑**均记录，供 agent 使用
4. 「今日视角」看板：按空间分组 + 紧急高亮，复刻手写第一页——**核心仪式，M2 实现**
5. 全文搜索；已完成项目归档
6. 数据即本地 Markdown：可被 Obsidian 直接打开；git 版本控制

已砍：「任务阻塞/依赖关系」——手写流程中无此概念，防功能蔓延成项目管理软件。

## 三、核心决策：Markdown 文件树 + YAML frontmatter（不用 SQLite）

理由：核心资产本来就是上下文文档；周报 = 拼装 markdown；agent-friendly（第二步经 MCP 工具读写，零迁移）；Obsidian / git 无缝衔接。

**文件树是项目地图的唯一事实源**；一切「地图视图」（今日视角、AI Summary、周报、agent 眼中的全貌）都是 `get_project_map()` 的派生渲染，从不持久化为第二事实源，因此永不漂移。

### 目录结构（含 agent 工作区文件）

```
~/ResearchThread/                  # 数据目录（可在设置中修改）
├── AGENTS.md          # agent 行为规范：schema、命名规则、写入禁区；由应用生成与维护
├── .mcp.json          # 注册 researchthread MCP server；机器相关路径 → gitignore，应用按机器生成
├── settings.yaml      # agent 相关设置：调度、摘要偏好、按用途的 agent 命令（外部 agent 也要读它）
├── .gitignore         # 至少忽略 .mcp.json
├── .activity/
│   └── log.jsonl      # 活动留痕（追加式）
├── inbox/             # 快速捕获收件箱（未来的自然语言命令队列）
├── spaces/
│   ├── research/      # 空间
│   │   └── projects/
│   │       └── paper-xxx/
│   │           ├── project.md     # 项目整体上下文（人写区 + AI Summary 区）
│   │           └── tasks/
│   │               └── 2026-09-10-reply-reviewers.md
│   └── dev/
├── weekly/2026-W37.md # 周文档（ISO 周号，见 storage 契约第 4 条）
└── daily/2026-09-10.md # 日报（2d 起按配置生成）
```

**数据目录即 agent 工作区**：终端面板 cwd = 数据目录，CLI agent（claude code 等）启动即自动加载根目录的 `.mcp.json` 与 `AGENTS.md`——零配置把外部 agent 接到受控工具面上。

### 任务文件格式

```markdown
---
title: 审稿意见回复
status: doing
star: true
next: 补充静电结合能数据
created: 2026-09-10
updated: 2026-09-10
---

## 任务上下文

### 2026-09-10 · 我
最初的目标、逻辑、卡点……（人写区，可自由编辑）

### 2026-09-12 · agent（转述口述）
转折：审稿人要求补充静电结合能，重点转向数据补全，原重投时间线作废
```

- `status` 枚举固定：`todo | doing | done | hold | dropped`（hold = 搁置、会回来；dropped = 放弃、不做）
- **任务上下文 = 按日期、带来源署名的追加式条目**。人可自由编辑自己的条目；**agent 只能追加带署名条目，永不改写已有内容**——「任务转折」类口述天然落位于此，演化历史不丢
- 任务文件名 `YYYY-MM-DD-<slug>.md`，**slug 允许中文**（两平台文件系统均无障碍）；创建后不改名（稳定 ID）
- frontmatter 行内注释仅为文档示意；应用写回为规范格式（不含注释）

### project.md 约定

人写区与 agent 维护区分离：以 `## AI Summary` 章节作为 agent 专属写入区。**MCP 工具面没有「覆写人写区」的操作——禁区是机制而非约定。**

### 活动留痕（activity log）

`.activity/log.jsonl`，追加式，一行一事件：

```jsonl
{"ts":"2026-09-10T23:47:12+08:00","actor":"app","entity":"task","id":"spaces/research/projects/paper-x/tasks/2026-09-10-reply.md","event":"update_status","detail":{"from":"todo","to":"doing"}}
```

- `actor`：`app | agent | external`；**外部编辑（Obsidian、git、手改）由 watcher 观察后记 `external`**——「人什么时候碰了哪个文件」是给 agent 的最佳素材
- schema 在 M2 固定，是第二步的核心燃料

### storage 写回契约（数据完整性的关键）

数据目录是多方共写的（应用 / Obsidian / 终端里的 agent / 手改），storage 层必须：

1. **宽松读**：容忍未知字段、行内注释、`\r\n`、任意合法 YAML
2. **规范写**：**字段级合并**而非整体重序列化——只改本次涉及的字段，**未知字段原样保留**（否则 = 静默数据丢失）；输出规范 YAML、LF；先写临时文件再原子替换
3. 中文标题、含冒号/井号的值按 YAML 规则加引号；行分割容忍 `\r?\n`（Windows）
4. **vitest 单测从第一天覆盖**：round-trip（CRLF、中文、冒号、未知字段保留、注释丢弃断言）、ISO 周号跨年边界（12-29 ~ 01-04，用带测试的工具函数，不用手写日期算术）

storage 是全项目唯一「静默 bug = 数据损坏」的模块，也是唯一强制测试的模块。

## 四、技术选型（第一阶段）

原则：**架构为扩展预留，依赖按需引入**——零自定义 Rust；前端框架决策已提前完成（2026-09-10：采纳外部按 UI.md 交付的 React UI，用户明确「可以扩大规模，只要匹配需求」，SSR/登录/数据库因与本地优先单机应用不符被剥离）。`storage/` 独立封装，数据层不依赖 UI 框架。

| 层 | 选择 | 说明 |
|---|---|---|
| 框架 | Tauri 2（vanilla-ts 模板） | Rust 侧起步保持模板原样 |
| 文件读写 | 官方 `tauri-plugin-fs`，**经 `fsAdapter` 接口注入** | storage 纯核心不含任何 Tauri API（为 MCP server 复用铺路） |
| 前端 | React 19 + Vite（SPA，Tauri webview 加载 `dist/`） | 2026-09-10 定：采纳外部实现的 UI（按 UI.md 规格交付后剥离 SSR/登录/数据库集成）；原「M1 末评估框架」决策点提前完成 |
| 状态 | 组件局部状态 + zustand（仅 UI 偏好，localStorage 持久化） | 业务数据一律走 `dataAccess` 接口，不进全局 store |
| 样式 | Tailwind v4 + `styles.css` 自定义层（主题变量/密排工具类，明暗双主题） | 随 UI 交付而来 |
| 编辑 | `<textarea>`；预览用自写零依赖 markdown 渲染（`lib/markdown.ts`，HTML 转义防注入） | 无 CodeMirror；`marked` 不再需要 |
| 终端面板 | `tauri-plugin-shell` + `@xterm/xterm`（+ addon-fit），**经 AgentRunner 接口抽象** | cwd = 数据目录；Windows 注意子进程 UTF-8（chcp 65001）与 shell 选择（cmd/powershell/git-bash）设置项；**真 PTY 降级为远期可选**——对话面板出现后终端退化为跑 git / 临时调 CLI 的工具抽屉 |
| frontmatter | 自写解析（守第三节写回契约） | 契约比选库重要；必要时再换 js-yaml |
| 测试 | `vitest`（仅 storage 层） | 见写回契约第 4 条 |
| 搜索 | 内存中字符串匹配 | 数据量增长后可上索引 |
| 备份 | 数据目录 git init + 手动「快照」按钮（M2） | 第二步升级为 agent 会话结束自动 commit（message 带 actor 标记） |

依赖清单：UI 已在用 `react`、`react-dom`、`zustand`、`lucide-react`、`clsx`、`tailwind-merge`；M1 接入 `@tauri-apps/api`、`@tauri-apps/plugin-fs`、`vitest`；M2 接入 `@tauri-apps/plugin-shell`、`@xterm/xterm`（+ addon-fit）；2b 时加 `@modelcontextprotocol/sdk`。

代码结构：

```
src/
├── main.tsx           # SPA 入口（Tauri webview 加载同构产物）
├── dataAccess.ts      # 数据访问接口（UI.md 第 2 节契约）+ mock 实现；M1 起由 storage 提供真实实现
├── mockData.ts        # 种子数据（兼验收用例：5 态全覆盖、含 agent 条目）
├── components/        # React 组件：research-app（四区布局壳）、sidebar、center-views、task-detail…
├── lib/               # settings（zustand persist）、status（分组排序）、markdown、format、cn
├── styles.css         # Tailwind v4 入口 + 主题变量与自定义类
├── storage/           # ✅ core / fsAdapter / git / index——写回契约见第三节
├── map.ts             # （M3 待建）项目地图快照序列化：周报骨架 / agent prompt 前缀共用
├── components/terminal-panel.tsx # ✅ 底部终端（xterm + AgentRunner）
tests/                 # ✅ vitest：storage 写回契约 + 生命周期（node:fs 适配器，2b 复用）
mcp-server/            # （2b，暂不创建）Node 程序：复用 storage/core + node:fs 适配器 + MCP SDK
```

### 并发与外部变更规则（M2 实现前定死）

- 编辑器不脏 → 外部变更**静默重载**；编辑中（脏）→ 顶部横幅提示外部变更，用户选保留自己的或加载外部版
- watcher 事件去抖（约 300ms）
- git 快照/回滚操作后主动触发全量刷新

## 五、UI（IDE 式四区布局）

- **左侧栏（常驻）**：空间/项目树 + 收件箱入口
- **中间展示区**：任务列表（按状态分组、☆ 置顶、显示 next action）、项目上下文、今日视角
- **底部面板（可开关）**：第一阶段为终端（经 AgentRunner 抽象，工作目录即数据目录）；第二步演化为 agent 对话面板——AgentRunner 是共同后端，终端与对话只是两个消费者。**不向终端投入 PTY 等增强**，精力投给 AgentRunner 与 MCP
- **右侧栏（可开关）**：选中任务/项目的详情与上下文编辑（元数据表单 + markdown 编辑）

## 六、agent 信任模型（第二步的约束，机制从第一天铺）

按**写入对象**分三级（而非按审批流程）：

1. **口述命令**（人明确指示）→ **立即执行**——审批违背「不费力」的初衷
2. **agent 自主产出** → 仅写 AI 专属区（`## AI Summary`、日报/周报）
3. **破坏性操作**（删除、dropped、改名）→ 确认门（diff 卡）

安全网：

- 每次 agent 会话结束自动 git commit（message 带 actor 标记）→ 会话级回滚
- 活动日志 actor 过滤视图（「agent 这轮动了什么」永远可查）
- 「diff 审批队列」保留为**可选的偏执模式**设置
- **工具层消歧**：模糊匹配命中多个候选时返回候选列表让 agent 反问一句，不猜；`create_project` 遇同名返回已有项目（唯一性归一）

## 七、定时总结（2d）

- **追赶式调度**：应用运行中用定时器触发；错过（关机）则下次启动时检查「上次摘要时间」，把间隔期活动补齐生成——桌面应用不是常驻服务，按错过后补设计
- **确定性骨架 + LLM 叙事**：骨架（状态变更清单、新增任务、☆ 项、长期 doing 未更新的滞留任务、inbox 积压）从活动日志机械推导，不依赖模型可用性；agent 只负责把骨架写成有判断的叙述（进展解读、风险提示）。骨架函数即 `map.ts` 快照，再次复用
- 输出即文件（`weekly/`、`daily/`），应用与 Obsidian 均可见

## 八、反目标

- 不做项目管理软件：无依赖图、甘特图、协作者
- 不做笔记软件：不追 wiki-link / 关系图谱，上下文文档不是卡片盒
- 不做 chat-first：对话是手段，文件是资产
- 不做可配置性蔓延：单用户仪器，按自己的手型打磨

## 九、里程碑

- **M1**（✅ 2026-09-11 完成）：UI（外部交付 React SPA）+ Tauri 2 壳 + storage 层（`core` / `fsAdapter` 拆分，vitest 守写回契约）+ mock→storage 切换（`DataAccess` 契约不变，组件零改动）。实测：UI 建空间/项目/任务 → 落盘为规范 Markdown（中文 slug、规范 frontmatter、未知字段保留）
- **M2**（✅ 2026-09-11 完成）：
  ① 活动日志（`.activity/log.jsonl`，字段级留痕）+ 文件监听（plugin-fs watch，自写消歧，外部修改记 `external`，脏编辑器出横幅/不脏静默重载）——实测通过
  ② 任务操作：状态 / ☆ / next action 走真实落盘 ✅
  ③ 快速捕获收件箱：`inbox/*.md` + 全局快捷键 Ctrl+Shift+Space 唤起 + 转为任务 ✅
  ④ 今日视角：按空间分组复刻手写第一页 ✅
  ⑤ 终端面板（AgentRunner + xterm，cwd=数据目录，行编辑+历史+Ctrl+C）+ 数据目录初始化（git init / 快照按钮 / 生成 `AGENTS.md`、`.mcp.json`、`settings.yaml`、`.gitignore`）——实测 `git status` 跑通
- **M3**（✅ 2026-09-11 完成）
  ① 周文档一键生成：确定性骨架（`storage/weekly.ts` 纯函数 + 活动日志/项目地图推导），预览 / 源码编辑，实测落盘 `weekly/2026-W37.md`
  ② 全文搜索：内存匹配任务（标题/下一步/上下文条目）、项目、收件箱，点击跳转，已归档项目排除——实测通过
  ③ 归档：project.md `archived: true` 标记（两步确认），侧栏 / 今日 / 搜索默认排除，设置可显示——实测通过
  ④ markdown 预览：沿用自写零依赖渲染器（未引入 `marked`），周文档与项目上下文共用
- **第二步阶梯**：
  **2a** AgentRunner 跑通 CLI 后端（`claude -p` / `codex exec`，命令从 `settings.yaml` 读）+ map 快照进 prompt + 「一键问 agent」按钮（选中任务 → 预填上下文与模板 prompt）
  **2b** 独立 MCP server（Node，复用 `storage/core` + `node:fs` 适配器）+ 数据目录 `.mcp.json`，agent 从摸文件切换到调工具
  **2c** inbox 自然语言命令解析 + 对话面板 + agent 会话自动 commit
  **2d** 追赶式调度 + 日报/周报（确定性骨架 + 叙事）
