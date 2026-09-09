# ResearchThread

本地优先的科研/工作流程管理桌面应用（Tauri 2，macOS + Windows）。把手写「思路整理」工作流数字化：**空间 → 项目 → 任务**三级层级 + 双层上下文（项目整体上下文 / 任务上下文）+ 周文档，未来由 agent 自动完成上下文归纳。

## 状态

**M0 规划完成，尚无代码**（2026-09-10）。下一步见 [PLAN.md](PLAN.md) 里程碑 M1。

## 文档导航

| 文件 | 内容 |
|---|---|
| [PLAN.md](PLAN.md) | 需求 + 技术计划（唯一事实来源） |
| [AGENTS.md](AGENTS.md) | AI agent 工作上下文：关键决策、数据规范、协作约定 |

## 技术栈（极简原则：零自定义 Rust、无前端框架、运行时依赖 ≤ 3）

- Tauri 2（vanilla-ts 模板）
- 原生 TypeScript + Vite，手写 CSS，`<textarea>` 编辑
- 文件 IO：官方 `tauri-plugin-fs`（JS API）
- 数据：Markdown 文件树 + YAML frontmatter（可用 Obsidian / git 直接操作）

## 快速开始

> 待 M1 初始化脚手架后补充（`npm create tauri-app` → `npm run tauri dev`）。
