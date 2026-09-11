# 发布流程与边界（Release Playbook）

> **每次打包发版前必读。** 本文件是发版的唯一规范；与代码冲突时以本文件为准修复代码。
> `release/`（仓库根）是**唯一**发布产物位置，由 `npm run make-release` 生成——本目录不手工编辑、不手工投放文件。

## 0. 一句话流程

```bash
export PATH="/d/perl/c/x86_64-w64-mingw32/bin:/d/perl/c/bin:$HOME/.cargo/bin:$PATH"
export RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu
npx vitest run            # ① 测试全绿
npm run build             # ② tsc + vite 构建通过
npm run tauri build       # ③ NSIS 安装包（同上环境）
npm run make-release      # ④ 归拢 release/（含门槛自检）
```

## 1. 位置与产物（不变量）

- `release/` 在仓库根、**gitignore**，内容只能由 [scripts/make-release.mjs](../scripts/make-release.mjs) 生成；脚本是入库的，产物不入库。
- 产物固定四件套，缺一不可：
  | 文件 | 内容 | 源头 |
  |---|---|---|
  | `ResearchThread_<v>_x64-setup.exe` | NSIS 安装包 | `npm run tauri build` |
  | `SHA256SUMS.txt` | 安装包与手册的 SHA-256 | 脚本计算 |
  | `README.md` | 下载/校验/安装说明 + 构建提交记录 | 脚本模板 |
  | `种子测试手册.md` | 种子用户手册副本 | `docs/seed-manual.md`（只改源头，不改副本） |
- 每次生成**整体覆盖**：`release/` 只保留最新一个版本，不堆历史；历史版本靠 git tag 重新构建复现，发布后的安装包应转存到发布渠道/网盘归档。
- 手工改 `release/` 里任何文件 = 无效发布，下次生成会被覆盖。

## 2. 版本规则

- 版本号的**唯一事实源**是 `src-tauri/tauri.conf.json` 的 `version`；`package.json` 与 `src-tauri/Cargo.toml` 必须保持一致（**脚本强制检查，不一致直接失败**）。
- 发版必须先在 git 打 tag `vX.Y.Z`，tag 指向的提交 = 构建提交；从脏工作区构建会被脚本警告。
- 0.x 为种子期：功能新增升 minor、修复升 patch；数据格式破坏性变更（见 §5）即便 0.x 也需用户确认。

## 3. 打包环境（本机现状）

- 机器无 Windows SDK，用 GNU 工具链：`stable-x86_64-pc-windows-gnu` + rust-lld（`src-tauri/.cargo/config.toml` 固定），启动命令见 §0。
- `src-tauri/WebView2Loader.dll` **勿删**：GNU 构建动态链接它，已用 `bundle.resources` 打进安装器；升级 `webview2-com-sys` 后必须同步替换该 dll 并重测安装包启动。
- 改过 `src-tauri/capabilities/*.json` 后需 `touch src-tauri/build.rs` 强制重嵌（dev watch 不监听 capabilities）。
- 发布前 `package-lock.json` 与 `src-tauri/Cargo.lock` 必须已提交（可复现构建的前提）。
- 安装器形态固定：**per-user NSIS、免管理员、未签名**；SmartScreen 警告由安装须知页（`src-tauri/INSTALL-NOTES.txt`）解释，**不得**要求用户关闭 SmartScreen。

## 4. 每次发布的门槛（顺序执行，全过才发）

1. `npx vitest run` 全绿（当前基线 60 个）。
2. `npm run build` 通过（含 tsc 类型检查）。
3. `npm run tauri dev` 冒烟：应用可启动、数据目录正常读取。
4. `npm run tauri build` 成功出包。
5. `npm run make-release`：脚本自检通过（版本三处一致；安装包不旧于源码；脏工作区警告）。**记住 SHA-256，发布渠道必须原文公布。**
6. 干净（或隔离）Windows 环境验证——没有做过这步的包不发给用户：
   - [ ] 全新安装 → 首启欢迎卡出现，数据目录创建；
   - [ ] 无 git 的机器：左下出现「快照保护未生效」持续警告（装 git 后重试可恢复）；
   - [ ] 双击两次启动：第二实例只聚焦第一个窗口（单实例）；
   - [ ] 写入数据后重启，内容仍在；
   - [ ] 覆盖安装（升级）后数据完好；
   - [ ] 卸载 → 数据目录**仍在** → 重装后数据回来；
   - [ ] 快照恢复演练：改错/删错任务后用 `git checkout` 找回。
