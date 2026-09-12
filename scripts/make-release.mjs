// scripts/make-release.mjs — 把发布产物归拢到 release/（可重复执行，平台感知）。
// Windows（win32）：收 NSIS 安装包（ResearchThread_<v>_x64-setup.exe）
// macOS（darwin）：收 DMG（native 或 universal-apple-darwin 构建产物，取最新）
// 共同输出：release/<安装包>、SHA256SUMS.txt、README.md、种子测试手册.md
// 用法：先 npm run tauri build，再 npm run make-release。
// 发版要求与红线见 docs/release.md；本脚本强制：版本三处一致，其余为警告。

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isMac = process.platform === "darwin";

const conf = JSON.parse(await readFile(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;

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

// 2) 定位本平台的安装包
async function findInstaller() {
  if (!isMac) {
    const name = `ResearchThread_${version}_x64-setup.exe`;
    return { src: join(root, "src-tauri/target/release/bundle/nsis", name), name };
  }
  // native 构建在 target/release/，universal 在 target/universal-apple-darwin/release/
  const bundleRoots = [
    join(root, "src-tauri/target/universal-apple-darwin/release/bundle/dmg"),
    join(root, "src-tauri/target/release/bundle/dmg"),
  ];
  const found = [];
  for (const dir of bundleRoots) {
    try {
      for (const f of await readdir(dir)) {
        if (f.endsWith(".dmg")) {
          const full = join(dir, f);
          found.push({ src: full, name: f, mtime: (await stat(full)).mtimeMs });
        }
      }
    } catch {
      // 目录不存在（未做该形态构建）
    }
  }
  if (found.length === 0) return null;
  found.sort((a, b) => b.mtime - a.mtime); // 取最新（universal 优先构建时通常也更新）
  return found[0];
}

const installer = await findInstaller();
if (!installer) {
  console.error(
    isMac
      ? "找不到 DMG 产物——先运行 npm run tauri build -- --bundles app,dmg"
      : `找不到安装包 ResearchThread_${version}_x64-setup.exe——先运行 npm run tauri build`,
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

// —— 生成 release/（整体覆盖，只保留最新版本） ——

const outDir = join(root, "release");
await mkdir(outDir, { recursive: true });

const installerDest = join(outDir, installer.name);
await copyFile(installer.src, installerDest);

const installerHash = await sha256(installerDest);
await copyFile(join(root, "docs/seed-manual.md"), join(outDir, "种子测试手册.md"));

const manualHash = await sha256(join(outDir, "种子测试手册.md"));

await writeFile(
  join(outDir, "SHA256SUMS.txt"),
  `${installerHash}  ${installer.name}\n${manualHash}  种子测试手册.md\n`,
  "utf8",
);

const buildDate = new Date().toISOString().slice(0, 10);
const platformLabel = isMac ? "macOS（universal：Apple Silicon + Intel）" : "Windows x64";
const verifyCmd = isMac
  ? `shasum -a 256 ./${installer.name}`
  : `Get-FileHash .\\${installer.name}`;
const installSteps = isMac
  ? `1. 核对校验值：终端执行 \`${verifyCmd}\`，与 \`SHA256SUMS.txt\` 或发布页公布的值一致。
2. 双击 DMG，把 ResearchThread 拖入「应用程序」。
3. 首次启动（未签名构建）：在「应用程序」里**右键 → 打开 → 打开**，之后正常启动。
   应用未来做 Developer ID 签名 + 公证后此步可免（docs/release.md §7）。`
  : `1. 核对校验值：PowerShell 执行 \`${verifyCmd}\`，与 \`SHA256SUMS.txt\` 或发布页公布的值一致。
2. 双击安装包。未签名会过 SmartScreen：**「更多信息」→「仍要运行」**，不需要关闭 SmartScreen。
3. 首次启动应用会弹欢迎提示（数据位置 / 快照警告含义 / 反馈方式），照读一遍即可。`;
const uninstallNote = isMac
  ? `卸载 = 把「应用程序」里的 ResearchThread 删除；\`~/ResearchThread\` 数据目录**不会**被删除。`
  : `卸载不会删除数据目录；程序装在 \`%LOCALAPPDATA%\\ResearchThread\`（约 10 MB）。`;

await writeFile(
  join(outDir, "README.md"),
  `# ResearchThread ${version} 种子发布包（${platformLabel}）

本目录为受控种子测试版发布物（scripts/make-release.mjs 生成，可重复执行）。
发版要求与红线见仓库 docs/release.md。

| 文件 | 说明 |
|---|---|
| \`${installer.name}\` | 安装包${isMac ? "（DMG，universal 二进制）" : "（NSIS，per-user，免管理员；中文界面与安装须知页）"} |
| \`SHA256SUMS.txt\` | 校验值（发布渠道需原文公布） |
| \`种子测试手册.md\` | 种子用户手册：数据/快照/并发/隐私与脱敏反馈模板 |

## 安装步骤

${installSteps}

## 快速核对

- 数据目录 \`~/ResearchThread\` 由应用首次启动创建，卸载**不会**删除。${uninstallNote}
- 每天首次启动自动 git 快照；无 git 机器会显示「快照保护未生效」持续警告（数据仍正常保存）。

## 构建信息

- 版本：${version}（tauri.conf.json = package.json = Cargo.toml）
- 平台：${platformLabel}
- 构建提交：\`${gitHead}\`${gitDirty ? "（⚠ 工作区不干净）" : ""}
- 构建日期：${buildDate}
- ${installer.name}
- SHA-256：\`${installerHash}\`
`,
  "utf8",
);

console.log(`release/ 已生成（构建提交 ${gitHead}${gitDirty ? "，工作区不干净" : ""}）：`);
console.log(`  ${installer.name}  (SHA-256 ${installerHash})`);
console.log(`  SHA256SUMS.txt / README.md / 种子测试手册.md`);
