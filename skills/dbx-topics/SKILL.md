---
name: dbx-topics
description: >-
  设置或更新 GitHub 仓库的 description（简介）与 topics（话题标签）：先把现状与差异算成一份计划，
  经用户确认后再写入。适用于"给仓库加话题标签"、"改一下 GitHub 上的简介"、"topics 太少了帮我补几个"、
  "把过时的标签删掉"、"repo description / GitHub topics / GitHub 简介 / 仓库标签"这类请求。
  Use when a user asks to set, add, remove, or tidy a GitHub repository's description or topics.
  Not for README files or banner images (use dbx-readme), and not for multi-surface presentation
  work (use dbx-presentation).
license: MIT
compatibility: Requires Node.js 22 or later and an authenticated GitHub CLI (gh) on PATH. Reads and writes public repository metadata, so the gh account needs admin on the target repository.
metadata:
  author: Dianboxi 电波系
  version: "0.3.0"
  repository: https://github.com/Dianboxi/dbx-readme
---

# dbx-topics：仓库简介与话题标签

用 `dbx topics` 把「当前元数据 → 目标元数据」算成计划，用户确认后才写入。默认只读。

## 1. 先确认操作范围

- 目标仓库：默认取 `--cwd` 所在 git 仓库；跨仓库操作时显式 `--repo <owner/name>`，不要靠猜。
- 写入授权：`get` / `plan` 可以直接跑；`apply` 会**改写公开仓库的元数据**，必须先拿到用户对具体计划的明确同意。
- 用户只描述了意图（"标签太少了"）而没有给定内容时，先 `get` 出现状，给出建议再问，不要直接 `apply`。

## 2. 检查能力

```bash
dbx topics --help
```

命令缺失说明用的是旧版本（`< 0.3.0`）。此时如实说明，请用户升级（`npx --yes dbx-readme@0.3.0 topics --help`），
**不要自己编造参数，也不要绕过工具直接用 `gh repo edit`** —— 那等于替用户扩大了授权范围。

## 3. 读现状

```bash
dbx topics get --cwd /absolute/path/to/repo          # 人类可读
dbx topics get --cwd /absolute/path/to/repo --json    # 结构化
```

## 4. 写配置

在目标仓库根目录创建 `presentation.config.json`（只放元数据，不放横幅配置）：

```json
{
  "schemaVersion": 1,
  "description": "dbx-readme — JSON-config README banners: ASCII SVG CLI, theme presets, and portable agent skills.",
  "topics": ["readme", "banner-generator", "ascii-art", "cli", "agent-skills"]
}
```

语义（写在文件里就生效，别靠记忆）：

- `topics` **缺省** = 保留现状，只应用 `remove` 里点名的标签；**缺省不等于清空**。
- `topics` **显式给出（含 `[]`）** = 权威集合，会覆盖 GitHub 上的整个标签集。
- `remove` = 想删掉的标签，与 `topics` 不得重叠。
- `description` 缺省 = 不改简介。空字符串、超过 350 字符、多行都会报错。
- 标签规则：小写字母/数字/连字符（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）、单个 ≤50 字符、总数 ≤20。GitHub 侧也是 ≤20 个，超出会失败。

## 5. 算计划，给用户看

```bash
dbx topics plan --cwd /absolute/path/to/repo --json
```

把 `add` / `remove` / `unchanged` 和简介的前后对照讲清楚（尤其是"会删掉哪些标签"），再问一次是否执行。

## 6. 写入

用户明确同意后：

```bash
dbx topics apply --cwd /absolute/path/to/repo --yes
```

`--yes` 只是确认标记，不代表你已经获得授权——授权来自用户在对话里的明确答复。
执行顺序是简介 → 删标签 → 加标签；任一步失败就停下，把失败的那一步和 gh 的报错原文交给用户，不要重试狂刷。

## 7. 交付说明

告诉用户：改了什么（简介前后、增删的标签）、没改什么（`topics` 缺省时未删除任何标签）、以及本次只动了远端元数据、
没有提交任何本地文件（`presentation.config.json` 是否要提交进仓库，让用户决定）。
