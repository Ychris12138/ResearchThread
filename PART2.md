# PART2 技术报告 — 第二步（agent 时代）调研与技术准备

> 状态：**调研完成，待实施**（2026-09-11）
> 范围：第二步阶梯 2a→2b→2c→2d 的技术选型、设计决策、风险与排期。
> 前置阅读：[PLAN.md](PLAN.md)（第三节写回契约、第六节信任模型、第七节定时总结、第九节里程碑）、[AGENTS.md](AGENTS.md)。
> 调研来源：Claude Code / Codex CLI 官方文档与 issue 追踪（见文末参考），本仓库 M1–M3 实测结论。

---

## 一、目标与阶梯回顾

终态：**人只说自然语言，agent 维护整个项目地图；按设置定时产出日报/周报。**

| 阶段 | 交付 | 依赖 |
|---|---|---|
| 2a | 「一键问 agent」：CLI agent 后端跑通 + 项目地图快照进 prompt + 结果落为 agent 条目 | 无（全部就绪） |
| 2b | 独立 MCP server：agent 从"摸文件"升级为"调工具"，工具面即信任边界 | storage/core（✓） |
| 2c | inbox 自然语言命令 + 对话面板 + agent 会话自动 commit | 2a、2b |
| 2d | 追赶式调度 + 日报/周报（确定性骨架 + LLM 叙事） | 2a、weekly.ts（✓） |

## 二、已就绪资产盘点（第一步铺路成果，全部实测可用）

| 资产 | 位置 | 对第二步的意义 |
|---|---|---|
| `DataAccess` 契约 | `src/types.ts`（UI.md 第 2 节） | MCP 工具面就是它的"agent 视角"投影，设计已收敛 |
| storage 纯核心 | `src/storage/core.ts`（无 Tauri API） | 2b 直接复用，零改动 |
| node:fs 适配器 | `tests/storageNode.test.ts` 内 `NodeFsAdapter` | 2b 的 IO 层雏形，迁出即可用 |
| 活动日志 schema | `.activity/log.jsonl`（525+ 条真实数据） | agent 的观察输入；`logActivity` 已支持 `actor: "agent"` |
| 周文档确定性骨架 | `src/storage/weekly.ts` | 2d 的"骨架"，agent 只补叙事 |
| AgentRunner + spawn 链路 | `src/lib/agentRunner.ts` + 终端面板 | 2a 的执行通道（git status 实测跑通） |
| 数据目录 agent 工作区 | `AGENTS.md` / `.mcp.json` / `settings.yaml` / git | 2b 注册与行为规范的落点已存在 |
| 信任模型（写入分级） | PLAN.md 第六节 | 工具面设计的原则：**没有覆写人写内容的工具** |

## 三、2a「一键问 agent」技术方案

### 3.1 CLI agent 调研结论

**Claude Code（首选后端）**——headless 模式成熟：

```bash
claude -p "<prompt>" \
  --output-format stream-json \   # JSONL 事件流（进度走 stderr，结果走 stdout）
  --allowedTools "Read Grep Glob" \  # 2a 只读分析：白名单禁写
  --cwd 可由 spawn cwd 指定          # = 数据目录，自动加载 AGENTS.md / .mcp.json
```

- 会话续问：`--resume <session_id>`（可配合 `--input-format stream-json` 从 stdin 送新消息）；首轮回调的 `result` 事件携带 `session_id`，**应用侧只需保存这个 id**
- 事件类型（stream-json）：`system`（init，含 session_id 与工具清单）→ `assistant`（消息块）→ `user`（工具结果回显）→ `result`（最终文本 + cost/duration/num_turns/session_id）。2a 只消费 `result` 与 `system.session_id`
- 已知缺陷：stream-json 模式存在进程挂起的 issue（anthropics/claude-code#53584）→ **必须做看门狗超时 + kill + 一次性重试**
- 进阶选项：官方 Agent SDK（`@anthropic-ai/claude-agent-sdk`）封装了上述协议。**本轮不引入**（见第七节），手写解析器很薄（逐行 `JSON.parse` + 事件分发，~80 行）

**Codex CLI（第二后端，验证了三个关键坑）**：

