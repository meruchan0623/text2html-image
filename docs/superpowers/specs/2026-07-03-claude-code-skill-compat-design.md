# 设计：让 text2html-image 兼容 Claude Code 斜杠技能

- 日期：2026-07-03
- 状态：已实现（`npm test` 全绿，两平台符号链接安装验证通过）
- 主题：Claude Code Agent Skills 兼容层

### 实现偏差记录（相对本 spec 初稿）

1. **npm 脚本主命令 `install` → `install:all`**：裸 `install` 是 npm 保留的生命周期脚本名，定义它会导致 `npm install`（装依赖）时意外触发符号链接安装、甚至在目标为真实目录时使 `npm install` 失败退出。改用带冒号的 `install:all`（非保留名）。
2. **中立化范围扩大到脚本契约（应用户"彻底中立化"决策）**：除 SKILL.md/references/根文档外，还中立化了 `scripts/build.js` 的控制台输出、`scripts/utils/workflow-core.js` 的 preview-links 文本与 **build-report.json 字段名**（`codex_browser_hint`→`browser_hint`、`codex_annotation_capability`→`annotation_capability`、`getCodexAnnotationCapability`→`getAnnotationCapability`），并同步更新了 `scripts/test.js` 的契约断言。渲染/导出等核心业务逻辑未改。

## 1. 背景与根因

`text2html-image` 是一个自包含的可编辑海报图像生成技能包，位于仓库
`skills/text2html-image/`。它目前只为 **Codex** 做了发现与安装适配：

- `agents/openai.yaml` 定义 Codex/OpenAI 接口。
- 根 `SKILL.md` 只教了如何安装到 `CODEX_HOME`（`ln -sfn ... "$CODEX_HOME/skills/text2html-image"`）。
- 技能正文大量使用 Codex 专属术语（Codex Browser、`CODEX_HOME`、"刷新当前 Codex Browser 页面"、"多模态读取 in Codex"）。

**无法在 Claude Code 斜杠技能中调用的根因**：Claude Code 只从以下位置发现技能——

| 位置 | 路径 |
| --- | --- |
| Personal | `~/.claude/skills/<name>/SKILL.md` |
| Project | `<project>/.claude/skills/<name>/SKILL.md` |
| Plugin | `<plugin>/skills/<name>/SKILL.md` |

本仓库这三处都不存在（`~/.claude/skills/` 与项目 `.claude/` 均未创建），因此
`/text2html-image` 从不出现在斜杠菜单。**Claude Code 中斜杠命令名 = 技能目录名**。

## 2. 目标与非目标

**核心原则：Claude Code 与 Codex 对称、充分兼容**——两个编程 Agent 享有对等的安装能力、对等的目录定位说明、对等的文档，任何一方都不作为"次要平台"。

### 目标
1. 让 `/text2html-image` 在 Claude Code 中被发现并可调用（个人全局范围），同时保留并增强 Codex 的安装能力。
2. 调用后命令能真正跑起来（解决运行时工作目录不是技能目录的问题），两个平台都给出对等的技能目录定位方式。
3. Claude Code 与 Codex 共用同一份 `SKILL.md`（符号链接），改动对两个平台都自然、都不退化。
4. 把平台专属术语中立化为跨平台英文措辞，使两个平台调用体验都干净（符合 Agent Skills 跨平台开放标准）。

### 非目标（YAGNI）
- 不提交项目级 `.claude/skills/`（已选个人全局）。
- 不改动 `scripts/*.js` 的渲染/导出/构建核心业务逻辑（仅中立化其面向平台的输出文本与 build-report.json 字段名，见实现偏差记录）。
- 不打包成 Claude Code plugin。
- 不修复 `templates/` 目录缺失（既有问题，与本任务无关）。

## 3. 关键规范依据（Claude Code Agent Skills）

- 发现路径见上表；**命令名 = 技能目录名**。
- frontmatter：`description` 推荐；`name` 可选（不影响命令名）；`description` + `when_to_use` 合计上限 **1,536 字符**；可选字段含 `when_to_use`、`allowed-tools`、`disable-model-invocation` 等。
- **符号链接**：personal/project 位置的 `<skill-name>` 条目可以是指向磁盘他处目录的符号链接，Claude Code 会跟随并从目标读取 `SKILL.md`。
- 脚本/资源：技能目录内可放任意辅助文件；`${CLAUDE_SKILL_DIR}` 解析为技能目录绝对路径；运行时默认工作目录是**用户当前项目目录**，不是技能目录。
- 其他平台专属术语出现在正文**不影响加载/调用**，只影响内容质量。

