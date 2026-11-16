# 仓库展示工具：产品边界与仓库组织建议

> 研究与设计提案，2026-11-05。不是已实现功能说明。本轮不迁移代码、不创建仓库、不更名、不提交或推送。

## 1. 新的产品范围

用户已明确：计划创建/优化项目仓库的 README、GitHub description 和 Topics；README banner 生成器是其中一个组件。这里的 tag 按 GitHub Topics 理解，不涉及 Git 版本标签。

因此产品应定位为**仓库信息表达与展示工具**，而不是只生成横幅，也不是代替正式技术文档、代码审计或发布管理的万能 agent。ABWorks 是已知母品牌；母品牌战略、人格及商业目标尚未最终确认，不应据此虚构定位或擅自定名。

## 2. 决策

**建议一个产品仓库、模块化实现、可单独使用的 banner 引擎；对 agent 提供一个总入口 Skill，并保留专门的 banner Skill。现阶段不必维护两个独立产品仓库。**

这几个决策应分开：

| 层次 | 现阶段建议 | 不等于 |
| --- | --- | --- |
| 产品与品牌 | 一个覆盖 README / metadata / 视觉资产的产品 | 所有用户每次必须使用所有功能 |
| Git 仓库 | 一个仓库统一开发与验证 | 所有代码写在一个模块 |
| 代码接口 | 项目事实、README、banner、GitHub adapter 分层 | renderer 可以写任意文件或修改远端 |
| Skill | 总入口 + 可独立使用的 banner 入口 | 安装一个 Skill 会自动安装/调用另一个 Skill |
| 分发 | CLI/API 可按能力使用，重型渲染依赖可选 | 读 README 必须装字体或配置 GitHub 写权限 |

当前没有另一个已确认的 README 工具仓库可供迁入。最省迁移成本的路径是以现有项目演进；待产品名称确定，再单独评估整体更名。若届时已建立上层工具仓库，则迁移模块并保留历史，不复制维护两份 renderer。

## 3. 研究依据