```bash
codex exec "<prompt>" --sandbox read-only --json
```

- 默认沙箱即 read-only，适合 2a 只读分析；`--sandbox workspace-write` 为写入模式；`--full-auto` 已弃用
- **坑 1（Windows）**：`--sandbox workspace-write` 在 Windows 上实际仍是 read-only（openai/codex#34961）→ **Windows 上的写操作类 agent 任务优先走 Claude 后端**
- **坑 2**：alpha 版本存在沙箱下 MCP 工具调用被取消的回归 → 锁定 stable 版本 + 启动时版本探测
- **坑 3**：`--json` 事件结构随版本漂移 → 解析器必须容错（逐行 try-parse，未知事件跳过）

**Gemini CLI 等**：接口形态类似（非交互 + MCP），作为 settings.yaml 可配置的第三选项保留，不做专项适配。

### 3.2 Windows 专项（本机已踩实的前提）

- npm 全局安装的 `claude` 在 Windows 是 `claude.cmd` shim，`Command.create("claude")` 可能直接失败 → **回退链**：直接 spawn 失败时改 `cmd /c claude …`（`cmd` 已在 shell 白名单）；settings.yaml 支持写绝对路径
- 子进程 UTF-8：`encoding: "utf-8"` + 必要时 `chcp 65001`（M2 终端已验证）
- GUI 启动的应用 PATH 与终端不同 → 打包版需要 settings.yaml 显式路径或安装器写 PATH（dev 模式无此问题，从 shell 继承）

### 3.3 AgentRunner 扩展设计

现有 `AgentRunner`（M2）只有原始 spawn。2a 增加**结构化层**（仍在 `src/lib/agentRunner.ts`）：

```ts
export interface AgentQueryResult {
  text: string;          // result 事件的最终文本
  sessionId: string | null;
  costUSD: number | null;
  durationMs: number;
  backend: "claude" | "codex";
}
export interface StructuredAgentRunner {
  ask(prompt: string, opts: {
    backend: string;              // settings.yaml agents 段
    cwd: string;                  // 数据目录
    readOnly: boolean;            // 2a=true（工具白名单只读）；2c 口述执行=false
    resumeSessionId?: string;     // 有则 --resume
    timeoutMs?: number;           // 看门狗，默认 120s
    onEvent?(ev: StreamEvent): void;  // 对话面板（2c）复用
  }): Promise<AgentQueryResult>;
}
```

- **stream-json 解析器**：逐行 try-parse，`result` 取文本；未知行静默跳过（版本容错）
- **看门狗**：`timeoutMs` 到点 kill 子进程 + 抛可重试错误（挂起 issue #53584 的对策）
- **命令探测**：`claude --version` / `codex --version` 探测可用性，结果缓存；两者都不可用 → UI 明示

### 3.4 prompt 组装与 `map.ts`（新模块）

`map.ts` 是 PLAN 既定的三合一快照函数（今日视角/周报/agent prompt 共用）：

```ts
export function buildProjectMap(spaces: Space[], opts?: { maxChars?: number }): string
```

- 紧凑文本格式：空间 → 项目 → 任务行（`☆ 标题 [状态] 更新日期 → 下一步`），截断策略：优先保留 doing/star，超 `maxChars`（默认 6000）按 updated 最旧优先丢弃并注明
- 「一键问 agent」prompt 模板（任务级）：

```
以下是 ResearchThread 中任务「{title}」的完整档案（frontmatter + 按日期的上下文条目）
以及它所在的项目地图。请基于档案回答：{用户问题}
【任务档案】{task 文件全文}
【项目地图】{buildProjectMap()}
```

- 入口 UI：右栏任务详情加「问 agent」按钮（可编辑问题输入框），结果流式显示（2a 简版：完成后整段显示）

### 3.5 信任模型的第一次落地

agent 回答**不直接显示完事**，而是：

1. 追加为任务上下文条目 `### {今天} · agent`（复用 `appendEntry`，唯一落地点）
2. 活动日志记 `actor: "agent"`（`logActivity` 已支持）
3. UI 上 agent 条目本就是只读样式（M1 已做）——视觉与机制一致

这条链路跑通 = 2c 对话面板写回、2b MCP `append_context_entry` 的信任路径全部复用同一机制。