## 4. 设计

### 组件 1 — 双平台对称符号链接安装（发现层）

为 Claude Code 与 Codex 各创建一个符号链接，指向仓库 `skills/text2html-image/`（绝对路径）：

| 平台 | 符号链接目标 | 发现效果 |
| --- | --- | --- |
| Claude Code | `~/.claude/skills/text2html-image` | 斜杠命令 `/text2html-image` |
| Codex | `${CODEX_HOME:-~/.codex}/skills/text2html-image` | `$text2html-image` 技能 |

两个平台都跟随符号链接读取同一份 `SKILL.md`，命令名即 `text2html-image`，源码改动对两边自动同步。

**统一安装脚本** `skills/text2html-image/scripts/install-skill.js`（幂等、无第三方依赖）：
- 计算技能目录绝对路径：`path.resolve(__dirname, '..')`。
- 目标解析：
  - Claude Code → `path.join(os.homedir(), '.claude', 'skills', 'text2html-image')`。
  - Codex → `path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills', 'text2html-image')`。
- CLI：`--target claude|codex|all`，默认 `all`（两个平台都装）。
- 对每个目标执行相同的幂等覆盖逻辑（等价 `ln -sfn`）：
  - 确保父目录 `skills/` 存在（`fs.mkdirSync(..., { recursive: true })`）。
  - 若目标是**符号链接**（含失效链接）→ 先 `fs.unlinkSync` 再重建。
  - 若目标是**真实目录/文件**（非符号链接）→ **不删除**，报错并提示用户手动处理，避免误删真实数据。
  - 若目标不存在 → 直接创建。
  - `fs.symlinkSync(skillDir, target, 'dir')`。
- 打印每个平台的结果：源路径、目标路径、下一步提示（Claude Code 可能需重启才刷新斜杠菜单）。
- 单个目标失败不阻断另一个目标（各自 try/catch，末尾汇总退出码）。

`package.json` 增加脚本（主命令用 `install:all`，避开 npm 保留的 `install` 生命周期名）：
```json
"install:all": "node scripts/install-skill.js",
"install:claude": "node scripts/install-skill.js --target claude",
"install:codex": "node scripts/install-skill.js --target codex"
```

调用：`npm run install:all`（两个都装）/ `npm run install:claude` / `npm run install:codex`。

**手动兜底命令**（写入根 `SKILL.md`，两个平台对称）：
```bash
# Claude Code
mkdir -p ~/.claude/skills
ln -sfn "$(pwd)/skills/text2html-image" ~/.claude/skills/text2html-image

# Codex
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -sfn "$(pwd)/skills/text2html-image" "${CODEX_HOME:-$HOME/.codex}/skills/text2html-image"
```

### 组件 2 — 命令定位适配（执行层）★必做

Claude Code 运行时工作目录是用户当前项目目录（任意位置），而本技能所有
`npm run ...` 都必须在技能包根目录运行。

在 skill `SKILL.md` 的 *Self-Contained Skill Package* 段落增加**平台无关**的目录定位说明：

- Claude Code：技能目录为 `${CLAUDE_SKILL_DIR}`。
- Codex：`$CODEX_HOME/skills/text2html-image` 或仓库内 `skills/text2html-image`。
- 运行任何 `npm run ...` 之前，先 `cd` 到该技能目录。

命令块本身保持 `npm run ...` 不变（相对技能目录）。示例说明写法：
```bash
# Claude Code: cd "$CLAUDE_SKILL_DIR" first
# Codex / repo: cd skills/text2html-image first
npm test
npm run build -- --project <project-id>
```

### 组件 3 — 平台中立化措辞（内容层，英文）

共约 16 处，**语义不变**，仅替换平台专属名词为跨平台英文措辞。术语映射：

| 原措辞 | 中立化后（英文） |
| --- | --- |
| `Codex Browser` | `the browser preview` / `your browser tool` |
| `刷新当前 Codex Browser 页面` | `refresh the browser preview` |
| `Open ... in Codex Browser` | `Open ... in your browser tool` |
| `多模态读取 in Codex` / `happens in Codex` | `your multimodal image reading` |
| `Probe the current Codex session` | `Probe the current agent/browser session` |
| `Codex Browser annotation` | `browser annotation` |
| `Codex Browser APIs` | `browser-native APIs` |

