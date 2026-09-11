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
- **第二步（未来，尚未开始）**：**人只说自然语言，agent 维护整个项目地图**（新任务/新项目/任务转折等口述 → agent 执行），并按设置定时产出日报/周报。接口形态为 **MCP server**（复用 storage 纯核心），agent 通过类型化工具操作数据，不裸读文件。**第一步的所有设计都必须为这一步铺路**（数据即文件、活动留痕、写入分级信任、人写区/agent 区机制分离、git 兜底）。

**北极星指标：回到工作现场的时间**（搁置数周的工作线，多久能想起来「在干嘛、卡在哪、下一步」）。取舍以此为准。

## 当前状态

- 更新日期：2026-09-11
- 阶段：**M3 完成 + 种子发布加固**（M1/M2/M3 全部落地，实机验证）——发布前审阅确认的九项门槛已全部代码落地：
  - **事务式写入**（`storage/atomicWrite.ts`）：写 `.rt-tmp` → 原文件让位 `.rt-bak` → 新内容就位 → 清备份；任何一步失败或进程中断后，**原文件或备份必有一个可恢复**；启动时 `recoverInterruptedWrites()` 扫描恢复并记账。测试注入 rename 失败/持续故障/崩溃残留全覆盖
  - **单实例**（`tauri-plugin-single-instance`）：第二实例启动即聚焦已有主窗口后退出，杜绝双 watcher + 同名 tmp/bak 互踩
  - **外部编辑并发策略**：storage 保存前比对磁盘内容与应用最后已知内容（`seen` 缓存，读/写后更新），不一致抛 `ExternalConflictError`，UI 弹「覆盖保存（acknowledge 后重试）/ 重新加载 / 取消」。`updateTaskMeta` / `updateEntry` / `updateProjectDescription` / `saveWeekly` 四路受保护；appendEntry 纯追加不设卡
  - **每日快照健康**（`storage/snapshot.ts` `ensureSnapshotHealth()`）：git 可用性检测 → 仓库级身份兜底（`--local`，不动全局配置）→ 补有效提交（修旧版 init 静默失败留下的空仓）→ 每日首启自动提交；任何失败 `ok:false`，主界面左下持久警告横幅 + 设置→数据「重试」
  - **草稿与覆盖保护**：`editorState` 增 weekly 脏标记，脏编辑器存在时 `onCloseRequested` / `beforeunload` 拦截退出并确认；周文档重新生成与外部冲突覆盖均需二次点击确认（3 秒 armed）
  - **周报正确性**：任务定位主键改完整相对路径（修跨项目同名任务归错），活跃工作线 ☆ 置顶稳定排序
  - **watcher 路径归一化**：Windows 反斜杠事件先归一再剥数据目录前缀（此前 `.git` / `.activity` 过滤失配、活动账记绝对路径）；`.rt-bak` 一并过滤
  - **发布物料**：关于页读真实版本（`getVersion()`）标「种子测试版」；[docs/seed-manual.md](docs/seed-manual.md) 种子手册——隐私边界（**明确撤回「打包数据目录反馈」**，改为脱敏反馈模板）、SmartScreen 安装步骤、卸载数据保留说明、外部编辑并发规则
  - **发布包与安装提示**：`npm run make-release`（[scripts/make-release.mjs](scripts/make-release.mjs)）把 NSIS 安装包、SHA256SUMS、README、种子手册归拢到 `release/`（gitignore，脚本可重复生成）；安装器中文化（`bundle.windows.nsis.languages` 简中+英文+语言选择器）并以 `bundle.license`（`src-tauri/INSTALL-NOTES.txt`）在安装前展示中文安装须知；应用首启弹欢迎卡（数据位置/快照警告含义/脱敏反馈，`settings.introSeen` 持久化开关）