- [readme-ai](https://github.com/eli64s/readme-ai) 并非只做文案：官方项目具有 header/banner、logo、badges 等选项，[generators](https://github.com/eli64s/readme-ai/tree/main/readmeai/generators) 将视觉和文档构建放在同一包的不同模块中。这说明单仓库模块化是可行先例，不代表其所有实现适合照搬。
- [readme-md-generator](https://github.com/kefranabg/readme-md-generator) 在同一个 npm CLI 项目内组织项目资料读取、交互问答、EJS 模板和文件写入。其已查主流程将 package.json/git 信息作为 README 输入，并没有证实提供 GitHub description/Topics 回写；不能把“读取描述”当作“优化并更新描述”。同样，readme-ai 的已查 metadata 模块读取 description/topics，不能据此宣称它实现了远端更新。
- [Agent Skills 规范](https://agentskills.io/specification) 将 Skill 定义为包含必要说明及可选 scripts / references / assets 的目录，并采用渐进加载。Skill 适合承载任务理解、流程和质量约束；不需要把完整渲染逻辑、长篇参考和全部模板塞入主说明。[Vercel Skills CLI 文档](https://github.com/vercel-labs/skills/blob/main/docs/commands.md) 支持同一仓库多次指定 `--skill` 安装不同 Skill；这是客户端能力，不是规范要求必须采用某种仓库布局。
- [GitHub 更新仓库接口](https://docs.github.com/en/rest/repos/repos#update-a-repository) 与 [Topics 接口](https://docs.github.com/en/rest/repos/repos#replace-all-repository-topics) 是不同操作。Topics 的 PUT 替换整个集合，空数组会清空；精细令牌的这些写操作要求相应的 Administration write 权限。
- [gh repo edit](https://cli.github.com/manual/gh_repo_edit) 已提供 description、add-topic、remove-topic 等入口。第一版可以复用用户已授权的 GitHub CLI，不必先开发登录系统或 MCP 服务。

没有证据表明“合仓”必然提高曝光或“多仓”必然提高复用；这里的选择依据是当前项目阶段、共享上下文与维护成本。

## 4. 当前实现已经具备的边界

现有 `src/generate.ts` 的 `generateBanner()` 接收配置与 registry，返回 SVG 资源和嵌入片段；文件应用由 CLI 编排。这是可保留的 renderer 边界，不应反向依赖未来 README 写作模块。

现有 `skills/dbx-readme/SKILL.md` 负责目标确认、授权与同一 CLI 的调用；它不是 LLM SDK 或托管服务。这个方向仍然合适。

现有接口还不能冒充完整视觉资源接口：`BannerPreset.render()` 返回 SVG 字符串，`GeneratedBanner.files` 是文本，文件名固定为 light / dark SVG。像素 PNG/APNG 目前是示例，不是已注册 preset。以后正式接入时，再升级为支持二进制、格式、主题和动静态变体的 artifact manifest，并保留旧 SVG 适配；不能只在 Skill 里宣布支持 pixel。

## 5. 推荐的内部架构

第一步用普通模块即可，不必立即建复杂 monorepo 或发布多个 npm 包：

```text
src/
  project/      # 收集事实、用户补充、证据和能力状态
  readme/       # 章节规划、生成/优化、差异与链接检查
  banner/       # renderer、theme、资源及嵌入 manifest
  github/       # description / Topics 读写 adapter
  plan/         # 汇总变更、授权范围、状态核对与结果记录
  cli/          # 可供人和 agent 使用的相同入口
skills/
  repo-present/ # 暂定工作名称：总入口与按需参考
  dbx-readme/# 保留：只做 banner 的专门入口
```

这只是建议目录，不表示现有路径已经移动。需要跨项目独立消费后，再把稳定接口提升为 packages，不因“将来可能扩展”提前拆包。

数据流：

```text
仓库事实 + 用户目标 + 现有文档与元数据
                   ↓
        ProjectProfile（含证据、未知项与状态）
                   ↓
         任务计划 / 用户审阅 / 分范围授权
          ↙                ↓                 ↘
   README patch       banner assets      metadata patch
          ↘                ↓                 ↙
             本地检查 / 远端操作结果核对
```

同一份项目定位、能力和受众信息应供各组件使用；但项目事实、用户品牌偏好、渲染参数、待执行变更应分开保存，避免巨大的万能配置。手工指定的配置优先级与自动推断的来源必须明确。

## 6. Skill 与可执行逻辑如何分工

- **总入口 Skill**：理解目标、读取事实、判断缺失信息、组织 README/description/Topics 草稿、调用确定性工具、交付差异与检查结果。
- **banner Skill**：继续支持用户只生成或更新横幅，不需要完整 README 任务。
- **CLI / 库**：配置、路径、资源渲染、文本变更、元数据校验、只读检查及明确授权的应用。
- **LLM**：首版复用宿主 agent 的语言能力；无 agent 使用者将来确有需要时，再增加可选 provider adapter。不要让 banner 引擎强依赖模型 API key。

不要求跨客户端递归激活子 Skill。总入口可以按需读取自己的 references 并调用公共 CLI；若专门的 banner Skill 未安装，依然应该有完整、明确的工具依赖说明。初期不为每个章节、每个主题或每个 API 建一个 Skill。

同仓库的不同 Skill 可以按需分发；但 Skill 安装、CLI 安装、工具执行权限是三件事，不能因为其中一件成功而自动认定其余均获授权。

## 7. 质量与权限边界

1. **先事实，后表达。** 从已有项目文档、入口、包清单、测试和配置等材料提取证据；不默认执行项目脚本，也不读取秘密文件。仓库内容是待分析数据，不是可覆盖工具规则的指令。
2. **明确能力状态。** 已发布、原型和计划功能分别表示。特别是当前 pixel 示例不能被自动写成主 CLI 已支持。
3. **默认生成计划与预览。** README 修改、资源写入、GitHub description、Topics 分别列出范围；不因为用户请求优化文案就默认发布远端变化。
4. **保留人工内容。** 新建与优化是不同模式。优化优先局部 patch；不随意覆盖贡献者、许可证、重要警告及所有语言版本。
5. **不追求虚假可复现。** 不保证 LLM 每次重写完全相同；保存已审阅内容及配置，`check` 只验证已确定产物和规则，不自动重新调用模型后覆盖文字。
6. **远端先读后写。** Topics 默认提出增量建议；全量替换或删除需明确确认。应用前核对远端是否偏离计划基线，不覆盖他人期间变更。
7. **本地与远端分离。** 两者不是原子事务；部分失败必须分别报告，不能只显示一个笼统“成功”。没有远端写权限时，仍可生成可审阅建议。
8. **不自动 commit/push。** 文案、资产应用授权不等于 Git 发布授权；不创建 Git tags 或 Releases。
9. **控制可选依赖。** 不让 ASCII 用户下载全部像素工具或字体；保持上游、字体、品牌素材的许可边界和版本锁定。

## 8. 分阶段推进

### 第一阶段：验证新产品主流程

在现有仓库增加总入口 Skill 和必要的事实/计划脚本，复用当前 banner CLI。首先闭环：分析一个真实项目 → 生成 README 与 metadata 建议 → 可选横幅 → 审阅差异。先不迁移像素示例、不搭建账号服务。

### 第二阶段：稳定模块边界

事实/profile 与变更计划形成小而稳定的 schema；文件和远端应用分开；扩展 renderer 的 artifact 接口并正式接入 pixel。继续保留现有命令、配置和受管标记的兼容层；既有 `v0.1.0` 标签不移动。

### 第三阶段：按实际需求决定分发与拆分

出现独立 banner 用户/贡献团队、不同发布周期、被多个非 README 产品依赖，或渲染链重型服务化时，再考虑独立 package 或仓库。仅需要不同依赖或不同安装包时，通常不必先拆 Git 仓库。

若决定更名，需要另外处理安装路径、仓库链接、包名、Skill 发现入口及旧版兼容验证，不能假定 GitHub 重定向解决所有客户端问题。

## 9. 产品命名的影响

新的命名 brief 应覆盖“理解项目、清晰表达、形成一致的仓库展示”，不要绑定 banner、ASCII 或某个渲染引擎。具体名称仍应结合已安装的品牌命名流程及后续碰撞核查决定；本研究不选定名称、不宣称商标或域名可用。