### 3.6 2a 任务清单与验收

| # | 任务 | 验收 |
|---|---|---|
| 1 | `map.ts` buildProjectMap + 单测 | 快照含 star/next/状态，截断策略生效 |
| 2 | stream-json 解析器 + fixture 测试 | 挂起/坏行/版本漂移容错 |
| 3 | StructuredAgentRunner（claude+codex 双后端、看门狗、探测） | 本机两个后端各跑通一次只读问答 |
| 4 | settings.yaml agents 段读取 | 改配置即换后端，无需改码 |
| 5 | 任务详情「问 agent」按钮 + 结果落 agent 条目 | 条目带 agent 署名、日志 actor=agent、可续问 |
| 6 | 文档：AGENTS.md/README 更新 | — |

## 四、2b MCP server 技术方案

### 4.1 协议与 SDK

- MCP：JSON-RPC 2.0 over stdio；官方 TS SDK `@modelcontextprotocol/sdk`，现代 API 为 `McpServer` + `registerTool(name, {description, inputSchema(zod)}, handler)` + `StdioServerTransport`，协议版本协商内建
- 进程模型：**独立 Node 进程**（`mcp-server/`），应用不参与运行——外部 agent（claude code 等）按需拉起；这正是"应用只是编排器，agent 可替换"的架构落地

### 4.2 工具面设计（信任边界的机制化）

| 工具 | 输入 | 写入对象 | 信任级 | 日志 actor |
|---|---|---|---|---|
| `get_project_map` | maxChars? | 无（读） | 只读 | — |
| `get_task` | space/project/task id | 无 | 只读 | — |
| `query_activity` | since/until/actor | 无 | 只读 | — |
| `search` | query | 无 | 只读 | — |
| `create_space/project/task` | 名称等 | 新文件 | 口述执行级 | agent |
| `set_status` / `set_star` / `set_next` | id + 值 | frontmatter 已知字段 | 口述执行级 | agent |
| `append_context_entry` | id + text | **只追加**带 agent 署名条目 | 口述执行级 | agent |
| `write_ai_summary` | id + text | **仅 `## AI Summary` 段** | agent 专属区 | agent |
| `delete_task` / `set_dropped` / `rename`（若有） | id | 破坏性 | **确认门**：入参必填 `confirmed: true`，且 AGENTS.md 规范要求 agent 先向用户确认 | agent |

要点：**工具面物理上不存在"覆写人写上下文"的操作**——第一步承诺的"禁区是机制"在 2b 兑现。

### 4.3 注册与发现（客户端差异，实测调研）

- **Claude Code**：项目根 `.mcp.json`（`mcpServers.{name}.{command,args,env}`）自动加载，首次使用需用户批准；env 必须写在 `.mcp.json`（放 settings.json 会被静默忽略——社区高频坑）。应用生成 `.mcp.json`：`command: "node"`、`args: ["<绝对路径>/mcp-server/dist/index.mjs", "--data-dir", "<数据目录>"]`（机器相关 → 由应用按机器生成，gitignore 已配置）
- **Codex**：不读 `.mcp.json`，走 `~/.codex/config.toml` 或一次性命令 `codex mcp add researchthread -- node <path>`——应用设置页提供"复制 Codex 注册命令"按钮，不代写用户全局配置
- 现有 `.mcp.json` 占位（`{"mcpServers": {}}`）在 2b 填充

### 4.4 关键设计问题：MCP 写入的归属（external vs agent）

MCP server 是**独立进程**，它的写入会被应用 watcher 捕获；但 `markSelfWrite` 是应用进程内存表，跨进程不可见 → 会被误记 `external`（M2 末已验证过 watcher 对归属的敏感性）。

**选定方案：前置日志协议（will-write）**——MCP server 每次写文件**之前**先 `append` 一条日志：

```json
{"ts":"...","actor":"agent","entity":"file","id":"<相对路径>","event":"will_write"}
```

应用 watcher 的 flush 逻辑升级：归类时读日志尾部（近期 will_write 记录）命中同路径 → 记 `agent` 而非 `external`。优点：无跨进程通信、追加式日志天然有序、失败安全（写后崩溃则那条文件变化仍可由 will_write 佐证）。备选（sidecar 标记文件、socket 通知）否决理由：复杂度不成比例。

