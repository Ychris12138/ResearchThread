# 发布流程与边界（Release Playbook）

> **每次打包发版前必读。** 本文件是发版的唯一规范；与代码冲突时以本文件为准修复代码。
> `release/`（仓库根）是**唯一**发布产物位置，由 `npm run make-release` 生成——**生成型文件（README.md / SHA256SUMS.txt / 种子手册副本）绝不手工编辑**；对侧平台的安装包可以作为汇总输入拷入 `release/`，但拷入后**必须重跑** `npm run make-release` 重新生成校验和（见 §1 汇总语义）。

## 0. 一句话流程

```bash
# —— Windows 构建机（本机 GNU 工具链）——
export PATH="/d/perl/c/x86_64-w64-mingw32/bin:/d/perl/c/bin:$HOME/.cargo/bin:$PATH"
export RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu
npx vitest run            # ① 测试全绿
npm run build             # ② tsc + vite 构建通过
npm run tauri build       # ③ NSIS 安装包（同上环境）
npm run make-release      # ④ 归拢 release/（含门槛自检）

# —— macOS 构建机（Apple Silicon 亦出 universal）——
npx vitest run
npm run build
npm run tauri build -- --target universal-apple-darwin --bundles app,dmg   # ③ DMG
npm run make-release      # ④ 同一脚本，darwin 下收 DMG
```

两台机器各自运行 `make-release` 生成自家产物；**汇总**：把对侧安装包拷进本机 `release/` 后重跑一次 `npm run make-release`——脚本按目录内实际存在的当前版本安装包全量重算 `SHA256SUMS.txt` 与 `README.md`，得到覆盖双平台的统一发布物。

## 1. 位置与产物（不变量）

- `release/` 在仓库根、**gitignore**，内容只能由 [scripts/make-release.mjs](../scripts/make-release.mjs) 生成；脚本是入库的，产物不入库。
- 产物固定集合，缺一不可：
  | 文件 | 内容 | 源头 |
  |---|---|---|
  | `ResearchThread_<v>_x64-setup.exe` | Windows NSIS 安装包 | Windows 机 `npm run tauri build` |
  | `ResearchThread_<v>_universal.dmg` | macOS 安装映像（Apple Silicon + Intel 切片；**Intel 硬件未单独实测**，发布页须按此口径说明） | macOS 机 `tauri build --target universal-apple-darwin` |
  | `SHA256SUMS.txt` | 安装包与手册的 SHA-256 | 脚本按 release/ 内实际安装包**全量重算**（跨平台统一，见下方汇总语义） |
  | `README.md` | 下载/校验/安装说明 + 构建提交记录 | 脚本模板 |
  | `种子测试手册.md` | 种子用户手册副本 | `docs/seed-manual.md`（只改源头，不改副本） |
- **汇总语义（消解双平台覆盖矛盾）**：脚本只清理「旧版本」安装包；**当前版本**的安装包跨平台累积——Windows 跑完把 dmg 拷进来重跑、或在 macOS 侧反向操作，`SHA256SUMS.txt` 都会自动覆盖双平台，无需手工拼校验和文件。**规则**：安装包（exe/dmg）可以作为汇总输入拷入 `release/`；除此之外的一切（README.md、SHA256SUMS.txt、手册副本）只能由脚本生成，手改 = 无效发布；任何拷入之后都必须重跑 `npm run make-release`，让校验和覆盖最终产物集合。
- macOS 侧**只认 universal DMG**（`target/universal-apple-darwin/...`），严格匹配 `productName + version` 文件名；native/ARM-only DMG 不是发布物，脚本直接失败、不 fallback。
- 历史（旧版本）不堆在 `release/`：发布后的安装包转存到发布渠道/网盘归档，靠 git tag 重新构建复现。
- 生成型 metadata（README / SHA256SUMS / 手册副本）手改 = 无效发布，下次生成会被覆盖；安装包拷入见「汇总语义」。
- Tauri 配置按平台拆分（构建时自动合并）：`tauri.conf.json`（公共：窗口/CSP/图标）+ `tauri.windows.conf.json`（NSIS/WebView2Loader/须知页）+ `tauri.macos.conf.json`（app+dmg/最低 macOS 12）。**不要把平台特有配置写回公共文件。**

## 2. 版本规则