- 下一步：干净 Windows 账户实测（首装 / 无 git / 无 CLI / 双开 / 升级 / 卸载重装 / 快照恢复演练）→ 全部过门后打 release tag 发 **Windows x64 受控种子版**；随后回到 **第二步阶梯 2a**（AgentRunner CLI 后端，见下条与 PART2.md）
- 第二步技术报告见 [PART2.md](PART2.md)：CLI 后端选型（claude 首选/codex 坑清单）、MCP 工具面与 will_write 归属协议、2c 解析器选型、风险登记册与排期——**实施 2a–2d 前必读**
- **Windows 构建环境（本机）**：Rust stable-msvc 装了但**缺 Windows SDK**（提权安装 SDK 未获批准）；当前用 `stable-x86_64-pc-windows-gnu` + `rust-lld` + Strawberry Perl 的 dlltool 编译通过。**启动命令**：
  ```bash
  export PATH="/d/perl/c/x86_64-w64-mingw32/bin:/d/perl/c/bin:/c/Users/85463/.cargo/bin:$PATH"
  export RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu
  npm run tauri dev
  ```
  `src-tauri/.cargo/config.toml` 固定了 rust-lld 链接器；`Cargo.toml` 的 lib crate-type 只保留 `["lib"]`（cdylib 会撞 65535 导出上限）。改 `capabilities/*.json` 后需 `touch build.rs && cargo build` 强制重嵌（dev watch 不监听 capabilities）。
- **打包安装器**：`npm run tauri build`（同上环境）→ NSIS 安装包在 `src-tauri/target/release/bundle/nsis/`，per-user 安装免管理员；随后 `npm run make-release` 归拢发布包到 `release/`（安装包 + SHA256SUMS + README + 种子手册）。**坑**：GNU 构建动态链接 `WebView2Loader.dll`（dev 时由构建目录提供，安装后缺失会导致启动即退 EXIT=127）——已通过 `bundle.resources` 打进安装器（`src-tauri/WebView2Loader.dll`，勿删）；升级 webview2-com-sys 后需同步更新该 dll。安装器未签名，首次安装会过 SmartScreen 警告（安装须知页已说明「更多信息→仍要运行」）。
- 终端面板 shell 白名单：`capabilities/default.json` 中 `shell:allow-spawn`/`shell:allow-execute` 的 allow 条目（name/cmd/args:true），新增可执行程序需同步加两处

## 关键决策（改动前必须与用户确认）

1. **存储 = Markdown 文件树 + YAML frontmatter，不用数据库**。理由：第二步 agent 经 MCP 工具读写（零迁移）；Obsidian 可打开同一目录；git 提供版本历史。数据目录（默认 `~/ResearchThread/`，可在设置中修改）与代码仓库分离。**文件树是项目地图的唯一事实源**，一切地图视图都是 `get_project_map()` 的派生渲染，绝不持久化为第二事实源。
2. **storage 拆分为纯核心 + IO 适配器**（`core.ts` 无 Tauri API，`fsAdapter.ts` 注入 `tauri-plugin-fs`）。目的：2b 阶段同一核心配 `node:fs` 即可跑成 MCP server。**storage 写回契约**（宽松读 / 规范写 / 字段级合并保留未知字段 / 原子写 / 容忍 CRLF）见 PLAN.md 第三节，是数据完整性的关键，**违反契约的改动必须有测试覆盖**。
3. **起步零自定义 Rust**：文件 IO 走官方 `tauri-plugin-fs` 的 JS API。极简是第一阶段的起步策略而非长期约束——重大引入（如真 PTY）前与用户确认即可；**PTY 已降级为远期可选**（对话面板出现后终端退化为工具抽屉）。
4. **前端 = React 19 + Vite + Tailwind v4（2026-09-10 定）**：用户采纳外部按 UI.md 交付的 UI，并明确「可以扩大规模，只要匹配需求」。集成时剥离其 SSR（TanStack Start/Nitro）、登录（better-auth）、数据库（pglite/pg/kysely）——本地优先单机桌面应用不需要这些。**`DataAccess` 接口（UI.md 第 2 节）是 UI 与 storage 的唯一边界**，UI 组件不得绕过它触文件或自建数据。原「M1 末评估框架去留」的决策点提前完成。交付中超出 M1 范围的视图（搜索/今日/周报/图谱/agent 对话）按插件门控保留、默认关闭，不投入打磨（图谱与反目标冲突，保持禁用）。
5. **依赖按需引入**：现有 `react`、`react-dom`、`zustand`、`lucide-react`、`clsx`、`tailwind-merge`；M1 加 `@tauri-apps/api`、`@tauri-apps/plugin-fs`、`vitest`（仅 storage 层）；M2 加 `@tauri-apps/plugin-shell`、`@xterm/xterm`（+ addon-fit）；2b 时加 `@modelcontextprotocol/sdk`。新增依赖时说明用途。
6. **agent 信任模型按写入对象分级**（不是按审批流程）：口述命令 → 立即执行；agent 自主产出 → 仅写 AI 专属区；破坏性操作（删除/dropped/改名）→ 确认门。安全网：agent 会话自动 git commit、活动日志 actor 过滤、「diff 审批队列」为可选偏执模式、MCP 工具层做消歧与项目名唯一性归一。
7. **agent 相关设置即文件**：数据目录 `settings.yaml`（调度、摘要偏好、按用途的 agent 命令），外部 agent 可读同一份；不放进 Tauri 内部存储。