分布：
- `skills/text2html-image/SKILL.md`：约 12 处（Operating Flow、抄图复刻流程 Loop、Browser/multimodal boundary、Final Preview Links 段）。
- `skills/text2html-image/references/execution-flow.md`：1 处。
- `skills/text2html-image/references/stage-guides.md`：3 处。

根 `SKILL.md` 的 `CODEX_HOME` 安装段：改为并列 **Codex** 与 **Claude Code** 两种安装方式（Claude Code 段给出 `npm run install:claude` 与手动 `ln -sfn` 兜底）。

`agents/openai.yaml`：保留不动（Codex 专属接口文件，不影响 Claude Code）。

### 组件 4 — frontmatter 合规与增强

skill `SKILL.md` 现有 frontmatter：
```yaml
---
name: text2html-image
description: Use when generating, validating, localizing, or exporting editable ecommerce poster/ad images with repo-root HTML/CSS templates, project workspaces, browser screenshots, and multilingual variants.
---
```
- 已合规（有 `name` + `description`，约 200 字符 < 1536）。
- 新增 `when_to_use` 增强自动触发（与 `description` 合计仍需 < 1536 字符）。示例：
  ```yaml
  when_to_use: When the user wants to create, recreate, edit, localize, layer, QC, or export an editable poster/banner/ad image from text, a reference image, or an existing HTML template — keeping text/price/CTA as real editable DOM.
  ```

## 5. 文件级改动清单

| 文件 | 改动 |
| --- | --- |
| `skills/text2html-image/scripts/install-skill.js` | 新建：双平台（claude/codex/all）幂等符号链接安装脚本 |
| `skills/text2html-image/package.json` | 增加 `install`、`install:claude`、`install:codex` 脚本 |
| `skills/text2html-image/SKILL.md` | 加 `when_to_use`；Self-Contained 段加双平台目录定位说明；12 处术语中立化 |
| `skills/text2html-image/references/execution-flow.md` | 1 处术语中立化 |
| `skills/text2html-image/references/stage-guides.md` | 3 处术语中立化 |
| `SKILL.md`（根） | 安装段并列 Codex + Claude Code；措辞中立化 |
| `AGENTS.md` | Build/Test 段并列两个平台的技能目录定位说明（保持文档一致） |

## 6. 验证

1. 运行 `npm run install:all`，确认 Claude Code 与 Codex 两个目标都输出成功。
2. `ls -l ~/.claude/skills/text2html-image` 与 `ls -l "${CODEX_HOME:-$HOME/.codex}/skills/text2html-image"` 都确认为指向仓库的符号链接。
3. `cat ~/.claude/skills/text2html-image/SKILL.md` 确认经符号链接可读到真实 SKILL.md。
4. `cd ~/.claude/skills/text2html-image && npm test` 通过（经符号链接执行命令正常）。
5. node 解析两份 `SKILL.md` frontmatter，校验 `description`+`when_to_use` < 1536 字符、YAML 合法。
6. grep 确认技能正文（skill SKILL.md + references）不再残留 `Codex Browser` / `CODEX_HOME`（根 SKILL.md 安装段除外，其对称保留 Codex 与 Claude Code 两种选项）。
7. 幂等性：再次运行 `npm run install:all` 不报错、结果一致。
8. 安全性：手动构造某个目标为真实目录时，脚本应对该目标报错而非删除，且不影响另一个目标。
9. 分平台：`npm run install:claude` 与 `npm run install:codex` 各自只创建对应平台的符号链接。

## 7. 风险与已知限制

- **斜杠菜单刷新**：当前正在运行的 Claude Code 会话可能需重启才会显示新技能。完成时明确告知用户。
- **符号链接迁移**：个人全局符号链接用绝对路径，仓库移动位置后需重新运行 `npm run install:claude`。
- **共用一份 SKILL.md**：术语中立化会同时影响 Codex；已通过"通用措辞"保证 Codex 语义不退化。
- **Windows**：`fs.symlinkSync(..., 'dir')` 在 Windows 可能需要权限；本次目标环境为 macOS，Windows 支持列为后续。