- 版本号的**唯一事实源**是 `src-tauri/tauri.conf.json` 的 `version`；`package.json` 与 `src-tauri/Cargo.toml` 必须保持一致（**脚本强制检查，不一致直接失败**）。
- 发版必须先在 git 打 tag `vX.Y.Z`，tag 指向的提交 = 构建提交；从脏工作区构建会被脚本警告。
- 0.x 为种子期：功能新增升 minor、修复升 patch；数据格式破坏性变更（见 §5）即便 0.x 也需用户确认。

## 3. 打包环境

### Windows（本机现状）

- 机器无 Windows SDK，用 GNU 工具链：`stable-x86_64-pc-windows-gnu` + rust-lld（`src-tauri/.cargo/config.toml` 固定），启动命令见 §0。
- `src-tauri/WebView2Loader.dll` **勿删**：GNU 构建动态链接它，已用 `bundle.resources` 打进安装器；升级 `webview2-com-sys` 后必须同步替换该 dll 并重测安装包启动。
- 安装器形态固定：**per-user NSIS、免管理员、未签名**；SmartScreen 警告由安装须知页（`src-tauri/INSTALL-NOTES.txt`）解释，**不得**要求用户关闭 SmartScreen。

### macOS（v0.1.0 起）

- 前置只需 Xcode Command Line Tools（`xcode-select --install`）+ rustup + node；第一轮先 native ARM（`npm run tauri dev`），通过后再 universal。
- universal 二进制：`rustup target add aarch64-apple-darwin x86_64-apple-darwin` 后 `npm run tauri build -- --target universal-apple-darwin --bundles app,dmg`；产物在 `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`。**发布口径**：universal 含 Intel 切片（`lipo` 可验证），但实际硬件验证只在 Apple Silicon 上做过——release note 必须写「Tested on Apple Silicon; Intel hardware has not yet been separately validated」，不得声称 Intel 已全面验证。
- **PATH 修复是硬依赖**：Finder/Dock 启动的 GUI 不继承 shell PATH，`src-tauri/src/lib.rs` 里的 `fix_path_env::fix()` 不可移除；验收标准是 **Finder 双击启动**后 git/claude/codex 在内置终端可用（Terminal 启动可用不算过）。
- 文件管理器走 `plugin-opener`（`openPath`），不进 shell 白名单；shell capability 按平台拆分（`capabilities/shell-macos.json` 只含 git/claude/codex/node/npm）。
- 签名分两阶段：内测期不签名（未签名包被 Gatekeeper 拦截后，macOS 15+ 走「系统设置 → 隐私与安全性 → 仍要打开」放行；macOS 12–14 才有「右键 → 打开」——**「右键打开」通道在 macOS 15 Sequoia 起已被移除**，2026-09-12 M5/macOS 26.6 实测确认，手册已按系统版本分开写）；**面向陌生用户分发前必须 Developer ID 签名 + 公证**（Tauri 支持 signing identity 自动公证），届时更新手册与 `tauri.macos.conf.json` 的签名配置。
- `bundle.icon` 已含 `icons/icon.icns`；`minimumSystemVersion: 12.0`。

通用：改过 `src-tauri/capabilities/*.json` 后需 `touch src-tauri/build.rs` 强制重嵌（dev watch 不监听 capabilities）；发布前 `package-lock.json` 与 `src-tauri/Cargo.lock` 必须已提交。

## 4. 每次发布的门槛（顺序执行，全过才发）

