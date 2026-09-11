# UI.md — M1 界面实现规格（自包含，供独立实现）

> **状态（2026-09-10）：已交付并集成。** 第一版按本规格交付（`ui_ref/`），剥离 SSR/登录/数据库后集成到仓库根目录 `src/`（React SPA + mock 数据层，`npm run dev` 可跑）。集成时的决策修订：第 1 节「无框架/无 CSS 框架/dependencies 为空」约束被用户明确放宽（React 19 + Tailwind v4，见 PLAN.md 第四节）；图标改用 `lucide-react` 而非纯 Unicode 符号。**第 2 节 `DataAccess` 接口契约不变**，继续作为 UI ↔ storage 的唯一边界；交付中超出 M1 范围的视图（搜索/今日/周报/图谱/agent 对话）按插件门控保留、默认关闭。本文件转为后续 UI 迭代的规格与验收基准。

> 用途：ResearchThread 第一阶段（M1）的界面实现规格。读者是独立实现者（人或 AI），**无需本仓库其他上下文**。实现产物将回流到本仓库集成：mock 数据层会被替换为真实存储层，因此数据访问接口签名不可改动。
> 界面文案用**中文**；代码标识符、枚举值、注释可用英文。

## 0. 产品背景（一段即可）

ResearchThread 是科研人员用的本地优先桌面应用（Tauri 2），把手写「思路整理」工作流数字化：**空间 → 项目 → 任务**三级层级；每个任务有状态/☆重点/下一步动作，以及一份**按日期追加的上下文日志**（为什么做、卡在哪、关键信息——应用的核心资产）。数据最终是磁盘上的 Markdown 文件树（本阶段与你无关，你只对接 mock 数据层）。成品是 IDE 风格四区布局的桌面窗口；你交付的是**浏览器可直接运行的界面原型**。

## 1. 硬性技术约束

- 原生 TypeScript + Vite（vanilla）。**无任何运行时依赖**：禁 React/Vue/Svelte/jQuery 等；`package.json` 的 `dependencies` 必须为空（devDependencies 仅 vite / typescript 相关）
- **手写 CSS**，禁 CSS 框架（tailwind/bootstrap 等）；颜色一律用 CSS 自定义属性，集中在 `style.css` 顶部 `:root`
- 所有数据读写经 `src/dataAccess.ts` 的**异步接口**（第 2 节，签名不可改）；视图代码不得内嵌数据、不得绕过接口操作 mock
- TS strict 编译零错误；浏览器 console 零报错
- 文件结构固定：

```
index.html
src/
├── main.ts          # 入口：布局骨架、选中状态、面板开关
├── views.ts         # 视图渲染（树、任务列表、空间总览、项目上下文、详情）
├── dataAccess.ts    # 类型 + DataAccess 接口 + mock 实现（导出 getDataAccess(): DataAccess）
├── mockData.ts      # mock 数据集（要求见 2.3）
└── style.css
```

- 桌面尺寸：目标窗口 ≥1100×700，最小按 1000px 宽处理；**不做移动端适配**

## 2. 数据模型与访问接口（逐字实现）

```ts
export type TaskStatus = 'todo' | 'doing' | 'done' | 'hold' | 'dropped';

export interface TaskMeta {
  id: string;            // 文件名（稳定 ID），如 "2026-09-10-reply-reviewers.md"
  title: string;
  status: TaskStatus;
  star: boolean;
  next: string;          // 下一步动作，可为空串
  created: string;       // YYYY-MM-DD
  updated: string;       // YYYY-MM-DD
}

export interface ContextEntry {
  date: string;          // YYYY-MM-DD
  author: 'me' | 'agent';
  text: string;
}

export interface Task extends TaskMeta {
  entries: ContextEntry[]; // 时间正序（旧 → 新）
}

export interface Project {
  id: string;            // 目录 slug，如 "paper-dft"
  name: string;
  description: string;   // 项目整体上下文（markdown 源码，人写区）
  tasks: Task[];
}

export interface Space {
  id: string;            // 目录 slug，如 "research"
  name: string;
  projects: Project[];
}

export interface DataAccess {
  listSpaces(): Promise<Space[]>;
  getTask(spaceId: string, projectId: string, taskId: string): Promise<Task>;
  createSpace(name: string): Promise<Space>;
  createProject(spaceId: string, name: string): Promise<Project>;
  createTask(spaceId: string, projectId: string, title: string, next?: string): Promise<Task>;
  updateTaskMeta(spaceId: string, projectId: string, taskId: string,
    patch: Partial<Pick<TaskMeta, 'title' | 'status' | 'star' | 'next'>>): Promise<TaskMeta>;
  appendEntry(spaceId: string, projectId: string, taskId: string,
    entry: { text: string }): Promise<Task>;          // date=今天、author='me'，由实现层填
  updateEntry(spaceId: string, projectId: string, taskId: string,
    index: number, text: string): Promise<Task>;      // 仅允许 author='me' 的条目
  updateProjectDescription(spaceId: string, projectId: string, description: string): Promise<void>;
  deleteTask(spaceId: string, projectId: string, taskId: string): Promise<void>;
}
```

