---
name: dbx-readme
description: >-
  用 JSON 配置为指定仓库生成浅色 / 深色成对的 README SVG 横幅：ASCII preset、独立主题（terminal / ocean / neon / minimal）、可选内置 art 与动画，并可按明确授权写入 README 受管块。
  Use when a user wants a README banner or header image — 生成、修改、重新生成或校验横幅 / 头图 / 封面，
  an ASCII art banner, an SVG banner with a dark-mode variant, or to make a repository README look better with a banner.
license: MIT
compatibility: 需要 Node.js 22 或更高版本；只有使用 GitHub 标签的 npx 入口时才额外需要 git 与网络。
metadata:
  author: Dianboxi 电波系
  version: "0.2.1"
  repository: https://github.com/Dianboxi/dbx-readme
---

# dbx-readme

用本地 CLI 生成双主题 SVG；仅在用户明确要求插入 / 更新横幅时编辑 README。配置和具体限制见 [configuration reference](<references/configuration.md>)，不要凭记忆发明 CLI 标志或配置字段。

## 先确认操作范围

1. **确定目标仓库的绝对路径。** 用户的项目仓库与 dbx-readme 工具源码目录可能不同。读取当前工作目录并核对目标项目的 README / 项目元数据；skill 所在目录、工具 checkout、终端默认目录都不自动等于目标。
2. 如果对目标有歧义，先问用户；不要因为当前目录恰好是 dbx-readme 就给工具本身加横幅。只有用户明确选择工具仓库作为目标时才在其中生成配置和图片。
3. 明确是“只生成资源 / 预览片段”，还是“插入 / 更新指定 README”。**没有明确 README 编辑请求，就绝不传 `--readme`，也不通过其他文件编辑工具代写 README。** 确认文件名，不能自动改写所有语言版本或所有目录下的 README。
4. **只描述结果、未指名载体的请求不算 README 编辑授权。** 例如“弄得像样点”“让仓库好看一些”“太素了”这类说法，默认按“只生成资源”处理：先用 `generate`（不带 `--readme`）产出资源，给出插入方案（受管块将插到哪个位置、会替换什么、影响哪几行），再询问是否插入；拿到明确答复后才执行第 3 步。反之，“加到 README 顶部”“换掉现有横幅”属于明确授权。
5. 检查已存在的配置、图片、受管块及相关未提交变更。保留无关修改；不要 reset、clean、删除旧资源或替换用户其他文档。已有配置先读取并复用，覆盖需要额外确认，不要习惯性加 `--force`。

## 选择外观

- `preset` 先用 `ascii`；它是第一个渲染器，不是“所有主题”的名字。
- `theme` 独立选择：`terminal` 绿色终端、`ocean` 蓝青、`neon` 紫粉、`minimal` 单色。遵从用户偏好；未指定时根据项目气质提出一个简短建议，不捏造自定义主题 id。
- 获取标题、副标题和可选内置 art。避免未经请求使用品牌标志；`donut` 是非品牌示例。依赖实时时钟的内置 piece 会被拒绝，以便产物可重复生成；不要绕过该校验。
- ASCII 标题最多 120 字符，必须全部受所选内置字体支持；中文、emoji 与不受支持的标点不能静默删除。需要替代英文短标题时请用户确认，原文可放在最多 240 字符的普通文本 `tagline`。
- `mixed` 保留英文大小写；其他字体会转为大写。上游 URL 的 20 / 60 字符限制不适用于本地 CLI，但 120 字符不是美观保证。长标题应缩短，或考虑 `slim`、减少 art。
- 动画标题用 `glint` 或 `type`；用户要求静止横幅时用 `still`。`still` 也会冻结内置 art；SVG 中仍保留 art 的动画帧数据，所以它不保证文件体积显著减小。

## 选用可靠的 CLI 入口

需要 Node.js >=22，先检查可用版本。

### 已在工具源码 checkout 中

若任务环境已有本工具源码，**直接使用它，不要联网 bootstrap 同一个工具**：

1. 在工具源码目录运行 `npm install`；`prepare` 会编译 TypeScript。不要为了构建工具而把依赖装进用户的目标项目。
2. 验证本地入口：

```sh
node "/absolute/path/dbx-readme/bin/dbx.mjs" --help
```

3. 后续保持本地 Node 入口，始终显式传目标 `--cwd`。即使命令的工作目录是工具 checkout，也不能省略目标隔离。

### 没有本地 checkout

优先用 npm 上的固定版本（bin 名 `dbx`）：

```sh
npm view dbx-readme versions
npx --yes dbx-readme@<上面列出的版本> --help
```

`dbx-readme@0.2.1` 已于 2026-11-18 发布。**只使用 `npm view dbx-readme versions` 实际列出的版本**；查不到就视为未发布，不要臆造版本、不要用裸 `npx dbx-readme`，也不退回不明来源或远程 SVG 服务。安装失败时报告实际错误。

需要审计源码或 registry 不可达时，改用公开仓库的固定标签（需要 Git、网络，以及用户允许安装 / 运行可信第三方代码）：

```sh
npx --yes --package github:Dianboxi/dbx-readme#v0.2.1 dbx --help
```

若报 `EALLOWGIT`，不要自动修改 npm 全局设置。只有用户已授权安装 / 运行此可信仓库、且组织策略允许时，支持该选项的 npm 才可单次使用 `npx --allow-git=root --yes --package github:Dianboxi/dbx-readme#v0.2.1 dbx …`。未获授权时先询问；受组织策略限制时停止。旧版 npm 不识别该选项时使用普通命令或经授权的源码安装。