1. `npx vitest run` 全绿（当前基线 60 个）。
2. `npm run build` 通过（含 tsc 类型检查）。
3. `npm run tauri dev` 冒烟：应用可启动、数据目录正常读取。
4. `npm run tauri build` 成功出包。
5. `npm run make-release`：脚本自检通过（版本三处一致；安装包不旧于源码；脏工作区警告）。**记住 SHA-256，发布渠道必须原文公布。**
6. 干净（或隔离）环境验证——没有做过这步的包不发给用户：

   **Windows：**
   - [ ] 全新安装 → 首启欢迎卡出现，数据目录创建；
   - [ ] 无 git 的机器：左下出现「快照保护未生效」持续警告（装 git 后重试可恢复）；
   - [ ] 双击两次启动：第二实例只聚焦第一个窗口（单实例）；
   - [ ] 写入数据后重启，内容仍在；
   - [ ] 覆盖安装（升级）后数据完好；
   - [ ] 卸载 → 数据目录**仍在** → 重装后数据回来；
   - [ ] 快照恢复演练：改错/删错任务后用 `git checkout` 找回。

   **macOS（v0.1.0 起，第一轮 native + 第二轮 universal 各过一遍核心项）：**
   - [ ] DMG → 应用程序安装，Finder 双击启动（**不**从 Terminal 启动）；
   - [ ] Finder/Dock 启动后，内置终端 `git --version` / `claude --version` / `codex --version` 可用（PATH 修复验收）；
   - [ ] 数据目录 `~/ResearchThread` 创建、读写、重启仍在；
   - [ ] 创建 Space/Project/Task、写 context、重启不丢；
   - [ ] 外部编辑（Obsidian/文本编辑器）→ 冲突提示出现；
   - [ ] Force Quit 后重启：中断写入被恢复（`.rt-bak` 机制）；
   - [ ] 连续双击两次启动：单实例聚焦；
   - [ ] `⌘⇧Space` 全局快捷键唤起收件箱；
   - [ ] 「打开数据目录」在 Finder 中打开（opener）；
   - [ ] 删除任务 → `.trash/` 可找回；
   - [ ] 无 git 的 Mac：快照警告出现；装 git 后重试恢复；
   - [ ] 旧 DMG → 新 DMG 覆盖升级数据完好；删 .app 卸载不删数据；
   - [ ] 未签名 DMG 下载后（真实浏览器下载带 quarantine）：macOS 15+ 弹「移到废纸篓/完成」→ 系统设置 → 隐私与安全性 →「仍要打开」可放行（macOS 12–14：右键 → 打开）。
7. git commit 并打 tag `vX.Y.Z`；tag message 记录版本与 SHA-256。
8. 发布渠道：安装包 + 公布的 SHA-256 + `release/README.md` 内容 + 种子手册。

## 5. 数据安全红线（任何版本不得回退，回退 = 事故）

0. **renderer 安全边界**：生产线 CSP 必须开启（`tauri.conf.json` `app.security.csp`，当前 `default-src 'self'` + 按需放开），**禁止改回 `null`**；`shell` capability（cmd/powershell/node/npm/claude/codex/git，`args: true`）是**高权限边界**——任何新的 HTML 渲染入口（markdown 预览、agent 输出、CLI 输出渲染）必须先 HTML 转义再生成白名单标签（参照 `src/lib/markdown.ts` 的 escape-first 原则），改动必须过安全审查。理由：任何 renderer 注入 + shell 白名单 = 本机代码执行。**2a/2b 接入 agent 时必须重新收紧这份 allowlist**（ Roadmap Issue #2）。
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

- 发布目标：**Windows x64 NSIS + macOS 12+ universal DMG（未签名内测期）**。Mac App Store、自动更新是后续里程碑，不 sneak 进普通发版。
- 安装器形态固定：Windows 中文 NSIS + 安装须知页；macOS 走标准 DMG 拖入 Applications。不加自定义安装页面、不捆绑其他软件。
- 面向陌生用户的 macOS 公开分发前，**必须** Developer ID 签名 + 公证（熟人内测可用「系统设置 → 隐私与安全性 → 仍要打开」过渡，macOS 15+ 无「右键 → 打开」通道，手册已写）。
- 反目标照旧（AGENTS.md）：不做项目管理软件、不做笔记软件、不做 chat-first。

## 8. 发布记录

| 版本 | 日期 | 构建提交 | 安装包 SHA-256 | 备注 |
|---|---|---|---|---|
| 0.1.0-seed | 2026-09-11 | `701c538` | `b83a6c94ba7cbc757b7384699bcb62f5275ea69c8c69dfda2810bad9a7f60a48` | 种子候选包（含 CSP/软删除）；**尚未做 §4-6 干净环境验证，未发布**。注：历史因作者邮箱重写过一次（旧 d082ded → 701c538，树内容相同） |
| ~~0.1.0-seed~~ | 2026-09-11 | ~~`87082ad`~~ | `b3a893fbb46711d65383ce29f17db2762c56c405b3d40649671e89649031aa07` | 已废弃（CSP 关闭、硬删除），勿分发 |
