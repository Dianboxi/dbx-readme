---
name: dbx-presentation
description: >-
  把仓库的对外呈现一次做齐：README 横幅、README 正文、以及 GitHub 上的 description 与 topics，
  统一成一份计划、按用户授权逐项落地。适用于"把这个仓库的整体门面弄好"、"README 和 GitHub 上的简介标签一起改"、
  "开源前做一次发布准备"、"repo presentation / GitHub 门面 / 项目包装"，尤其是用户同时提到多个面的时候。
  Use when a request spans more than one presentation surface: README banner + README text + GitHub
  description/topics. For a single surface, call dbx-readme or dbx-topics directly instead.
license: MIT
compatibility: Requires Node.js 22 or later. Remote metadata changes need an authenticated GitHub CLI (gh) with admin on the repository; README and banner work needs only the local files.
metadata:
  author: Dianboxi 电波系
  version: "0.3.0"
  repository: https://github.com/Dianboxi/dbx-readme
---

# dbx-presentation：仓库门面总编排

这个 skill 只做**一件事**：当请求同时涉及多个面时，把顺序、授权和失败边界排清楚。它不重复子流程，
具体怎么生成横幅、怎么写配置，去读 `dbx-readme`；怎么改简介和标签，去读 `dbx-topics`。

## 1. 先分清是几个面

| 用户说的是 | 面 | 该走谁 |
| --- | --- | --- |
| 加个横幅 / 换主题 / 深色浅色 | README 横幅 | `dbx-readme` |
| 改简介 / 加标签 / topics | GitHub 元数据 | `dbx-topics` |
| 两个以上，或"整体弄好" | 多面 | 本 skill |

**单一面时不要用本 skill**：直接调对应子 skill，别为了"统一"而多绕一层。

## 2. 盘点现状（只读）

```bash
dbx topics get --cwd /absolute/path/to/repo --json
node /absolute/path/to/dbx-readme/bin/dbx.mjs generate --cwd /absolute/path/to/repo --config banner.config.json --check
```

第二条命令会说明横幅资源是否已就位、是否与配置一致。README 有没有受管块，直接看文件里的
`<!-- readme-banner:start -->` / `<!-- readme-banner:end -->`（这对标记是稳定格式，**不要改写它们**）。

## 3. 排计划，先给用户

一次性列出准备做的每一件事，并标明风险等级：

1. 本地资源（配置 + 两张 SVG）——低风险，可先做。
2. README 受管块插入/替换——中风险，必须有明确授权；只描述结果的说法不算授权。
3. 远端元数据（description / topics）——高风险，会立刻改变公开仓库；必须单独确认，并说明会删掉哪些标签。

任何一项没拿到授权，就跳过它并说明原因，不要"顺手一起做"。

## 4. 落地顺序（固定）

```bash
# 4.1 本地资源
node /absolute/path/to/dbx-readme/bin/dbx.mjs generate --cwd /absolute/path/to/repo --config banner.config.json

# 4.2 README（仅在用户明确授权编辑 README 时）
node /absolute/path/to/dbx-readme/bin/dbx.mjs generate --cwd /absolute/path/to/repo --config banner.config.json --readme README.md

# 4.3 远端元数据（仅在用户明确授权后）
dbx topics plan --cwd /absolute/path/to/repo --json
dbx topics apply --cwd /absolute/path/to/repo --yes
```

**从本地到远端，遇错即停**：前一步失败就不要继续下一步——远端元数据改动不可回滚，不能建立在半成品之上。

## 5. 收尾核对

```bash
node /absolute/path/to/dbx-readme/bin/dbx.mjs generate --cwd /absolute/path/to/repo --config banner.config.json --check
dbx topics get --cwd /absolute/path/to/repo --json
git -C /absolute/path/to/repo status --short
```

三项分别回答：资源是否幂等、远端是否已是目标状态、本地改了哪些文件。

## 6. 不做的事

- 不自动提交、不自动推送、不自动发版；`git commit` / `git push` / `npm publish` 都要用户另外明说。
- 不在没有授权时编辑 README 正文以外的代码文件（`package.json`、`src/`）。
- 不静默删除标签：`topics` 缺省表示保留现状，删标签必须走 `remove`。
- 不把自查用的预览图、对比截图留在目标仓库里。