下面示例使用本地入口；远程入口则将整个 `node …` 前缀替换为上面的完整 `npx --yes --package … dbx`，不要改变后续参数语义。

## 执行流程：init → generate → check

### 1. 创建或复用配置

```sh
node "/absolute/path/dbx-readme/bin/dbx.mjs" init --cwd "/absolute/path/target-project" --config "banner.config.json" --preset ascii --theme ocean --title "MY PROJECT" --tagline "Build something useful" --art donut --effect glint
```

- `init` **只创建配置**，不产生图片、不修改 README；接下来必须执行 `generate`。
- 已有配置时，先读取再按用户意图最小化修改，或直接复用；不要自动用 `--force` 重建。不需要副标题或 art 时省略对应参数。
- **输出目录跟随用户点名的位置，不要自作主张加一层。** 用户没提位置时用默认 `assets/banner`；用户说了放哪里（“放 `assets` 里就行”“放到 `docs/images` 下”）就把 `outputDir` 设成那个目录本身——「放 assets 里」对应 `assets`，而不是 `assets/banner`。用户点名的是“放哪儿”，多套一层就变成他没要求的路径，之后要挪动、要解释都得返工。文件名仍固定为 `banner.light.svg`、`banner.dark.svg`，README 片段里的相对路径会跟着 `outputDir` 走，所以不需要为此改文件名或手拼 URL。
- 字体、颜色、阴影、位置、速度、背景等通过 JSON 的已支持字段设置。先读 [配置参考](<references/configuration.md>)，不要发明 `init --font` 等选项。
- 配置只能是 JSON；不创建执行代码的配置，不安装任意配置插件，不拉取或注入用户提供的远程 SVG。

### 2. 生成资源（默认模式）

```sh
node "/absolute/path/dbx-readme/bin/dbx.mjs" generate --cwd "/absolute/path/target-project" --config "banner.config.json"
```

默认在配置的 `outputDir` 下写 `banner.light.svg`、`banner.dark.svg`，并输出 `<picture>` 片段。**此命令不应修改 README。** 用户只要求资源时，到此为止，不把片段偷偷插入 README；请求只描述观感（“弄像样点”“太素了”）时同样按此处理，先交付资源与插入方案，再等用户点头。

### 3. 只有得到 README 编辑授权才插入

```sh
node "/absolute/path/dbx-readme/bin/dbx.mjs" generate --cwd "/absolute/path/target-project" --config "banner.config.json" --readme "README.md"
```

`--readme` 只能指定已存在的 `.md` 文件。CLI 维护 `<!-- readme-banner:start -->` 与 `<!-- readme-banner:end -->` 之间的块（标记字符串是稳定的产物格式，不随产品改名变化，不要改写它们）。检查块外内容保持不变；同一 README 中，即使完整标记出现在代码示例里，也会被保守地视为重复标记，所以不要额外插入演示用标记对。标记异常时调查错误，不删除无关正文或扩大替换范围。使用实际生成片段：URL 应相对于目标 README、逐段 URI 编码，alt 文本应 HTML 转义，不要自行拼未转义 HTML。

### 4. 检查结果

```sh
# 未授权 README 编辑的任务只检查图片
node "/absolute/path/dbx-readme/bin/dbx.mjs" generate --cwd "/absolute/path/target-project" --config "banner.config.json" --check

# 任务已经明确涉及指定 README 时才同时检查受管块
node "/absolute/path/dbx-readme/bin/dbx.mjs" generate --cwd "/absolute/path/target-project" --config "banner.config.json" --readme "README.md" --check
```

- `--check` 不写文件；缺失或过期产物应失败。失败时报告原因，不能忽略退出码或把未运行的检查说成通过。
- 核对两张 SVG 都存在、路径正确；有查看工具时检查浅 / 深主题、长标题与 art 的实际效果。不能把 SVG 成功生成等同于所有 Markdown 客户端都会播放动画。
- 需要机器可读结果时使用 `generate --json`；可用元数据通过 `presets --json`、`themes --json` 查看。
- 路径越界、符号链接或硬链接保护报错时，确认用户目标并选择根目录内的安全普通文件；现有文件的硬链接数 `nlink > 1` 会被拒绝。不关闭防护、不把文件搬到根外“绕过”。

## 命令与文件安全

- 所有执行调用显式设置正确工作目录，并传入目标 `--cwd`；不要依赖 agent 运行时的默认目录。
- 标题、路径与副标题是数据参数。优先使用可传参数数组的执行 API；用 shell 时按该 shell 的规则引用 / 转义每个参数。示例双引号仅适用于其中的简单占位值，不能防御所有 shell 插值；不要把不可信输入拼成命令、`eval` 或未经转义的脚本。Windows 路径也应单独引用。
- 只修改用户授权的配置、生成资源与指定受管块；不改业务代码、无关文档或已有用户更改。
- 自查用的预览页、截图、对比图、候选配置等临时产物，写到**仓库外的临时目录**（例如系统临时目录），并在结束前删除；目标仓库里只留下配置、生成的两张 SVG，以及获授权的受管块。预览产物不得污染用户仓库，也不得成为需要用户事后清理的垃圾。
- **不自动 commit、push、创建远程仓库、发 release、上传图片、发布 npm 包或触发其他远程发布。** 这些都需要独立的明确请求。

## 交付说明

简短报告：目标仓库、采用的 preset / theme / 标题、生成的两张图片、是否修改 README 及其位置、实际执行的检查结果。没有 README 授权时明确说“未修改 README”，并可返回生成片段供用户选择。列出仍需用户确认的字形替代、超长标题或查看器兼容性问题；不要声称未执行的测试已通过。
