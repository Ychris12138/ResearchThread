// scripts/make-release.mjs — 把发布产物归拢到 release/（可重复执行，平台感知，跨平台可汇总）。
// Windows（win32）：收 NSIS 安装包 ResearchThread_<v>_x64-setup.exe
// macOS（darwin）：只收 universal DMG（src-tauri/target/universal-apple-darwin/...），
//   严格匹配 productName+version，没有就失败——native/ARM-only DMG 不允许当发布物。
// 汇总语义：release/ 内「当前版本」的安装包跨平台累积（本脚本只清理旧版本产物），
//   SHA256SUMS.txt / README.md 每次按 release/ 内实际存在的安装包全量重算——
//   把对侧安装包拷进 release/ 后重跑本脚本，即得覆盖双平台的统一校验和。
// 用法：先 npm run tauri build，再 npm run make-release。
// 发版要求与红线见 docs/release.md；本脚本强制：版本三处一致，其余为警告。

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isMac = process.platform === "darwin";

const conf = JSON.parse(await readFile(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;
const productName = conf.productName;

const sha256 = async (path) => {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
};

const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: root }).toString().trim();
  } catch {
    return null;
  }
};

// —— 门槛自检（docs/release.md §2/§4-5） ——

// 1) 版本三处一致（tauri.conf.json 为唯一事实源）
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const cargoSrc = await readFile(join(root, "src-tauri/Cargo.toml"), "utf8");
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargoSrc)?.[1];
if (pkg.version !== version || cargoVersion !== version) {
  console.error(
    `版本不一致：tauri.conf.json=${version}，package.json=${pkg.version}，Cargo.toml=${cargoVersion ?? "?"}——统一后再发布`,
  );
  process.exit(1);
}

// 2) 定位本平台安装包（严格版本匹配；macOS 只认 universal）
const installerRe = new RegExp(`^${productName}_${version}_.+\\.(exe|dmg)$`);
async function findInstaller() {
  if (!isMac) {
    const name = `${productName}_${version}_x64-setup.exe`;
    return { src: join(root, "src-tauri/target/release/bundle/nsis", name), name };
  }
  // 只扫 universal 目录：native/ARM-only DMG 不是发布物，绝不 fallback
  const dmgDir = join(root, "src-tauri/target/universal-apple-darwin/release/bundle/dmg");
  const found = [];
  try {
    for (const f of await readdir(dmgDir)) {
      if (installerRe.test(f)) {
        const full = join(dmgDir, f);
        found.push({ src: full, name: f, mtime: (await stat(full)).mtimeMs });
      }
    }
  } catch {
    // 目录不存在（未做 universal 构建）
  }
  if (found.length === 0) return null;
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0];
}

const installer = await findInstaller();
if (!installer) {
  console.error(
    isMac
      ? `找不到 universal DMG（${productName}_${version}_*.dmg @ src-tauri/target/universal-apple-darwin/release/bundle/dmg/）——先运行 npm run tauri build -- --target universal-apple-darwin --bundles app,dmg。native/ARM-only DMG 不能作为发布物。`
      : `找不到安装包 ${productName}_${version}_x64-setup.exe——先运行 npm run tauri build`,
  );
  process.exit(1);
}

// 3) 构建提交与工作区状态
const gitHead = git("rev-parse", "--short", "HEAD") ?? "unknown";
const gitDirty = (git("status", "--porcelain") ?? "").length > 0;
if (gitDirty) console.warn("⚠ 工作区有未提交改动——发布应从干净的提交 / tag 构建（docs/release.md §2）");

// 4) 安装包是否比源码旧（过期构建警告）
const installerMtime = (await stat(installer.src)).mtimeMs;
const staleSources = [];
const scan = async (dir) => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await scan(full);
    else if ((await stat(full)).mtimeMs > installerMtime) staleSources.push(full);
  }
};
await scan(join(root, "src"));
await scan(join(root, "src-tauri/src"));
await scan(join(root, "src-tauri/capabilities"));
for (const f of [
  "src-tauri/tauri.conf.json",
  "src-tauri/tauri.windows.conf.json",
  "src-tauri/tauri.macos.conf.json",
  "src-tauri/INSTALL-NOTES.txt",
]) {
  try {
    if ((await stat(join(root, f))).mtimeMs > installerMtime) staleSources.push(f);
  } catch {
    // 平台配置文件可以不存在
  }
}
if (staleSources.length > 0) {
  console.warn(`⚠ 安装包早于 ${staleSources.length} 个较新的源文件（如 ${staleSources[0]}）——确认已重新 npm run tauri build`);
}

// —— 生成 release/ ——

const outDir = join(root, "release");
await mkdir(outDir, { recursive: true });

