import type { Space } from "./dataAccess";

/** Seed dataset for M1. Cloned by the mock DataAccess on first use. */
export const SEED_SPACES: Space[] = [
  {
    id: "research",
    name: "科研",
    projects: [
      {
        id: "paper-dft",
        name: "DFT 论文投稿",
        description: `# DFT 论文投稿

目标期刊：PRB / PR Materials  
当前版本：v0.9（审稿中，major revision）

## 核心卖点
- NiO/STO 界面极化对氧空位形成能的调制
- 与实验 XPS 结合能位移的定量对照

## 还没写进去的
- 审稿人要求的 hybrid 对照（HSE06 太贵，先用 DFT+U 回答）
- Figure 3 caption 需要强调**因果**而不是相关

## 约定
计算全部落在 \`cluster-b\` 的 \`/work/niosto/rev1/\`。`,
        tasks: [
          {
            id: "2026-08-12-reply-reviewers.md",
            title: "回复审稿人意见",
            status: "doing",
            star: true,
            next: "重写 Figure 3 的 caption，强调极化与 Vo 的因果关系",
            created: "2026-08-12",
            updated: "2026-09-08",
            entries: [
              {
                date: "2026-08-12",
                author: "me",
                text: "收到 major revision。审稿人 #1 认为 Figure 3 的极化矢量与氧空位形成能之间只是相关、不是因果，要求补充约束计算。审稿人 #2 质疑 DFT+U 的 U 值选取，点名我们没有说明 Dudarev 形式。",
              },
              {
                date: "2026-08-27",
                author: "me",
                text: "计划用固定极化（constrain）vs 全弛豫对照来回答 #1。U 值准备查 NiO 文献，避免拍脑袋。Cover letter 先不动，等计算数字出来再改。",
              },
              {
                date: "2026-09-05",
                author: "agent",
                text: "检索近三年 Ni 3d DFT+U 取值：PRB 2019 推荐 U_eff = 6.2 eV，与审稿人 #2 引用一致；Materials Cloud 上 NiO 基准亦落在 5.5–6.5 eV。建议采用 6.2 eV，并在文中补一句对 Dudarev 形式的说明。约束极化可参考 VASP 的 I_CONSTRAINED_M，或用固定离子位置的单点能差近似。",
              },
              {
                date: "2026-09-08",
                author: "me",
                text: "采纳 6.2 eV。Figure 3 caption 草稿写完一半，还差约束计算的一句定量描述（初步 ΔE ≈ 0.18 eV，待确认收敛）。",
              },
            ],
          },
          {
            id: "2026-08-20-band-structure.md",
            title: "重跑能带结构图",
            status: "todo",
            star: true,
            next: "用 VASPKIT 导出高对称路径并重绘",
            created: "2026-08-20",
            updated: "2026-09-04",
            entries: [
              {
                date: "2026-08-20",
                author: "me",
                text: "旧图是 PBE 的，U 改完必须重跑。高对称路径沿 Γ–X–M–Γ–Z，和正文 Figure 2 保持一致。",
              },
              {
                date: "2026-09-04",
                author: "me",
                text: "INCAR 已改 U，排队等 48 核。记得导出 PROCAR 以便画轨道投影。",
              },
            ],
          },
          {
            id: "2026-08-22-supp-calc.md",
            title: "补充 supplementary 计算",
            status: "todo",
            star: false,
            next: "先跑 2×2 超胞确认形成能收敛",
            created: "2026-08-22",
            updated: "2026-08-29",
            entries: [
              {
                date: "2026-08-22",
                author: "me",
                text: "审稿人 #1 还要求超胞收敛。目前正文用 2×2，准备在 SI 里放 3×3 的形成能差。",
              },
              {
                date: "2026-08-29",
                author: "me",
                text: "3×3 单点已经在跑，预计明天出数。如果 ΔE < 20 meV 就只在 SI 提一句。",
              },
            ],
          },
          {
            id: "2026-07-28-cover-letter.md",
            title: "投稿封面信",
            status: "done",
            star: false,
            next: "",
            created: "2026-07-28",
            updated: "2026-08-02",
            entries: [
              {
                date: "2026-07-28",
                author: "me",
                text: "封面信强调两件事：界面极化是可实验观测的（XPS），以及形成能调制幅度达到 0.4 eV。",
              },
              {
                date: "2026-08-02",
                author: "me",
                text: "导师改了一轮措辞，已随 v0.9 提交。修订阶段再动。",
              },
            ],
          },
          {
            id: "2026-07-22-pbe-legacy.md",
            title: "旧版 PBE 对照",
            status: "dropped",
            star: false,
            next: "",
            created: "2026-07-22",
            updated: "2026-08-15",
            entries: [
              {
                date: "2026-07-22",
                author: "me",
                text: "原本想把纯 PBE 结果作为对照放进 SI，证明 +U 不只是平移。",
              },
              {
                date: "2026-08-15",
                author: "me",
                text: "导师认为会干扰审稿焦点，划掉。数据留在 archive，不再写进修订稿。",
              },
            ],
          },
        ],
      },
      {
        id: "ssb-exp",
        name: "固态电池实验",
        description: `# 固态电池实验

体系：Li6PS5Cl / NMC811，2032 扣式  
目标：把室温离子电导推到 3 mS/cm 以上，并看清晶界阻抗。

## 本周现场
手套箱水氧都在 0.1 ppm 以下。冷压压力统一 380 MPa。`,
        tasks: [
          {
            id: "2026-09-01-assemble-cell.md",
            title: "组装 2032 扣式电池",
            status: "doing",
            star: false,
            next: "今晚再压 3 枚，明早测 EIS",
            created: "2026-09-01",
            updated: "2026-09-09",
            entries: [
              {
                date: "2026-09-01",
                author: "me",
                text: "电解质片厚约 700 μm，NMC 面载 8 mg/cm²。上一批开路电压不稳，怀疑界面接触。",
              },
              {
                date: "2026-09-09",
                author: "me",
                text: "改用 12 mm 锂箔 + 轻微预压，开路稳在 3.4 V。今晚补 3 枚重复样。",
              },
            ],
          },
          {
            id: "2026-08-18-eis-fit.md",
            title: "EIS 阻抗拟合",
            status: "hold",
            star: false,
            next: "等新批次电池出数再拟合",
            created: "2026-08-18",
            updated: "2026-09-03",
            entries: [
              {
                date: "2026-08-18",
                author: "me",
                text: "用 (RQ)(RQ)W 等效电路。高频半圆指认晶界，但 χ² 偏高，可能要加一个 CPE。",
              },
              {
                date: "2026-09-03",
                author: "me",
                text: "旧数据接触不好，拟合没有意义。搁置，等新电池。",
              },
            ],
          },
          {
            id: "2026-09-04-sem-booking.md",
            title: "SEM 截面表征预约",
            status: "todo",
            star: false,
            next: "周四前把样品送到电镜中心",
            created: "2026-09-04",
            updated: "2026-09-06",
            entries: [
              {
                date: "2026-09-04",
                author: "me",
                text: "要看冷压后晶界是否致密。截面用液氮脆断，避免刀痕。",
              },
              {
                date: "2026-09-06",
                author: "me",
                text: "预约了下周一上午。样品需提前转到样品瓶，贴「对水敏感」。",
              },
            ],
          },
        ],
      },
      {
        id: "reading",
        name: "文献阅读",
        description: `# 文献阅读

本季度焦点：固态电解质晶界、以及界面极化相关的 DFT 工作。

读完的放进 Zotero「2026-Q3 / 已消化」。`,
        tasks: [
          {
            id: "2026-08-03-nature-energy-review.md",
            title: "精读 Nature Energy 固态综述",
            status: "doing",
            star: true,
            next: "把晶界阻抗那一节的关键图表摘进笔记",
            created: "2026-08-03",
            updated: "2026-09-07",
            entries: [
              {
                date: "2026-08-03",
                author: "me",
                text: "Janek 组 2024 综述。结构清楚，但实验部分偏硫化物，氧化物只一笔带过。",
              },
              {
                date: "2026-08-19",
                author: "me",
                text: "Figure 4 的 Arrhenius 汇总很有用，准备画进组会 PPT。注意他们把冷压和热压混在一张图里。",
              },
              {
                date: "2026-09-07",
                author: "me",
                text: "晶界那节引用了我们可能漏掉的 ACS Energy Lett. 2023。明天找全文。",
              },
            ],
          },
          {
            id: "2026-08-27-zotero.md",
            title: "整理引用库",
            status: "todo",
            star: false,
            next: "把重复的 NiO DFT 条目合并",
            created: "2026-08-27",
            updated: "2026-08-27",
            entries: [
              {
                date: "2026-08-27",
                author: "me",
                text: "Zotero 里同一篇 PRB 存了三次，DOI 大小写不一致。先从投稿相关的 40 篇清起。",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "engineering",
    name: "开发",
    projects: [
      {
        id: "lab-pipeline",
        name: "计算流程",
        description: `# 计算流程

把散落的 VASP 脚本收成可复用的流水线：INCAR 模板、失败作业诊断、能带后处理。

仓库：\`lab-pipeline\`（私有）。`,
        tasks: [
          {
            id: "2026-07-30-incar-templates.md",
            title: "VASP INCAR 模板整理",
            status: "done",
            star: false,
            next: "",
            created: "2026-07-30",
            updated: "2026-08-11",
            entries: [
              {
                date: "2026-07-30",
                author: "me",
                text: "先收弛豫 / 静态 / 能带 / 频率四套。ENCUT、KSPACING、EDIFF 写成可覆盖的默认值。",
              },
              {
                date: "2026-08-11",
                author: "me",
                text: "四套模板进仓库，README 里写了适用场景。后续只改默认 U 值。",
              },
            ],
          },
          {
            id: "2026-09-02-job-diagnose.md",
            title: "失败作业诊断脚本",
            status: "doing",
            star: false,
            next: "解析 ZBRENT 和 EDWAV 两类崩溃",
            created: "2026-09-02",
            updated: "2026-09-09",
            entries: [
              {
                date: "2026-09-02",
                author: "me",
                text: "集群上一周 30% 的作业死在电子步。想扫 slurm 日志自动分类。",
              },
              {
                date: "2026-09-09",
                author: "me",
                text: "已经能抓到 OSZICAR 最后 20 行。下一步识别 ZBRENT（离子步）和 EDWAV（电荷密度）。",
              },
            ],
          },
        ],
      },
      {
        id: "researchthread",
        name: "ResearchThread",
        description: `# ResearchThread

把手写「空间 → 项目 → 任务 + 上下文日志」搬到本地优先的桌面应用。

M1 只做界面与 mock 数据层；M2 接 Markdown 文件树和 AgentRunner。`,
        tasks: [
          {
            id: "2026-09-06-context-schema.md",
            title: "上下文日志 schema",
            status: "todo",
            star: false,
            next: "定下来 front matter 字段，避免 M2 再改名",
            created: "2026-09-06",
            updated: "2026-09-06",
            entries: [
              {
                date: "2026-09-06",
                author: "me",
                text: "任务文件 = YAML front matter + 按日期追加的日志。字段：status / star / next / created / updated。条目用 \`## YYYY-MM-DD\` 标题分隔。",
              },
              {
                date: "2026-09-06",
                author: "me",
                text: "author 先只区分 me / agent。agent 条目只读，避免模型改写已经确认过的现场记录。",
              },
            ],
          },
          {
            id: "2026-09-08-agent-runner.md",
            title: "AgentRunner 占位设计",
            status: "hold",
            star: false,
            next: "等 M1 界面冻结再画协议",
            created: "2026-09-08",
            updated: "2026-09-08",
            entries: [
              {
                date: "2026-09-08",
                author: "me",
                text: "底部面板以后是 Agent 终端。M1 只留容器，不模拟 REPL，免得以后推翻。",
              },
            ],
          },
        ],
      },
    ],
  },
];