7. git commit 并打 tag `vX.Y.Z`；tag message 记录版本与 SHA-256。
8. 发布渠道：安装包 + 公布的 SHA-256 + `release/README.md` 内容 + 种子手册。

## 5. 数据安全红线（任何版本不得回退，回退 = 事故）

0. **renderer 安全边界**：生产线 CSP 必须开启（`tauri.conf.json` `app.security.csp`，当前 `default-src 'self'` + 按需放开），**禁止改回 `null`**；`shell` capability（cmd/powershell/node/npm/claude/codex/git，`args: true`）是**高权限边界**——任何新的 HTML 渲染入口（markdown 预览、agent 输出、CLI 输出渲染）必须先 HTML 转义再生成白名单标签（参照 `src/lib/markdown.ts` 的 escape-first 原则），改动必须过安全审查。理由：任何 renderer 注入 + shell 白名单 = 本机代码执行。
1. **写入只走事务**：所有文件写入经 `src/storage/atomicWrite.ts`（tmp → bak 让位 → 就位），保证任何失败/中断后原文件或备份必有一个可恢复；不许绕过它直接调 fs 写。
2. **外部冲突守卫**：`updateTaskMeta` / `appendEntry` / `updateEntry` / `updateProjectDescription` / `saveWeekly` 保存前的外部修改检查（`ExternalConflictError` → 用户选择）不许移除或改成静默合并。
3. **单实例**：`tauri-plugin-single-instance` 不许移除。
4. **快照失败必须可见**：git 缺失/提交失败 → 界面持久警告，不许回到静默降级。
5. **脏草稿退出保护**：`onCloseRequested` / `beforeunload` 拦截不许移除。
6. **删除 = 软删除**：`deleteTask` / `deleteInboxItem` 只移入 `.trash/`（时间戳前缀，不覆盖、不清理），不做物理删除——事务写保护不了 delete，这是当天新文件尚未进 git 快照时唯一的丢失防线；恢复 = 从 `.trash/` 移回或 git 找回。
7. **数据格式向后兼容**：文件树结构、frontmatter 契约、`status` 五态枚举是存量用户资产——宽松读 / 保留未知字段的写回契约（PLAN.md 第三节）不许破坏；确需破坏性变更：先用户确认、写迁移与回滚说明、升 minor。
8. **卸载不删数据目录**：NSIS 卸载只删程序本体与应用界面设置；不得增加「删除数据」的卸载选项。
9. **UI 不触文件**：所有数据访问仍必须经 `src/dataAccess.ts` 边界。

## 5b. CI 门槛

`.github/workflows/ci.yml` 在每个 PR / push 上强制 `npm ci → npm test → npm run build`——**merge gate 是 CI 绿，不是"本地跑过"的口头证据**。Tauri/NSIS 构建依赖本机 GNU 工具链，仍走 §4 手工 release gate；将来环境标准化后可加入 CI。

## 6. 隐私红线（零遥测，任何版本不得突破）

- 应用**不联网、不上传、无账号、无遥测、无崩溃上报**。引入任何联网能力（更新检查、模板下载、agent 远程调用……）默认禁止，需用户明确批准并同步更新种子手册的隐私说明。
- 永远不收集、不请求用户打包：`spaces/`、`inbox/`、`weekly/`、`daily/`、`.activity/`、`.git/`、`settings.yaml`、`.mcp.json`。反馈只收脱敏模板（环境 + 复现步骤 + 错误文字 + 可选计数）。
- 已声明的唯一例外：用户主动在终端运行外部 CLI agent（claude/codex），内容按对应服务条款离开本机。

## 7. 范围边界（防蔓延，发布不夹带）

- 只发 **Windows x64 NSIS**。macOS、安装包签名、自动更新是后续里程碑，不 sneak 进普通发版。
- 安装器保持现有形态（中文界面 + 安装须知页 + 语言选择器）；不加自定义安装页面、不捆绑其他软件。
- 反目标照旧（AGENTS.md）：不做项目管理软件、不做笔记软件、不做 chat-first。

## 8. 发布记录

| 版本 | 日期 | 构建提交 | 安装包 SHA-256 | 备注 |
|---|---|---|---|---|
| 0.1.0-seed | 2026-09-11 | `d082ded` | `b83a6c94ba7cbc757b7384699bcb62f5275ea69c8c69dfda2810bad9a7f60a48` | 种子候选包（含 CSP/软删除）；**尚未做 §4-6 干净环境验证，未发布** |
| ~~0.1.0-seed~~ | 2026-09-11 | `87082ad` | `b3a893fbb46711d65383ce29f17db2762c56c405b3d40649671e89649031aa07` | 已废弃（CSP 关闭、硬删除），勿分发 |
