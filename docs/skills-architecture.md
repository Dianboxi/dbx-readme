# Agent 技能架构与触发边界

本文把 [Agent Skills 规范](https://agentskills.io/specification) 中与本项目相关的约束，翻译成三个技能的具体设计与硬规则：`dbx-readme`（已发布）、`dbx-topics`（设计草案，CLI 未实现）、`dbx-presentation`（编排草案）。**草案不等于已实现功能**：`skills/` 目录下目前只有 `dbx-readme`，另外两个的正文只在本文第 5 节以代码块给出，避免发布一个会调用不存在命令的技能。

## 1. 为什么需要一份分工文档

三个技能的字面请求高度重叠——「让我的仓库看起来更好」既可能是加横幅、也可能是改 description/topics。规范只给了一个触发面：每个技能的 `description`（启动时每个约 100 tokens 进上下文，正文只在命中后才加载）。因此：

- 触发只能靠 description 的措辞，客户端没有关键词匹配器可配置；
- description 写宽了会互相抢任务，写窄了该用时不触发；
- 一旦两个技能都声称负责「README 展示」，模型就会随机挑一个，结果不可复现。

结论：**先定边界，再写正文**；编排技能只做路由与顺序，不重复子技能的流程细节。

## 2. 规范约束 → 本项目的硬规则

| 规范要求 | 本项目规则 |
| --- | --- |
| `name` ≤64 字符、仅小写字母/数字/连字符、无首尾或连续连字符、**必须等于父目录名** | 目录一律 `skills/<name>/`，`name` 与目录逐字符相同；新增技能前先定名字 |
| `description` 1–1024 字符，说清「做什么 + 什么时候用」，含具体关键词 | 双语，中文负责同义触发词，英文负责跨语言关键词；**必须写负向边界**（"Not for … use X instead"） |
| `license` / `compatibility` / `metadata` 可选 | 每个技能都写：`license: MIT`；`compatibility` 写运行时与网络/凭据要求；`metadata` 含 author / version / repository |
| `allowed-tools` 实验性 | 不声明：各客户端语义不一，声明错误会比不声明更危险 |
| 正文 <500 行、<5000 tokens | 每个 SKILL.md 控制在 150 行内；细节下沉到 `references/`（一层深，相对路径） |
| `scripts/` 可选 | 不放脚本：能力由 npm 包里的 CLI 提供，技能只负责调用与授权判断 |
| `assets/` 可选 | 当前不需要；示例图放在仓库 `docs/assets/` 而非技能目录，避免进 npm 包 |

## 3. 职责与触发边界

| 技能 | 一句话职责 | 典型触发 | 明确不接手 |
| --- | --- | --- | --- |
| `dbx-readme` | 生成 / 校验 README 横幅的双主题 SVG | 「给仓库加个横幅 / 头图」「重新生成 banner」「检查横幅有没有过期」 | GitHub 元数据、README 正文写作、发布 |
| `dbx-topics` | 盘点并改写仓库 description 与 topics | 「description 太随意」「补一下 topics / 标签」「让仓库能被搜到」 | 横幅图片、README 内容、release、组织 profile README |
| `dbx-presentation` | 多表面一致性编排 | 「整体收拾一下仓库门面」「README、description、topics 一起对齐」 | 单表面请求（应直接走对应技能）、任何自动远程发布 |

路由规则（写进每个技能的正文，不只写在这里）：

1. **单表面 → 直接子技能**，不启动编排。编排技能的存在不是为了让简单任务绕远路。
2. **多表面 → 编排技能**：它先做只读盘点，产出 plan，再按「本地资源 → README → 远程元数据」的顺序执行。
3. **编排不复制流程**：正文只写「调用 dbx-readme 的 SKILL.md 完成横幅」，不重述 init/generate/check 参数，避免两处规则漂移。
4. **同名冲突时以更窄的技能为准**：请求里出现「横幅 / banner / SVG / 头图」走 `dbx-readme`；出现「description / topics / 标签 / 搜索」走 `dbx-topics`；两者都出现才升级为编排。
5. **同一会话重复请求复用已有 plan**，不重复盘点、不重复写远程。

## 4. 目录与渐进披露预算

```
skills/dbx-readme/          # 已发布
├── SKILL.md                # 120 行 / 约 2.8k tokens
└── references/
    └── configuration.md    # 配置字段、ASCII 选项、路径契约

skills/dbx-topics/          # 草案
├── SKILL.md                # 目标 ≤110 行
└── references/
    ├── metadata-rules.md   # GitHub 侧格式限制与端点差异
    └── proposal-pattern.md # 如何给出可审阅的差异建议

skills/dbx-presentation/    # 草案
├── SKILL.md                # 目标 ≤130 行，只写编排与授权
└── references/
    └── routing.md          # 表面 × 技能矩阵、失败与部分成功的处理
```

预算纪律：新增技能先估正文 token（CJK 约 1 字 ≈ 1 token），超过 4000 就先拆分，不要等到客户端截断。

## 5. frontmatter 草案

### 5.1 `dbx-topics`

```yaml
---
name: dbx-topics
description: >-
  只读盘点并改写 GitHub 仓库的公开元数据：description 与 topics（标签）。先给差异建议，
  写入仅在用户明确授权后执行，并复述最终值。
  Use when a user asks to fix or improve a repository's GitHub description, topics or tags,
  or how the repo shows up in GitHub search and topic pages.
  Not for README files or banners (use dbx-readme), and not when several surfaces change together (use dbx-presentation).
license: MIT
compatibility: 需要已验证的 GitHub 凭据（gh CLI 或 REST token）与网络；只读盘点不写入远程。
metadata:
  author: Dianboxi 电波系
  version: "0.1.0"
  repository: https://github.com/Dianboxi/dbx-readme
---
```

### 5.2 `dbx-presentation`

```yaml
---
name: dbx-presentation
description: >-
  编排一次仓库展示面的整体改进：README（含横幅）、GitHub description 与 topics 的一致盘点与分步落地。
  先只读盘点并给出 plan，用户确认后逐项执行；远程写入与发布永不自动。
  Use when a user wants a repository to look better end-to-end, or asks to align README,
  description and topics in a single task.
  For a single surface, call dbx-readme (banner) or dbx-topics (metadata) directly instead.
license: MIT
compatibility: 需要 Node.js 22+；只读阶段无需凭据，写入远程元数据需要 gh CLI 或 token。
metadata:
  author: Dianboxi 电波系
  version: "0.1.0"
  repository: https://github.com/Dianboxi/dbx-readme
---
```

## 6. `dbx-topics` 的 CLI 契约（未实现，接口草案）

技能正文不臆造命令。契约先行，实现跟上；在实现之前以第 6.3 节的能力闸门处理。

### 6.1 目标命令

```
dbx topics get   --cwd <repo> [--json]                 # 只读：远程当前值 + 本地配置
dbx topics plan  --cwd <repo> [--json]                 # 只读：输出 diff，不写入
dbx topics apply --cwd <repo> [--dry-run] [--json]     # 写入；--dry-run 与 plan 等价
```

约定与现有 CLI 一致：显式 `--cwd`；`--json` 输出机器可读结果；`--check` 语义为「有差异则非零退出且不写入」（`topics apply --check`）。

### 6.2 配置载体

仓库元数据不进 `banner.config.json`（那是渲染配置）。新增 `presentation.config.json`：

```json
{
  "schemaVersion": 1,
  "description": "一句话说明这个仓库做什么。",
  "topics": ["cli", "readme", "svg"]
}
```

`description` / `topics` 均可选；缺失即表示「不主张该字段」，`plan` 不得据此删除远程已有值——删除必须显式写 `null` 或空数组。

### 6.3 能力闸门（实现前的唯一正确行为）

1. 先跑 `dbx topics --help`（或 `dbx --help` 查子命令表）。
2. 不存在该子命令 → **不伪造命令、不猜参数**；如实告知「当前版本没有 topics 能力」，并给出两条可选路径：等实现，或（仅在用户授权且本机已 `gh auth status` 通过时）用只读的 `gh repo view --json description,repositoryTopics` 盘点、写入交给用户手动在网页完成。
3. 不允许把「未经授权的 `gh repo edit` 写入」当成默认兜底——远程写入必须逐次显式授权。

### 6.4 GitHub 侧硬约束

- topics：仅小写字母、数字、连字符；每个 ≤50 字符；每个仓库 ≤20 个。
- topics 名称永远公开，即使仓库是私有。
- `gh repo edit --add-topic` / `--remove-topic` 是**增量**操作；全量替换走 REST `PUT /repos/{owner}/{repo}/topics`（`{"names": [...]}`，替换整个集合，空数组即清空）。两条路径语义不同，技能必须显式说明这次是增量还是替换。
- 写入需要对该仓库有管理写权限；凭据不足时报告实际错误，不降级为「看起来成功」。

## 7. 编排技能的执行流

1. **discover（只读）**：目标仓库绝对路径 → 现有 README 与受管块、`banner.config.json`、`presentation.config.json`、远程 description/topics、未提交变更。
2. **plan**：三个表面各自「现状 → 建议」，标注哪些是本地文件改动、哪些是远程写入、哪些需要用户提供文案。plan 必须可审阅、可部分执行。
3. **confirm**：一次拿到授权范围；远程写入与 README 编辑分别确认，不因「整体改进」一句话就默认全选。
4. **apply**：顺序固定为本地资源 → README 受管块 → 远程元数据。前一步失败不继续下一步，避免半成品公开。
5. **verify**：横幅 `--check`、README 受管块完整、远程值回读一致。
6. **report**：改了哪些表面、未做哪些、哪些等待用户输入；不把未执行项说成完成。

失败与幂等：每步独立可重试；`--check`/`plan` 永远无副作用；部分成功后重试只补未完成项，不重跑整链。

## 8. 授权矩阵

| 动作 | 是否需要显式授权 | 默认行为 |
| --- | --- | --- |
| 生成本地 SVG / 读配置 | 否（在用户指定的仓库内） | 执行 |
| 编辑 README 受管块 | 是 | 不传 `--readme` |
| 修改 GitHub description / topics | 是，且单独确认 | 只输出建议 |
| commit / push / tag / release / npm publish | 是，且为独立请求 | 全部不做 |
| 安装依赖或联网 bootstrap | 是 | 用已有 checkout |

## 9. 验证清单（新增或修改技能时逐条跑）

1. `npx --yes skills-ref@0.1.5 validate ./skills/<name>` → `Valid skill`。
2. 目录名 = `name` 字段；无大写、无连续/首尾连字符。
3. 正文行数 <500、估算 tokens <5000；超出则拆到 `references/`（一层深）。
4. `description` ≤1024 字符，含「做什么」「什么时候用」与负向边界。
5. `references/` 只用相对路径且文件真实存在（`npm test` 中的公开文档链接检查会覆盖本地链接）。
6. `npm run check` + `npm test` 通过；改动技能文件后重新 `npm pack` 核对清单。
7. 触发评测靠真实会话观察（规范另有 evaluating-skills 方法论），单元测试无法证明触发准确率。

## 10. 落地顺序

1. `dbx-readme` 技能元数据补齐（已随本次改动落地）。
2. 实现 `dbx topics` 子命令与 `presentation.config.json` 校验，先有 `--check`，再有写入。
3. 落盘 `skills/dbx-topics/`（正文按第 5.1 节，能力闸门按第 6.3 节）。
4. 落盘 `skills/dbx-presentation/`，仅在其中引用前两个技能，不复制流程。
5. 每次落盘后跑第 9 节清单；三个技能同时存在时，重做一次路由矩阵（第 3 节）并复核 description 有无重叠。

## Related Documents

- [README](<../README.md>)：安装、CLI 与使用边界。
- [架构说明](<architecture.md>)：模块划分、信任边界与验证入口。
- [仓库展示面架构](<repository-presentation-architecture.md>)：为什么是一个仓库、多技能而不是多个仓库。
- [SKILL.md](<../skills/dbx-readme/SKILL.md>)：当前唯一已发布的技能正文。
