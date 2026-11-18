# 发布流程

本页是 `dbx-readme` 的发布检查清单。所有命令都在仓库根目录执行。

## 两条分发通道

| 通道 | 载体 | 用户获取方式 |
| --- | --- | --- |
| CLI | npm 包 `dbx-readme`（bin `dbx`） | `npx dbx-readme@<version>` 或全局安装 |
| Agent Skill | GitHub 仓库里的 `skills/dbx-readme/` | `npx skills add Dianboxi/dbx-readme --skill dbx-readme` |

注意两者的边界：**skills CLI 从 GitHub 读取 skill 目录，不从 npm 包读取。** npm 发布解决的是 CLI 获取问题，不改变 skill 的安装命令。

## 当前发布状态（需先读这段）

- 包版本：`main` 上为 `0.2.1`；固定标签 `v0.2.1` 指向 `1682f7c`，即产出 npm 包的同一提交。
- npm：**`dbx-readme@0.2.1` 已发布**（`2026-11-18T09:32:26Z` 生效，`dist-tags.latest` 指向它）。干净目录里 `npx --yes dbx-readme@0.2.1 --version` 返回 `0.2.1`。
- 分发分工：CLI 走 npm；skill 仍从 GitHub 读取（`npx skills add Dianboxi/dbx-readme --skill dbx-readme`）。推送 `v0.2.1` 后 `release.yml` 会因“该版本已存在”跳过 `npm publish`（守卫步骤见工作流）；历史标签 `v0.1.0`、`v0.2.0` 保持不动。
- 遗留：registry 上仍留着一个 `0.0.0-stage` 版本记录（暂存发布产物，不是 `latest`）。可用 `npm deprecate dbx-readme@0.0.0-stage "staged placeholder; use 0.2.1"` 标注，避免有人手滑固定它。
- 发布方式（passkey 账号不能用 `--otp`）：web 认证实测可行——先 `npm login --auth-type=web --userconfig "$env:TEMP\npm-web.npmrc"`，再 `npm publish --access public --userconfig "$env:TEMP\npm-web.npmrc"`；浏览器确认 `https://www.npmjs.com/auth/cli/<id>` 后 npm 才会真正发起 PUT。注意这会绕开 `.npmrc` 里已有的普通 token，两者不要混用。
- **过往阻塞·已解除（2026-11-17 实测）**：撤回暂存发布会在 registry 留下 unpublished 记录，npm 因此禁止该包名在 **24 小时**内重新发布，PUT 返回 `403 Forbidden - dbx-readme cannot be republished until 24 hours have passed.`。本次撤回发生在 `2026-11-17T09:10:46Z`，最早可重发时间为 **`2026-11-18T09:10:46Z`（北京时间 2026-11-18 17:10）**；在此之前任何重试都会得到同样的 403，不要误判为 token 或权限问题。

- **过往阻塞·墓碑（2026-11-18 实测）**：冷却结束后首次重发仍可能返回 `E409 Conflict - Failed to save packument`——registry 上该文档 `versions` 为空、只剩 `time.unpublished` 记录。重试一次即成功（第二次返回 `+ dbx-readme@0.2.1` 与“being processed”提示，约 2 分钟后 packument 才出现新版本）。**不要为此升版本号**（阻塞在名字层），也不要连续重试。
- **认证失败会被伪装成 404**：`npm whoami` 返回 401 时，`PUT` 表现为 `404 Not Found - PUT https://registry.npmjs.org/dbx-readme`。先跑 `npm whoami --userconfig …` 确认登录，再判断是不是包名问题。

## 一次性前置

1. 确认包名归属：`npm view dbx-readme version`。首次发布前为 404 属正常。
2. 登录：`npm login`，账号需开启 2FA（发布时会要求 OTP）。
3. 仓库管理员在 npm 上配置 trusted publisher（可选，仅 CI 发布需要）。

## npm 2FA 与发布凭证

账号开启「auth-and-writes」双因素后，用 `.npmrc` 里的普通 token 发布会失败：

