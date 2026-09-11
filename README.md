# ResearchThread

本地优先的科研/工作流程管理桌面应用（Tauri 2，macOS + Windows）。把手写「思路整理」工作流数字化：**空间 → 项目 → 任务**三级层级 + 双层上下文（项目整体上下文 / 任务上下文）+ 周文档。

第二步（已规划、未开始）：**人只说自然语言，agent 维护整个项目地图**——口述新任务/新项目/任务转折即可，agent 经 MCP 工具接口执行并定时产出日报/周报。

## 状态

**M3 完成 + 种子发布加固**（2026-09-11，M1–M3 全部落地并实机验证）：数据落盘（Markdown 文件树）、活动日志、文件监听、收件箱、今日视角、终端面板、数据目录初始化、周文档一键生成、全文搜索、项目归档、markdown 预览之上，按发布前审阅补齐数据安全九项：事务式可恢复写入、单实例、外部编辑冲突防护、每日快照健康（git 缺失界面可见）、未保存草稿退出保护、周文档覆盖确认、周报正确性修正、watcher 路径归一化、种子手册（隐私边界 + 脱敏反馈模板）。下一步：干净 Windows 环境实测 → release tag → 受控种子版；随后第二步阶梯 2a。计划见 [PLAN.md](PLAN.md)。

## 文档导航

| 文件 | 内容 |
|---|---|
| [PLAN.md](PLAN.md) | 需求 + 技术计划（唯一事实来源） |
| [AGENTS.md](AGENTS.md) | AI agent 工作上下文：关键决策、数据规范、协作约定 |
| [PART2.md](PART2.md) | 第二步（agent 时代）技术报告：2a–2d 调研、选型、风险与排期 |
| [UI.md](UI.md) | M1 界面实现规格（自包含，供外部实现；含数据访问接口契约与验收清单） |
| [docs/seed-manual.md](docs/seed-manual.md) | 种子测试手册：安装/SmartScreen、数据与快照、并发规则、隐私说明与脱敏反馈模板 |

## 技术栈

- React 19 + Vite + Tailwind v4（SPA；2026-09-10 采纳外部按 UI.md 交付的 UI，剥离其 SSR/登录/数据库）
- Tauri 2（待接入，起步零自定义 Rust）
- 所有数据访问统一走 `src/dataAccess.ts` 接口（[UI.md](UI.md) 第 2 节契约）；当前为 mock 实现，M1 换接 storage 层
- 数据层 `src/storage/`（待建）：纯核心（core，无 Tauri API）+ IO 适配器（fsAdapter，plugin-fs）拆分——将来同一核心配 `node:fs` 即成 MCP server；`vitest` 单测守护写回契约（宽松读/规范写/保留未知字段）
- 终端面板（M2）：`tauri-plugin-shell` + `@xterm/xterm`，经 AgentRunner 接口抽象（第二步对话面板与终端共用后端）
- 数据：Markdown 文件树 + YAML frontmatter，数据目录即 agent 工作区（`AGENTS.md` / `.mcp.json` / `settings.yaml`），可用 Obsidian / git 直接操作

UI 布局：左侧栏（空间/项目树）｜中间展示区｜底部可开关面板（第一阶段内置终端，第二步 agent 对话）｜右侧可开关侧边栏（详情/上下文编辑）。

## 快速开始

```bash
npm install
npm run dev              # 浏览器预览（mock 数据）
npm test                 # vitest：storage 写回契约 + 生命周期
npm run build            # tsc + vite build
```

桌面端（Tauri 2，数据落盘为 Markdown 文件树）：

```bash
npm run tauri dev        # 需 Rust 工具链；Windows 本机构建环境见 AGENTS.md「当前状态」
```

数据目录默认 `~/ResearchThread/`，首次启动自动初始化（目录骨架、`AGENTS.md`、`settings.yaml`、`.mcp.json`、git init）。
