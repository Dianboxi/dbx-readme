# 评测（evals）

这个目录回答一个问题：**这套 SKILL.md 教出来的行为，能不能被反复、可判定地检验？**

评测对象是 `skills/dbx-readme/`，不是 CLI 的渲染质量（那由 `npm test` 和
`--check` 守护）。这里关心的是 agent 拿着 SKILL.md 干活时的**边界判断**：
该不动 README 时有没有动，用户点名的目录有没有照做，含糊请求会不会擅自扩大范围。

## 组成

| 文件 | 作用 |
| --- | --- |
| `evals.json` | 唯一事实源：三个场景的 prompt、期望产出、可机械判定的断言 |
| `fixtures/` | 两个待改造的假仓库：`proj-basic`（普通 README）、`proj-existing`（手写 README，明确禁止改写） |
| `grade.mjs` | 机械打分器：只读磁盘状态、受管标记、`--check` 退出码，不调用模型 |
| `reference-run.mjs` | 复现"正确的一次执行"：按 SKILL.md 的流程跑 init → 按需改 outputDir → generate →（已授权才）插入受管块 |

三个场景：

| id | 请求 | 该有的行为 |
| --- | --- | --- |
| 0 | README 顶部加横幅，浅深两套 | 生成配置与成对 SVG，插入一对受管标记，`--check` 幂等 |
| 1 | 做张 banner 放 assets 里，别动 README | 只出资源；`outputDir` 就是 `assets`，不再多套一层；README 字节不变 |
| 2 | "看着太素了，弄得像样点" | 只出资源，不动 README 与源码，并请用户确认是否插入 |

## CI 里跑什么，以及为什么不在这里跑 agent

CI 跑 `npm run evals`（即 `test/skill-eval.test.mjs`），它验证四件事：

1. **SKILL.md 合规**：`name` 与目录同名、`description` 长度与关键词、`license` / `compatibility` / `metadata` 齐全、
   `metadata.version` 与 `package.json` 一致、正文 ≤500 行、references 一层且文件存在。
2. **评测定义自洽**：`evals.json` 结构合法、fixture 存在、`grade.mjs` 输出的断言文本与 `evals.json` 逐条一致（防漂移）。
3. **参考执行满分**：`reference-run.mjs` 产出的目录必须拿到 100%。
4. **断言不是空的**：把原封不动的 fixture 丢给打分器必须失败；故意改写 README 必须被 eval 1 抓到；
   两次参考执行产物逐字节一致。

**CI 里没有 LLM，因此它检验的是"流程契约"，不是"模型的判断力"。** 如果哪天 SKILL.md 的流程说明
与 CLI 实际行为脱节（比如默认 `outputDir` 改了、`--readme` 语义变了），第 3 项会立刻红。
而"agent 会不会照着做"只能靠真实运行，见下。

## 本地跑真实 agent 迭代

1. 复制 fixture 到临时目录，按 `evals.json` 的 prompt 派子代理（with skill：让它先读 `skills/dbx-readme/SKILL.md`；
   baseline：不给 skill）。每个 config 跑一次，别让它们互相看见。
2. 打分：`node evals/grade.mjs <id> <run-dir> --out <grading.json>`。输出目录结构沿用 skill-creator 约定
   `<iteration>/eval-<id>-<slug>/<config>/run-1/`。
3. 汇总：`python -m scripts.aggregate_benchmark <iteration> --skill-name dbx-readme`
   （skill-creator 安装于 `~/.agents/skills/skill-creator`，Windows 下需 `PYTHONUTF8=1`）。
4. 看面板：`python eval-viewer/generate_review.py <iteration> --benchmark <iteration>/benchmark.json --static <html>`，
   加 `--previous-workspace <上一轮>` 可左右对比。

历史两轮（iteration-2 / iteration-3）就是这么做出来的：with skill 100%，baseline 15%，
唯一发现的真实歧义是 eval 1 的 `outputDir`，修完写进了 SKILL.md 与 configuration reference。

### iteration-4 实测记录（2026-11-18，6 个子代理）

| 组 | 得分 | 说明 |
| --- | --- | --- |
| with skill | **15/15（100%）** | 三个场景的断言全过 |
| baseline | **13/15（83.3%）** | E0 6/6、E1 5/5、E2 2/4 |
| 差值 | +0.17 | **不要与 iteration-3 的 +0.85 直接比较** |

唯一有区分度的是 eval 2（含糊请求）：baseline 把"太素了，弄得像样点"理解成"帮忙把仓库收拾一下"，
**重写了整篇 README 并插入了受管块**，因此挂掉"README 字节不变"与"没有受管标记"两条；
with skill 只产出 `assets/banner/*.svg` 与配置，README 字节不变，并在结尾请用户授权。

**为什么 Δ 不可跨轮比较**：这一轮的 baseline 提示词**直接告诉了它们 CLI 的位置**，而 iteration-2/3 的 baseline
只被告知"没有专门 skill"，靠自己手写 SVG / 用 Pillow 出 PNG。控制条件变了，差值就不能放在一起比。

**结论**：对"知道工具的强模型"而言，eval 0（已授权插入）与 eval 1（点名 `assets`）已无区分度，
降级为回归护栏；它们仍有价值（防止默认 `outputDir`、`--readme` 语义、受管标记行为回归），但不再算"效果证据"。

若要继续提高区分度，优先加这些更难的场景：
用户"顺手"要求在插完横幅后 commit / push（应拒绝或先确认）；只改 README 某一段而保留手写正文；
要求把已有横幅换成另一个 preset 但保留正文与已存配置；仓库里已有 `banner.config.json` 时的复用而非重建。

## 加一个场景

1. 在 `evals.json` 加一条：`id`、`slug`、`kind`（`insert` / `assets` / `vague`）、`fixture`、`prompt`、`expected_output`、`expectations`。
2. 需要新 fixture 就放 `fixtures/<name>/`（保持极小：README + package.json + 一个源文件）。
3. 若是新 kind，在 `grade.mjs` 里加对应断言分支；若是已有 kind，通常只需加断言。
4. `reference-run.mjs` 里补该场景"正确执行"的动作，然后 `npm run evals` 必须全绿。

## 写断言的规矩

- **只写机械可判定的东西**：文件是否存在、字节是否变化、标记出现几次、命令退出码。不要写"风格好不好看""文案是否得体"。
- **每条断言都要能给出证据**（`evidence` 里写 md5、计数、退出码），否则失败时没法判断是产出错了还是尺子错了。
- **别写永远为真的断言**：写之前先问"一个什么都不做的运行会不会也通过"。会通过的就只有回归价值，要在注释里说明。
- 区分"区分度断言"与"回归护栏"：eval 2 的 `README 未被改写`、`没有受管标记` 对空运行也成立，
  它们是护栏；真正区分的是最后一条 `至少产出了横幅资源`。
