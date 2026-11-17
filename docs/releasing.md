# 发布流程

本页是 `dbx-readme` 的发布检查清单。所有命令都在仓库根目录执行。

## 两条分发通道

| 通道 | 载体 | 用户获取方式 |
| --- | --- | --- |
| CLI | npm 包 `dbx-readme`（bin `dbx`） | `npx dbx-readme@<version>` 或全局安装 |
| Agent Skill | GitHub 仓库里的 `skills/dbx-readme/` | `npx skills add Dianboxi/dbx-readme --skill dbx-readme` |

注意两者的边界：**skills CLI 从 GitHub 读取 skill 目录，不从 npm 包读取。** npm 发布解决的是 CLI 获取问题，不改变 skill 的安装命令。

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

这是写入时的二次验证要求，不是包名、权限或组织归属问题；上面的 `prepublishOnly`、38 项测试与打包都已通过，失败只发生在最后的 PUT。三种处理方式：

1. **单次 OTP（最快）**：`npm publish --otp=<6 位代码>`。`prepublishOnly` 会先跑约 13 秒的检查，所以要在命令执行前刚生成代码，避免过期。
2. **专用 token**：在 npm 网页端创建 Granular Access Token，勾选 **Bypass 2FA**，权限给 `read and write`，并只授权本包；替换 `.npmrc` 中的 `_authToken`。适合需要反复本地发布的场景。
3. **CI 发布免 token**：先用手工方式发布一次让包存在，之后在 npm 包设置里把 `.github/workflows/release.yml` 登记为 trusted publisher，标签发布即可走 OIDC 并带 provenance，不再需要 OTP 或 token。

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