// 清理旧版本产物（当前版本的安装包跨平台累积，不删对侧文件）
const oldArtifactRe = new RegExp(`^${productName}_\\d+\\.\\d+\\.\\d+_.+\\.(exe|dmg)$`);
for (const f of await readdir(outDir)) {
  if (oldArtifactRe.test(f) && !installerRe.test(f)) {
    await rm(join(outDir, f), { force: true });
    console.log(`已清理旧版本产物：${f}`);
  }
}

const installerDest = join(outDir, installer.name);
await copyFile(installer.src, installerDest);

// 收集 release/ 内当前版本的全部安装包（含对侧拷入的），统一重算校验和
const bundled = (await readdir(outDir))
  .filter((f) => installerRe.test(f))
  .sort();
const manualName = "种子测试手册.md";
await copyFile(join(root, "docs/seed-manual.md"), join(outDir, manualName));

const hashes = {};
for (const f of [...bundled, manualName]) {
  hashes[f] = await sha256(join(outDir, f));
}
await writeFile(
  join(outDir, "SHA256SUMS.txt"),
  [...bundled, manualName].map((f) => `${hashes[f]}  ${f}`).join("\n") + "\n",
  "utf8",
);

const buildDate = new Date().toISOString().slice(0, 10);
const platformRows = bundled
  .map((f) =>
    f.endsWith(".exe")
      ? `| \`${f}\` | Windows x64 安装包（NSIS，per-user，免管理员；中文界面与安装须知页） |`
      : `| \`${f}\` | macOS 安装映像（DMG，universal：Apple Silicon + Intel 切片；Intel 硬件未单独实测） |`,
  )
  .join("\n");
const verifyLines = bundled
  .map((f) => `- \`${f}\`：\`${hashes[f]}\``)
  .join("\n");

await writeFile(
  join(outDir, "README.md"),
  `# ResearchThread ${version} 种子发布包

本目录为受控种子测试版发布物（scripts/make-release.mjs 生成，可重复执行）。
发版要求与红线见仓库 docs/release.md。

| 文件 | 说明 |
|---|---|
${platformRows}
| \`SHA256SUMS.txt\` | 校验值（发布渠道需原文公布，覆盖下方全部安装包） |
| \`${manualName}\` | 种子用户手册：数据/快照/并发/隐私与脱敏反馈模板 |

## 校验值（SHA-256）

${verifyLines}

## 安装步骤

**Windows：**
1. 核对校验值：PowerShell 执行 \`Get-FileHash .\\<安装包>\`，与 \`SHA256SUMS.txt\` 或发布页公布的值一致。
2. 双击安装包。未签名会过 SmartScreen：**「更多信息」→「仍要运行」**，不需要关闭 SmartScreen。
3. 首次启动应用会弹欢迎提示（数据位置 / 快照警告含义 / 反馈方式），照读一遍即可。

**macOS：**
1. 核对校验值：终端执行 \`shasum -a 256 ./<DMG>\`，与 \`SHA256SUMS.txt\` 或发布页公布的值一致。
2. 双击 DMG，把 ResearchThread 拖入「应用程序」。
3. 首次启动（未签名构建）：macOS 15+ 会弹「移到废纸篓 / 完成」——点「完成」关掉，再打开 **系统设置 → 隐私与安全性**，页面底部点「ResearchThread 已被阻止」旁的「**仍要打开**」确认；macOS 12–14：右键 ResearchThread → 打开 → 打开。不要关闭 Gatekeeper。
4. 应用为 universal 二进制（Apple Silicon + Intel 切片），实际硬件验证在 Apple Silicon 上完成，Intel 未单独实测——发布页按此口径说明。

## 快速核对

- 数据目录 \`~/ResearchThread\` 由应用首次启动创建，卸载**不会**删除（Windows 卸载只删程序本体；macOS 删 .app 同理）。
- 每天首次启动自动 git 快照；无 git 机器会显示「快照保护未生效」持续警告（数据仍正常保存）。

## 构建信息

- 版本：${version}（tauri.conf.json = package.json = Cargo.toml）
- 本次生成平台：${isMac ? "macOS" : "Windows"}（另一平台安装包由对侧构建后拷入本目录重跑本脚本汇总）
- 构建提交：\`${gitHead}\`${gitDirty ? "（⚠ 工作区不干净）" : ""}
- 构建日期：${buildDate}
- 本次归拢：${installer.name}
`,
  "utf8",
);

console.log(`release/ 已生成（构建提交 ${gitHead}${gitDirty ? "，工作区不干净" : ""}）：`);
console.log(`  本次归拢 ${installer.name}  (SHA-256 ${hashes[installer.name]})`);
console.log(`  覆盖安装包：${bundled.join(", ") || "(无)"}`);
console.log(`  SHA256SUMS.txt / README.md / ${manualName}`);