实现说明：mock 内部持有内存数据集，每次写操作后 `updated` 字段更新为当天；UI 在写操作完成后**重新调用接口**刷新相关视图（本阶段无文件监听，简单粗暴即可）。mock 不要求持久化（刷新页面重置可接受）。

### 2.3 mock 数据要求

≥2 个空间（如「科研」「开发」）、≥4 个项目、≥10 个任务**覆盖全部 5 种状态**；≥3 个任务带 star；多数任务有 2+ 条不同日期的上下文条目；**至少 1 条 `author: 'agent'` 的条目**（验证只读渲染）；日期跨越数周（体现「回到工作现场」场景）；内容用真实感中文科研场景（审稿意见回复、实验计算、论文阅读、工具开发等）。

## 3. 布局（IDE 式四区）

```
┌──────────┬──────────────────────────────┬────────────┐
│ 左侧栏    │ 工具栏：面包屑 · 视图tab · 面板开关 │            │
│ (常驻)    ├──────────────────────────────┤ 右侧栏      │
│ 空间/项目树│                              │ (可开关)    │
│          │         中间展示区              │  任务详情   │
│ ──────── │──────────────────────────────│  与编辑     │
│ 收件箱入口│   底部面板（可开关 · 本阶段占位）  │            │
└──────────┴──────────────────────────────┴────────────┘
```