### 4.5 打包与分发

- `mcp-server/` 独立 `package.json`（deps：`@modelcontextprotocol/sdk`、`zod`），源码经 esbuild bundle 成**单文件 `dist/index.mjs`**——外部 agent 只需 node + 一个文件路径，无 node_modules 依赖问题
- `storage/core` 以源码级复用（bundle 打进去），`NodeFsAdapter` 从 tests 迁为 `src/storage/nodeFsAdapter.ts` 共享
- 不发布 npm：本地工具，路径写进 `.mcp.json` 即可

### 4.6 2b 任务清单与验收

| # | 任务 | 验收 |
|---|---|---|
| 1 | `NodeFsAdapter` 迁出 + will_write 协议 | watcher 归类 agent 正确 |
| 2 | MCP server 骨架 + 3 个只读工具 | claude code 中 `/mcp` 可见并调用成功 |
| 3 | 全部写入工具 + 确认门参数 | 越权写（覆写人写区）无工具可走 |
| 4 | `.mcp.json` 生成 + Codex 注册命令 | claude code 在数据目录零配置拿到工具面 |
| 5 | 双写并发压测（应用与 MCP 同时写同文件） | 无数据丢失（写回契约守护） |

## 五、2c 自然语言命令 + 对话面板

### 5.1 解析器选型（inbox 命令 → 结构化操作）

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **CLI agent（推荐）** | 复用 2a 全部基建；模型无关；**无需管理 API key**（用 CLI 登录态）；可用 MCP 工具直接操作 | 延迟秒级；依赖 CLI 安装 | ✅ 2c 采用 |
| 直连 LLM API | 低延迟、结构化输出可控 | key 管理/计费/厂商绑定，违背"应用是编排器不是模型宿主" | 推迟，待有明确需求 |
| 本地模型（ollama 等） | 离线、零成本 | 质量/中文能力不稳，双环境维护 | 否 |

inbox 的 N 条积压 = N 个待解析命令：批量送 agent（单次会话解析全部条目 → 逐条调 MCP 工具执行 → 输出执行报告），失败条目留在 inbox。

### 5.2 对话面板

- 底部面板第二形态：消息列表（user/assistant）+ 输入框；复用 `StructuredAgentRunner.onEvent` 流式渲染；`resumeSessionId` 维持会话
- 面板上下文注入：对话自动携带 `buildProjectMap()`（紧凑快照），用户也可 `@任务` 引用具体档案
- 与终端共用容器（AgentRunner 双消费者，PLAN 既定）

### 5.3 会话自动 commit

- 触发点：agent 会话结束（面板关闭/「落盘并提交」）→ `git.ts` 现成 `gitSnapshot`，message 改为 `agent session: <摘要首行>`——机制已有，只差调用点与文案

## 六、2d 定时总结

- **追赶式调度**：`settings.yaml` 增 `summary.last_weekly/last_daily`（设置即文件，外部 agent 亦可读）；应用启动时比较间隔 → 不足则补生成；运行中 `setInterval` 检查（桌面应用非常驻服务，按错过后补设计，PLAN 已定）
- **管线**：`buildWeeklySkeleton`（✅ 已有）→ 交 CLI agent 补 `## AI 点评` 段（只读分析，不写文件，由应用写回）→ 落 `weekly/`；日报同构（骨架更薄）
- 通知：应用内横幅复用（外部变更横幅组件），**不引入**系统通知插件（列为远期可选）

## 七、技术栈决策汇总