```
npm error code E403
npm error 403 Forbidden - PUT https://registry.npmjs.org/dbx-readme
npm error Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

这是写入时的二次验证要求，不是包名、权限或组织归属问题；上面的 `prepublishOnly`、38 项测试与打包都已通过，失败只发生在最后的 PUT。四种处理方式：

1. **暂存发布（通行密钥账号的唯一可行路径）**：见下一节。上传阶段不需要 2FA，审批在浏览器里用通行密钥完成。
2. **单次 OTP**：`npm publish --otp=<6 位代码>`。仅适用于用认证器 App（TOTP）的账号；`--otp` 不接受通行密钥。`prepublishOnly` 会先跑约 13 秒的检查，所以要在命令执行前刚生成代码。
3. **专用 token**：在 npm 网页端创建 Granular Access Token，勾选 **Bypass 2FA**，权限给 `read and write`，并只授权本包；替换 `.npmrc` 中的 `_authToken`。适合需要反复本地发布的场景，但该能力正在收紧。
4. **CI 发布免 token**：包存在后，在 npm 包设置里把 `.github/workflows/release.yml` 登记为 trusted publisher，标签发布即可走 OIDC 并带 provenance，不再需要 OTP 或 token。

## 暂存发布（无需 TOTP）

npm 的 2FA 可以用通行密钥（passkey / WebAuthn），而 CLI 的 `--otp` 只接受 TOTP 六位码。这种账号无法直接 `npm publish`，改用官方暂存流程：**上传阶段不验证 2FA，把"本人在场"证明推迟到审批时**。

```bash
npm stage publish             # 上传到暂存区，不需要 2FA
npm stage list                # 取得 stage-id 与状态
npm stage view <stage-id>     # 核对版本、tag、access、shasum
```

然后到 npmjs.com → **Staged Packages** 里审批（用通行密钥确认），或 `npm stage approve <stage-id>`（该命令仍会要求 TOTP，通行密钥账号请走网页）。`npm stage reject <stage-id>` 可撤回暂存。

首次发布新包时，注册表会立刻出现一个占位版本 `0.0.0-stage` 并占用该包名——这是预期行为，不是发布成功。审批通过后目标版本才替换它，`dist-tags` 才会指向真实版本。

要求 npm CLI ≥ 11.15.0 与 Node ≥ 22.14.0。暂存后状态会先显示 `validating`（安全扫描），扫描完成才可审批。

## 版本号与 tag

- `package.json.version` 与 git tag `v<version>` 必须一致，CI 与文档都依赖这一点。
- 0.x 阶段按语义化版本递增：破坏性改名 / CLI 标志变更走 minor，修复走 patch。
- 版本号一旦发布不可复用；出错时优先 `npm deprecate`，不要依赖 unpublish。

## 发布前检查

```bash
npm run check                 # tsc --noEmit
npm test                      # build + 38 项测试
npm pack                      # 人工核对 tarball 清单
npm publish --dry-run         # 确认文件数、体积、registry 与 access
```

`npm pack` 的清单应只包含 `bin/`、`dist/`、`skills/`、`package.json`、`README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`。若出现 `test/`、`examples/`、`src/` 或 `.verification/`，先修 `files` 字段再继续。

安装烟测（用打出来的 tarball，而不是源码目录）：

```bash
cd "$(mktemp -d)" && npm init -y
npm install --no-audit --no-fund <repo>/dbx-readme-<version>.tgz
./node_modules/.bin/dbx --version
./node_modules/.bin/dbx init --cwd ./target --title "SMOKE TEST" --theme minimal
./node_modules/.bin/dbx generate --cwd ./target
./node_modules/.bin/dbx generate --cwd ./target --check
```

生成物应包含 `assets/banner/banner.light.svg` 与 `banner.dark.svg`，`--check` 应报告 up to date。

仓库自身也需要自洽：

```bash
node bin/dbx.mjs generate --readme README.md --check
node examples/generate-gallery.mjs --check
node examples/image-to-ascii/generate.mjs --check
node examples/pixel-game-vfx/fonts/verify-font.mjs
```

## 发布

```bash
npm publish
```

`prepublishOnly` 会自动再跑一次 `npm run check && npm test`；失败即中止，不会上传半成品。`publishConfig.access` 固定为 `public`。

## 发布后验证

```bash
npm view dbx-readme version dist.tarball
npx --yes dbx-readme@<version> --version
```

然后提交一个文档提交，把 README 与 `skills/dbx-readme/SKILL.md` 的 CLI 入口从 GitHub git 源改为 npm 版本：

```bash
npx --yes --package dbx-readme@<version> dbx --version
```

在 npm 发布之前，skill 只能通过源码 checkout 或 `npx --package github:Dianboxi/dbx-readme#v<version> dbx` 调用 CLI；后者依赖 npm 的 git 源支持（受限环境会报 `EALLOWGIT`，需 `--allow-git=root`），不应作为默认文档路径。

## Provenance

本地发布不带 provenance 声明。需要可验证构建来源时，走 CI 发布：workflow 需要 `id-token: write` 权限，并在 npm 侧把该 workflow 登记为 trusted publisher；此时由 CI 执行 `npm publish --provenance`。

不要把 `publishConfig.provenance` 写进 `package.json`：它会让本地 `npm publish` 直接失败。

## 回滚

- 24 小时内可 `npm unpublish dbx-readme@<version>`，但该版本号将永久作废，需要重新发一个新 patch 版本。
- 超过窗口期用 `npm deprecate dbx-readme@<version> "原因 + 建议版本"`，保留可安装性。
- git 侧回滚用 tag 删除 + 新 tag，不要 force-push `main`。