- 宽度：左 240px（内容可滚动）、右 340px、底部高 260px，中间自适应；拖拽调宽为加分项非必需
- **左侧栏常驻不可关闭**；右侧栏、底部面板可开关（工具栏按钮；快捷键 `Ctrl+\` 右、`Ctrl+J` 底，加分项）
- Esc 不用于关面板，只用于取消编辑/输入

## 4. 各区域详细要求

### 4.1 左侧栏：空间/项目树

- 两级树：空间 → 项目；空间行可折叠（▸/▾）
- 项目行：名称 + 进行中数量徽标（为 0 不显示）；点击项目即选中并切到中间任务列表
- 创建均为**行内输入**（不用弹窗）：树顶部「+ 空间」；悬停空间行出现「+ 项目」；输入框 Enter 确认 / Esc 取消
- 树底部固定「📥 收件箱」入口：点击后中间显示占位「收件箱将在 M2 上线」
- 当前选中的空间/项目有高亮态

### 4.2 中间展示区

工具栏：面包屑（空间名 / 项目名）+ 视图 tab（**「任务」「项目上下文」**，选中项目后出现）+ 右端面板开关按钮组。

**A. 任务列表（默认视图）**
- 按状态分组，组序固定：**进行中 → 待办 → 已搁置 → 已完成（默认折叠）→ 已放弃（默认折叠）**；组头「状态名 · 数量」（如「进行中 · 3」，已完成组头带 ✓）
- 组内排序：**☆ 置顶**，其余按 updated 倒序
- 任务行：☆（有 star 时，金色）+ 标题 + 次行灰字 `→ 下一步动作`（next 非空时）+ 右侧淡色 updated。**已放弃任务标题加删除线**（对应手写「划掉」标记）
- 点击选中任务（右栏联动显示详情）
- 列表顶部「+ 新任务」行内创建：标题必填 + next 可选，Enter 创建
- 空状态：引导文案 + 创建入口

**B. 项目上下文**
- 编辑项目 `description`（markdown 源码）：`<textarea>` + 顶部「编辑/预览」切换（预览可为占位或简单渲染，加分项）；**显式保存**按钮 + 脏标记（有未保存改动时按钮高亮）

**C. 空间总览**（选中空间、未选项目时）
- 项目卡片行：项目名 + 进行中/待办计数 + 最近 updated；点击进入该项目

### 4.3 右侧栏：任务详情（选中任务时）

自上而下：

1. **元数据表单**：标题（文本）、状态（下拉：待办/进行中/已完成/已搁置/已放弃）、☆ 切换（☆/★）、下一步动作（文本）；表单下方小字显示**稳定 ID**（等宽字体，如 `2026-09-10-reply-reviewers.md`）与 created / updated
2. **保存约定（重要）**：状态、☆ **点击即生效**（调接口后刷新）；标题、next **显式保存**（Enter 或保存按钮；有改动时显示脏标记 + 保存/放弃）
3. **上下文条目区**：时间正序（旧→新）列出，每条头部 `2026-09-10 · 我` / `2026-09-12 · agent` + 正文；**agent 条目只读且样式区分**（如左侧竖线）；`author='me'` 条目 hover 出「编辑」，就地变 textarea 保存
4. **追加条目**：底部常驻输入框 +「追加」按钮（日期=今天、作者=我，对应追加式日志语义）
5. **删除任务**：底部弱化文字按钮，**两步确认**：点击变「确认删除？」，再次点击才执行，3 秒未确认自动还原

未选中任务时右栏显示「未选择任务」占位。

### 4.4 底部面板（占位）

可开关；内容仅占位文案「终端面板将在 M2 上线（AgentRunner）」。保留容器结构，**不做任何终端模拟**。

## 5. 视觉风格

- IDE 风：紧凑密度（基准字号 13px / 行高 1.5），层级靠留白与灰度，不用大字号大色块
- **默认深色主题**，全部颜色走变量（建议值，可微调但保持克制）：

```css
:root {
  --bg: #1b1d21;         /* 主背景 */
  --bg-panel: #22252b;   /* 树/面板背景 */
  --bg-hover: #2a2e36;
  --border: #33373f;
  --text: #d6d9de;
  --text-dim: #8b919c;
  --accent: #6ea3d7;     /* 选中/焦点 */
  --star: #e2b93b;       /* ☆ */
  --st-doing: #6ea3d7;
  --st-todo: #8b919c;
  --st-done: #7fbf8e;
  --st-hold: #d9a03f;
  --st-dropped: #b0685f;
}
```

- 状态显示名固定：todo=待办、doing=进行中、done=已完成、hold=已搁置、dropped=已放弃
- 字体：界面用系统 UI 字体栈；日期/ID/文件名用等宽字体栈
- **不引入图标库**：用 Unicode 符号（☆ ★ ✓ ▸ ▾ 📥），呼应原始手写标记体系
- 浅色主题为加分项（仅换变量值）

## 6. 交互约定

- 行内创建/编辑为主，**不实现模态弹窗**
- 任何写操作完成后重新从接口读取并重渲染相关视图
- Enter 确认 / Esc 取消并还原；所有可交互元素有 hover 与 focus-visible 态
- 空状态全覆盖：无空间（首次启动引导）、空间无项目、项目无任务、右栏未选任务、中间无选中

## 7. 明确不做（范围外）

搜索、今日视角、周文档、收件箱实际功能、终端、agent 相关 UI、拖拽排序、标签、通知、移动端、国际化（仅中文）、明暗切换 UI（仅变量预留）。

## 8. 验收清单（交付前自检）

1. `npm install && npm run dev` 浏览器直接可跑；console 无报错；`npx tsc --noEmit` 零错误
2. `dependencies` 为空；无框架、无 CSS 框架
3. 文件结构与第 1 节一致；`DataAccess` 接口签名未被改动
4. CRUD 全通：建空间/项目/任务、改状态/☆/标题/next、追加与编辑条目、改项目描述、两步删除
5. 分组排序正确：☆ 置顶、updated 倒序、已完成/已放弃默认折叠、已放弃删除线
6. 保存约定正确：状态/☆ 即时生效；标题/next 显式保存 + 脏标记
7. agent 条目只读可区分；条目时间正序
8. 面板开关工作；收件箱与底部面板为占位
9. 空状态全覆盖；深色主题全部变量化