## 数据格式规范（storage 层必须严格遵守）

数据目录结构（**数据目录即 agent 工作区**：终端 cwd = 数据目录，CLI agent 启动即自动加载根目录 `.mcp.json` 与 `AGENTS.md`）：

```
~/ResearchThread/                  # 数据目录（与代码仓库分离）
├── AGENTS.md          # 数据目录内的 agent 行为规范（schema、命名、写入禁区）；由应用生成维护
├── .mcp.json          # 注册 MCP server（机器相关路径 → gitignore，应用按机器生成）
├── settings.yaml      # agent 相关设置
├── .gitignore         # 至少忽略 .mcp.json
├── .activity/log.jsonl
├── inbox/             # 快速捕获收件箱（未来的自然语言命令队列）
├── spaces/
│   ├── research/      # 空间（≈ 手写页的分类）
│   │   └── projects/
│   │       └── paper-xxx/         # 项目（≈ 一条工作线）
│   │           ├── project.md     # 人写区 + `## AI Summary`（agent 专属区）
│   │           └── tasks/
│   │               └── 2026-09-10-reply-reviewers.md   # 任务
│   └── dev/
├── weekly/2026-W37.md             # 周文档
└── daily/2026-09-10.md            # 日报（2d 起按配置生成）
```

任务文件 = YAML frontmatter（结构化属性）+ 追加式上下文条目（对应手写第二页）：

```markdown
---
title: 审稿意见回复
status: doing        # todo | doing | done | hold | dropped
star: true           # ☆ 紧急/重点
next: 补充静电结合能数据
created: 2026-09-10
updated: 2026-09-10
---

## 任务上下文

### 2026-09-10 · 我
最初的目标、逻辑、卡点……

### 2026-09-12 · agent（转述口述）
转折：……
```

硬性约定：

- 任务文件名 `YYYY-MM-DD-<slug>.md`，**slug 允许中文**，创建后不改名（稳定 ID）
- `status` 枚举固定 `todo | doing | done | hold | dropped`（hold = 搁置会回来；**dropped = 放弃不做**，对应手写「划掉」）；`star` 为布尔
- **任务上下文 = 按日期、带来源署名的追加式条目**：人可自由编辑自己的条目；**agent 只能追加带署名条目，永不改写已有内容**
- `project.md` 以 `## AI Summary` 章节为 agent 专属写入区，agent 永不覆盖人写内容（MCP 工具面无覆写操作，禁区是机制不是约定）
- 活动留痕 `.activity/log.jsonl`（追加式）：`{ts, actor: app|agent|external, entity, id, event, detail}`；**watcher 观察到的外部编辑（Obsidian/git/手改）也记 `external`**
- 所有数据变更必须经过 `src/storage/`，UI 不得直接调 fs 插件。**例外**：底部终端运行的 CLI agent、以及 Obsidian 等外部工具会直接改文件——因此 M2 起需文件变更监听（plugin-fs 的 watch）用于界面刷新，并发规则见 PLAN.md 第四节
- Windows 专项：行分割容忍 `\r\n`；子进程注意 UTF-8（chcp 65001）与 shell 选择设置项