| 决策点 | 选择 | 理由 | 备选（否决理由） |
|---|---|---|---|
| agent 执行通道 | plugin-shell spawn CLI（已有） | 模型无关、零新增运行时依赖 | 直连 HTTP API（key 管理+绑定） |
| 首选后端 | Claude Code headless | 协议最成熟（stream-json/resume/权限白名单） | Codex（Windows 沙箱 bug） |
| 事件解析 | 自写 ~80 行 JSONL 解析器 | 薄、可控、容错易测 | Agent SDK（多一层依赖，协议没复杂到需要它） |
| MCP SDK | `@modelcontextprotocol/sdk` + zod | 官方、registerTool 现代 API | 手写 JSON-RPC（没必要） |
| 打包 | esbuild 单文件 mjs | 零依赖分发 | npx 动态拉（离线不可用） |
| 2c 解析器 | CLI agent | 见 5.1 对比 | 直连 API（推迟）/本地模型（否） |
| 调度 | 应用内定时器 + 启动补跑 | 桌面应用非常驻 | 常驻服务/系统计划任务（违背单机自包含） |
| 通知 | 应用内横幅 | 零依赖 | tauri-plugin-notification（远期可选） |

**不引入清单**：LangChain/agent 框架（协议本身够薄）、直连 LLM SDK（推迟）、本地模型运行时、消息队列、额外数据库——每一项都违背"应用是编排器+信任边界，文件是资产"的定位。

## 八、风险登记册

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| 1 | claude stream-json 挂起（#53584） | 会话卡死 | 看门狗超时 + kill + 重试一次；UI 可取消 |
| 2 | codex Windows 沙箱 write 实为只读（#34961） | 2c 写任务失败 | Windows 写操作路由到 claude 后端；codex 限定只读分析 |
| 3 | codex alpha 沙箱下 MCP 取消回归 | 2b 联调受阻 | 锁 stable；版本探测；issue 跟踪 |
| 4 | CLI 标志漂移（--json 结构等） | 解析中断 | 容错解析（逐行 try-parse）+ fixture 测试 + 版本探测降级 |
| 5 | `.cmd` shim / PATH | spawn 失败 | cmd /c 回退链 + settings 绝对路径 + 打包版 PATH 说明 |
| 6 | token 成本/上下文超限 | 慢、贵 | map 快照字符预算 + 截断；只读白名单减少工具往返 |
| 7 | 隐私边界（内容出本机） | 合规/心理预期 | AGENTS.md 与文档明示；本地优先 ≠ 离线，用户自选后端 |
| 8 | MCP 跨进程写归属 | 活动日志失真 | will_write 前置日志协议（4.4） |
| 9 | resume 会话失效（CLI 内部存储清理） | 续问失败 | 失败自动降级为新会话，session id 仅作优化不作依赖 |

## 九、排期建议与总体验收

| 阶段 | 预估 | 出口判据 |
|---|---|---|
| 2a | 1–2 天 | 界面点「问 agent」→ 回答落为 agent 条目 → 活动日志 actor=agent → 可续问 |
| 2b | 2–3 天 | claude code 在数据目录零配置调工具完成"新建任务并写摘要"；越权写无路径；并发写零丢失 |
| 2c | 2–3 天 | inbox 三条口述全部自动归位；对话面板多轮；会话自动 commit 可回滚 |
| 2d | 1–2 天 | 关机错过→启动补生成；断网时骨架周报仍可产出（叙事段标注"暂缺"） |

**总体验收**（第二步完成的定义）：对着收件箱说「下个月要重投 XX 会议，建个项目，把回复审稿人的经验带过去」→ agent 建项目建任务、迁移上下文、周报里出现这件事——全程只说了这一句话，且每一步在活动日志里可查、git 里可回滚。

## 参考

- [Claude Code CLI 官方文档](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/quickstart)
- [claude-code#53584 — stream-json 挂起](https://github.com/anthropics/claude-code/issues/53584)
- [codex#34961 — Windows workspace-write 实为只读](https://github.com/openai/codex/issues/34961)
- [Codex 非交互模式（--full-auto 弃用说明）](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Claude Code MCP quickstart（.mcp.json 项目作用域）](https://code.claude.com/docs/en/mcp-quickstart)
- [.mcp.json env 配置坑（settings.json 静默忽略）](https://adamkinney.com/aatt/claude-code/mcp-env-vars-silent-failure-settings-json-vs-mcp-json/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) / [官方 SDK 文档（2026-07-28）](https://modelcontextprotocol.io/docs/2026-07-28/sdk)
- [registerTool 现代用法](https://pub.towardsai.net/mcp-fundamentals-building-a-typescript-mcp-server-with-tools-resources-prompts-sampling-and-9dd670f86fc7)
