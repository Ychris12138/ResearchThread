// scripts/make-release.mjs — 把发布产物归拢到 release/（可重复执行）。
// 输入：src-tauri/target/release/bundle/nsis/ 下的安装包 + docs/seed-manual.md
// 输出：release/ResearchThread_<v>_x64-setup.exe、SHA256SUMS.txt、README.md、种子测试手册.md
// 用法：先 npm run tauri build，再 npm run make-release。

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const conf = JSON.parse(await readFile(join(root, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;
const installerName = `ResearchThread_${version}_x64-setup.exe`;
const installerSrc = join(root, "src-tauri/target/release/bundle/nsis", installerName);

const sha256 = async (path) => {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
};

try {
  await readFile(installerSrc);
} catch {
  console.error(`找不到安装包 ${installerSrc}——先运行 npm run tauri build`);
  process.exit(1);
}

const outDir = join(root, "release");
await mkdir(outDir, { recursive: true });

const installerDest = join(outDir, installerName);
await copyFile(installerSrc, installerDest);

const installerHash = await sha256(installerDest);
await copyFile(join(root, "docs/seed-manual.md"), join(outDir, "种子测试手册.md"));

const manualHash = await sha256(join(outDir, "种子测试手册.md"));

await writeFile(
  join(outDir, "SHA256SUMS.txt"),
  `${installerHash}  ${installerName}\n${manualHash}  种子测试手册.md\n`,
  "utf8",
);

await writeFile(
  join(outDir, "README.md"),
  `# ResearchThread ${version} 种子发布包（Windows x64）

本目录为受控种子测试版发布物，随 release 提交一起产出（scripts/make-release.mjs 生成，可重复执行）。

| 文件 | 说明 |
|---|---|
| \`${installerName}\` | NSIS 安装包（per-user，免管理员；安装器有中文界面与安装须知页） |
| \`SHA256SUMS.txt\` | 校验值（发布渠道需原文公布） |
| \`种子测试手册.md\` | 种子用户手册：数据/快照/并发/隐私与脱敏反馈模板 |

## 安装步骤

1. 核对校验值：PowerShell 执行 \`Get-FileHash .\\${installerName}\`，与 \`SHA256SUMS.txt\` 或发布页公布的值一致。
2. 双击安装包。未签名会过 SmartScreen：**「更多信息」→「仍要运行」**，不需要关闭 SmartScreen。
3. 首次启动应用会弹出欢迎提示（数据位置 / 快照警告含义 / 反馈方式），照读一遍即可。

## 快速核对

- 程序装在 \`%LOCALAPPDATA%\\ResearchThread\`（约 10 MB）。
- 数据目录 \`~/ResearchThread\` 由应用首次启动创建，卸载**不会**删除。
- 每天首次启动自动 git 快照；无 git 机器会显示「快照保护未生效」持续警告（数据仍正常保存）。

${installerName}
SHA-256: ${installerHash}
`,
  "utf8",
);

console.log(`release/ 已生成：`);
console.log(`  ${installerName}  (SHA-256 ${installerHash})`);
console.log(`  SHA256SUMS.txt / README.md / 种子测试手册.md`);