## UI 布局（已定，用户明确要求）

IDE 式四区布局：

- **左侧栏（常驻）**：空间/项目树 + 收件箱入口
- **中间展示区**：主工作区，按视图切换（任务列表、项目上下文、今日视角…）
- **底部面板（可开关）**：第一阶段为内置终端（**经 AgentRunner 接口抽象**，工作目录 = 数据目录，用于调用 CLI agent）；第二步演化为 agent 对话面板——AgentRunner 是共同后端。不向终端投入 PTY 等增强
- **右侧栏（可开关）**：选中任务/项目的详情与上下文编辑

## 计划的代码结构

```
src/
├── main.tsx           # SPA 入口（Tauri webview 加载同构产物）
├── dataAccess.ts      # 数据访问接口（UI.md 第 2 节契约）+ mock 实现；M1 起由 storage 提供真实实现
├── mockData.ts        # 种子数据（兼验收用例：5 态全覆盖、含 agent 条目）
├── components/        # React 组件：research-app（四区布局壳）、sidebar、center-views、task-detail…
├── lib/               # settings（zustand persist）、status（分组排序）、markdown、format、cn
├── styles.css         # Tailwind v4 入口 + 主题变量与自定义类
├── storage/           # core / fsAdapter / index + atomicWrite（事务式写+中断恢复）/ snapshot（每日快照健康）/ weekly / git / errors——写回契约见 PLAN.md 第三节
├── map.ts             # （待建）项目地图快照序列化（今日视角/周报骨架/agent prompt 共用）
└── terminal.ts        # （M2 待建）底部终端面板 + AgentRunner
tests/                 # （M1 待建）vitest：storage round-trip（CRLF/中文/冒号/未知字段保留）、ISO 周跨年
mcp-server/            # （2b，暂不创建）Node：storage/core + node:fs + MCP SDK
```

## 里程碑

- **M1**（进行中）：UI 已集成（React SPA + mock 数据层）→ Tauri 2 壳 + storage 层（core / fsAdapter 拆分 + vitest 全绿）+ mock→storage 切换：可创建/编辑空间、项目、任务并落盘为 Markdown 文件树
- **M2**（内部顺序）：①活动日志 + 文件监听 → ②任务操作（状态/☆/next）→ ③快速捕获收件箱 → ④今日视角 → ⑤终端面板（AgentRunner + xterm）+ 数据目录初始化（git init、快照按钮、生成 AGENTS.md/.mcp.json/settings.yaml）
- **M3** 周文档一键生成（确定性骨架）+ 全文搜索、归档、markdown 预览（`marked`）
- **第二步阶梯**：2a AgentRunner CLI 后端 + map 快照进 prompt + 一键问 agent → 2b MCP server + agent 切工具接口 → 2c inbox 自然语言命令 + 对话面板 + 自动 commit → 2d 追赶式调度 + 日报/周报

## 协作约定

- **发版/打包的一切要求与红线见 [docs/release.md](docs/release.md)**：`release/`（仓库根，gitignore）是唯一发布产物位置，`npm run tauri build` 后必须 `npm run make-release` 生成；版本唯一事实源 `tauri.conf.json`（三处一致由脚本强制）；数据安全与隐私红线（事务写/冲突守卫/单实例/快照可见/零遥测/不收集数据目录）任何版本不得回退；每次发版过 §4 门槛清单并在 §8 发布记录表登记
- 文档与用户交流用**中文**；代码标识符、枚举值、commit message 用英文
- 提交前跑 `npm run tauri dev` 确认应用可启动、`npx vitest run` 确认 storage 测试全绿（M1 起适用）
- 完成里程碑后更新本文件「当前状态」并同步 README.md 的状态行
- 技术栈**起步极简但会扩展**（用户已明确）：建议引入新依赖/框架/自研 Rust 模块时说明理由与替代方案，重大架构变化需用户确认
- 反目标（防功能蔓延）：不做项目管理软件（无依赖图/甘特/协作者）、不做笔记软件（不追 wiki-link/图谱）、不做 chat-first（对话是手段，文件是资产）、不做可配置性蔓延
