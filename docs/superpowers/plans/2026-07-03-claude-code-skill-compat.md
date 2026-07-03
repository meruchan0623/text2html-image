# Claude Code / Codex 双平台技能兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `text2html-image` 技能能在 Claude Code (`/text2html-image`) 与 Codex (`$text2html-image`) 两个编程 Agent 中被对称地发现、安装并正确运行。

**Architecture:** 用一个幂等的双平台安装脚本创建符号链接（Claude Code `~/.claude/skills/`、Codex `${CODEX_HOME:-~/.codex}/skills/`），两个平台跟随符号链接共用同一份 `SKILL.md`；在技能正文加入平台无关的"技能目录定位"说明并把 Codex 专属术语中立化为跨平台英文措辞，使两个平台调用体验对等。

**Tech Stack:** Node.js（仅内置 `fs`/`os`/`path`，无第三方依赖）；现有自定义测试 harness `scripts/test.js`（`assert()` + `execFileSync` 端到端断言）。

## Global Constraints

- 所有命令从 `skills/text2html-image/` 运行；下文相对路径均以该目录为根。
- 安装脚本只用 Node 内置模块，**不新增任何 npm 依赖**。
- 符号链接用**绝对路径**：`SKILL_DIR = path.resolve(__dirname, '..')`。
- 命令名 = 技能目录名 `text2html-image`；**不改目录名**。
- frontmatter `description` + `when_to_use` 合计 **< 1536 字符**。
- 术语中立化统一用**英文**跨平台措辞；语义不得改变。
- 安全铁律：安装目标是**真实目录/文件（非符号链接）时报错退出、绝不删除**；符号链接（含失效）才可覆盖。
- 不改动 `scripts/*.js` 的渲染/导出/构建核心逻辑；不改动 `agents/openai.yaml`。（实现时应用户"彻底中立化"决策，额外中立化了 build.js/workflow-core.js 的平台输出文本与 build-report.json 字段名 `codex_browser_hint`→`browser_hint`、`codex_annotation_capability`→`annotation_capability`，并同步 test.js 契约断言。）
- npm 主安装命令用 `install:all`（非保留名），避免裸 `install` 劫持 `npm install` 生命周期。
- **提交规则**：本仓库仅在用户明确要求时提交 git。计划中的 commit 步骤在执行阶段需先向用户确认。

---

### Task 1: 双平台安装脚本 `install-skill.js`

**Files:**
- Create: `skills/text2html-image/scripts/install-skill.js`
- Modify: `skills/text2html-image/scripts/test.js`（在末尾 `console.log('Tests passed...')` 之前插入测试块）
- Modify: `skills/text2html-image/package.json`（新增 3 个 npm 脚本）

**Interfaces:**
- Produces（`module.exports`）：
  - `resolveTargets({ target, claudeDir, codexDir, env, homedir }) -> Array<{ platform: 'claude'|'codex', linkPath: string }>`（纯函数）
  - `classifyTarget(linkPath) -> 'missing'|'symlink'|'real'`
  - `installOne(linkPath) -> 'created'|'replaced'`（真实目录时 throw）
  - `parseArgs(argv) -> { target, claudeDir, codexDir }`
  - `SKILL_DIR: string`, `SKILL_NAME: 'text2html-image'`
- CLI：`node scripts/install-skill.js [--target claude|codex|all] [--claude-dir <path>] [--codex-dir <path>]`，默认 `--target all`。`--claude-dir`/`--codex-dir` 覆盖各平台 skills 根目录（供测试与高级用户使用）。

- [ ] **Step 1: 写失败测试**（插入到 `scripts/test.js` 最后一行 `console.log(\`Tests passed...\`)` 之前）

```js
// --- install-skill.js: 双平台符号链接安装 ---
const installSkill = require('./install-skill');
const osModule = require('os');

// 单元：resolveTargets 路径解析（纯函数，不碰真实 HOME）
{
  const targets = installSkill.resolveTargets({
    target: 'all',
    env: { CODEX_HOME: '/tmp/fake-codex' },
    homedir: '/tmp/fake-home',
  });
  assert(targets.length === 2, 'resolveTargets all should return two targets');
  const claude = targets.find((t) => t.platform === 'claude');
  const codex = targets.find((t) => t.platform === 'codex');
  assert(
    claude.linkPath === path.join('/tmp/fake-home', '.claude', 'skills', 'text2html-image'),
    'claude link path defaults under ~/.claude/skills'
  );
  assert(
    codex.linkPath === path.join('/tmp/fake-codex', 'skills', 'text2html-image'),
    'codex link path honors CODEX_HOME'
  );
  const onlyClaude = installSkill.resolveTargets({ target: 'claude', homedir: '/tmp/fake-home' });
  assert(onlyClaude.length === 1 && onlyClaude[0].platform === 'claude', 'target=claude filters to one target');
  const codexDefault = installSkill.resolveTargets({ target: 'codex', env: {}, homedir: '/tmp/fake-home' });
  assert(
    codexDefault[0].linkPath === path.join('/tmp/fake-home', '.codex', 'skills', 'text2html-image'),
    'codex falls back to ~/.codex when CODEX_HOME unset'
  );
}

// 端到端：创建 / 幂等 / 真实目录报错（用临时目录，不污染真实 HOME）
{
  const tmpBase = fs.mkdtempSync(path.join(osModule.tmpdir(), 't2h-install-'));
  const claudeDir = path.join(tmpBase, '.claude', 'skills');
  const codexDir = path.join(tmpBase, '.codex', 'skills');
  const claudeLink = path.join(claudeDir, 'text2html-image');
  const codexLink = path.join(codexDir, 'text2html-image');
  const runInstall = (extraArgs) =>
    require('child_process').execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'install-skill.js'), '--claude-dir', claudeDir, '--codex-dir', codexDir, ...extraArgs],
      { cwd: ROOT, encoding: 'utf8' }
    );

  runInstall(['--target', 'all']);
  assert(fs.lstatSync(claudeLink).isSymbolicLink(), 'claude symlink created');
  assert(fs.lstatSync(codexLink).isSymbolicLink(), 'codex symlink created');
  assert(fs.realpathSync(claudeLink) === fs.realpathSync(ROOT), 'claude symlink points to skill dir');
  assert(fs.existsSync(path.join(claudeLink, 'SKILL.md')), 'SKILL.md is readable through the symlink');

  // 幂等：再次运行不报错，仍是符号链接
  runInstall(['--target', 'all']);
  assert(fs.lstatSync(claudeLink).isSymbolicLink(), 'idempotent re-run keeps the symlink');

  // 安全：目标是真实目录时必须报错且不删除
  fs.unlinkSync(claudeLink);
  fs.mkdirSync(claudeLink, { recursive: true });
  fs.writeFileSync(path.join(claudeLink, 'keep.txt'), 'real-data');
  let threw = false;
  try {
    runInstall(['--target', 'claude']);
  } catch (e) {
    threw = true;
    assert(/Refusing to overwrite real path/.test(String(e.stdout) + String(e.stderr)), 'error explains refusal');
  }
  assert(threw, 'install exits non-zero when target is a real directory');
  assert(fs.existsSync(path.join(claudeLink, 'keep.txt')), 'real directory must NOT be deleted');

  fs.rmSync(tmpBase, { recursive: true, force: true });
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL，报错类似 `Cannot find module './install-skill'`。

- [ ] **Step 3: 创建 `scripts/install-skill.js`**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const SKILL_NAME = 'text2html-image';

// 纯函数：解析每个平台的符号链接目标路径
function resolveTargets({ target = 'all', claudeDir, codexDir, env = {}, homedir } = {}) {
  const home = homedir || os.homedir();
  const claudeRoot = claudeDir || path.join(home, '.claude', 'skills');
  const codexRoot = codexDir || path.join(env.CODEX_HOME || path.join(home, '.codex'), 'skills');
  const all = [
    { platform: 'claude', linkPath: path.join(claudeRoot, SKILL_NAME) },
    { platform: 'codex', linkPath: path.join(codexRoot, SKILL_NAME) },
  ];
  if (target === 'all') return all;
  return all.filter((t) => t.platform === target);
}

// 判定目标现状（碰 fs）
function classifyTarget(linkPath) {
  let stat;
  try {
    stat = fs.lstatSync(linkPath);
  } catch (_e) {
    return 'missing';
  }
  return stat.isSymbolicLink() ? 'symlink' : 'real';
}

// 幂等安装单个目标；真实目录/文件时抛错，绝不删除
function installOne(linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const kind = classifyTarget(linkPath);
  if (kind === 'real') {
    throw new Error(
      `Refusing to overwrite real path (not a symlink): ${linkPath}. Remove or rename it manually, then re-run.`
    );
  }
  if (kind === 'symlink') {
    fs.unlinkSync(linkPath);
  }
  fs.symlinkSync(SKILL_DIR, linkPath, 'dir');
  return kind === 'symlink' ? 'replaced' : 'created';
}

function parseArgs(argv) {
  const args = { target: 'all', claudeDir: undefined, codexDir: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--target') args.target = argv[i + 1];
    else if (a === '--claude-dir') args.claudeDir = argv[i + 1];
    else if (a === '--codex-dir') args.codexDir = argv[i + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['all', 'claude', 'codex'].includes(args.target)) {
    console.error(`Invalid --target "${args.target}". Use claude | codex | all.`);
    process.exit(2);
  }
  const targets = resolveTargets({
    target: args.target,
    claudeDir: args.claudeDir,
    codexDir: args.codexDir,
    env: process.env,
  });
  let failures = 0;
  for (const t of targets) {
    try {
      const action = installOne(t.linkPath);
      console.log(`[${t.platform}] ${action}: ${t.linkPath} -> ${SKILL_DIR}`);
    } catch (e) {
      failures += 1;
      console.error(`[${t.platform}] FAILED: ${e.message}`);
    }
  }
  console.log(
    failures === 0
      ? 'Skill install complete. Restart Claude Code if the /text2html-image command does not appear yet.'
      : `Skill install finished with ${failures} failure(s).`
  );
  process.exit(failures === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { resolveTargets, classifyTarget, installOne, parseArgs, SKILL_DIR, SKILL_NAME };
```

- [ ] **Step 4: 在 `package.json` 的 `scripts` 中新增 3 个脚本**

在现有 `"test": "node scripts/test.js"` 同级加入：

```json
"install:all": "node scripts/install-skill.js",
"install:claude": "node scripts/install-skill.js --target claude",
"install:codex": "node scripts/install-skill.js --target codex"
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`
Expected: PASS，结尾打印 `Tests passed. ...`。

- [ ] **Step 6: 提交（执行阶段先向用户确认是否提交）**

```bash
git add scripts/install-skill.js scripts/test.js package.json
git commit -m "feat: add dual-platform (Claude Code + Codex) skill install script"
```

---

### Task 2: skill `SKILL.md` — frontmatter、目录定位、术语中立化

**Files:**
- Modify: `skills/text2html-image/SKILL.md`

**Interfaces:**
- Consumes: Task 1 的 `npm run install:all` / `install:claude` / `install:codex`（在正文中引用）。
- Produces: 无代码接口；产出 Claude Code 可正确加载并可执行的技能正文。

- [ ] **Step 1: frontmatter 增加 `when_to_use`**

把现有 frontmatter：

```yaml
---
name: text2html-image
description: Use when generating, validating, localizing, or exporting editable ecommerce poster/ad images with repo-root HTML/CSS templates, project workspaces, browser screenshots, and multilingual variants.
---
```

替换为：

```yaml
---
name: text2html-image
description: Use when generating, validating, localizing, or exporting editable ecommerce poster/ad images with repo-root HTML/CSS templates, project workspaces, browser screenshots, and multilingual variants.
when_to_use: When the user wants to create, recreate, edit, localize, layer, QC, or export an editable poster/banner/ad image from text, a reference image, or an existing HTML/CSS template — keeping text, price, CTA, labels, and legal copy as real editable DOM rather than baked-in pixels.
---
```

- [ ] **Step 2: 在 *Self-Contained Skill Package* 段的命令块后加入双平台目录定位说明**

在该段的 ```` ```bash ... npm run build -- --project <project-id> ... ``` ```` 代码块之后插入：

```markdown
Locate this skill directory before running commands (the runtime working directory is usually the caller's project, not this package):

- Claude Code: the skill directory is `${CLAUDE_SKILL_DIR}` — run `cd "$CLAUDE_SKILL_DIR"` first.
- Codex: the skill directory is `$CODEX_HOME/skills/text2html-image` (or the repo path `skills/text2html-image`) — `cd` there first.
- Any other agent: `cd` into the directory that contains this `SKILL.md`.

Install as a discoverable skill for both agents with `npm run install:all` (or `npm run install:claude` / `npm run install:codex`).
```

- [ ] **Step 3: 术语中立化（用 Edit 逐处精确替换，语义不变）**

依次替换以下各处（`old` → `new`，语义不变）：

1. `open the generated `file://.../html/index*.html` (single-group) or `file://.../html/<html-group>/index*.html` (multi-group) in Codex Browser` → `... in your browser tool`
2. `If the preview is already open, 刷新当前 Codex Browser 页面 after rebuilding.` → `If the preview is already open, refresh the browser preview after rebuilding.`
3. `Keep the Codex Browser preview open until the image is accepted` → `Keep the browser preview open until the image is accepted`
4. `Open the generated preview in Codex Browser via the `file_url` printed by `npm run build`.` → `Open the generated preview in your browser tool via the `file_url` printed by `npm run build`.`
5. `If the preview is already open from an earlier round, 刷新当前 Codex Browser 页面 after rebuilding instead of opening a new debugging surface.` → `If the preview is already open from an earlier round, refresh the browser preview after rebuilding instead of opening a new debugging surface.`
6. `Codex Browser performs visual opening, screenshots, and real layout inspection.` → `Your browser tool performs visual opening, screenshots, and real layout inspection.`
7. `多模态读取 happens in Codex against the saved browser screenshot; do not hard-code Codex Browser APIs inside repo scripts.` → `Multimodal image reading happens against the saved browser screenshot; do not hard-code any browser-native APIs inside repo scripts.`
8. `Reuse the generated `file_url` and 刷新当前 Codex Browser 页面 between rebuilds.` → `Reuse the generated `file_url` and refresh the browser preview between rebuilds.`
9. `If Codex Browser cannot open `file://` because of browser policy, use static DOM checks plus Playwright or system screenshot fallback.` → `If the browser tool cannot open `file://` because of browser policy, use static DOM checks plus Playwright or system screenshot fallback.`
10. `` `file_url`: `file://` URL for Codex Browser or another local browser surface. `` → `` `file_url`: `file://` URL for your browser tool or another local browser surface. ``
11. `Codex Browser annotation capability is optional. Probe the current Codex session before using browser-native element annotation, for example by checking whether an annotation screenshot command is exposed and succeeds. Do not claim Codex Browser annotation was used unless the current session probe succeeds.` → `Browser annotation capability is optional. Probe the current agent/browser session before using browser-native element annotation, for example by checking whether an annotation screenshot command is exposed and succeeds. Do not claim browser annotation was used unless the current session probe succeeds.`

（注：也顺带覆盖 Operating Flow 第 9 步内出现的同样 `Codex Browser` / `刷新当前 Codex Browser 页面`，用相同映射；见下一步 grep 兜底。）

- [ ] **Step 4: grep 校验残留并核对 frontmatter 字符数**

Run:
```bash
grep -nE "Codex Browser|刷新当前 Codex Browser|多模态读取 happens in Codex|CODEX_HOME" SKILL.md
node -e "const t=require('fs').readFileSync('SKILL.md','utf8').split('---')[1]; const d=t.match(/description:.*/s); console.log('frontmatter block chars:', t.length)"
```
Expected: 第一条 grep **无输出**（Codex 专属术语已清空）；frontmatter block 字符数远小于 1536。

- [ ] **Step 5: 提交（执行阶段先向用户确认是否提交）**

```bash
git add SKILL.md
git commit -m "docs: neutralize Codex-only terms and add dual-platform skill-dir locator in SKILL.md"
```

---

### Task 3: references 术语中立化

**Files:**
- Modify: `skills/text2html-image/references/execution-flow.md`
- Modify: `skills/text2html-image/references/stage-guides.md`

**Interfaces:**
- Consumes: 无。 Produces: 无代码接口；产出跨平台一致的参考文档。

- [ ] **Step 1: `references/execution-flow.md` 第 183 行替换**

`old`:
```markdown
- Codex Browser annotation use is either probe-confirmed or explicitly replaced by screenshot/DOM/coordinate evidence.
```
`new`:
```markdown
- Browser annotation use is either probe-confirmed or explicitly replaced by screenshot/DOM/coordinate evidence.
```

- [ ] **Step 2: `references/stage-guides.md` 三处替换**

第 18 行 `old`:
```markdown
- Treat ChatGPT Images 2 / Codex image generation prompts as `prompt_only` until real PNG outputs are supplied.
```
`new`（保留举例，泛化为外部图像模型）:
```markdown
- Treat external image-generation prompts (e.g. ChatGPT Images, Codex image generation) as `prompt_only` until real PNG outputs are supplied.
```

第 141 行 `old`:
```markdown
- `npm run build` writes `reports/preview-links.md` with Markdown `file://` links, `Local HTML file path` entries, and Codex Browser reopening hints. Keep this report with the final evidence and include both the active HTML Markdown link and the plain local HTML file path in the final response.
```
`new`:
```markdown
- `npm run build` writes `reports/preview-links.md` with Markdown `file://` links, `Local HTML file path` entries, and browser reopening hints. Keep this report with the final evidence and include both the active HTML Markdown link and the plain local HTML file path in the final response.
```

第 142 行 `old`:
```markdown
- Browser-native annotation is optional and session-dependent. Probe the current Codex Browser before relying on element/circle annotation; otherwise use ordinary screenshots, DOM snapshots, and coordinate notes.
```
`new`:
```markdown
- Browser-native annotation is optional and session-dependent. Probe the current browser tool before relying on element/circle annotation; otherwise use ordinary screenshots, DOM snapshots, and coordinate notes.
```

- [ ] **Step 3: grep 校验残留**

Run:
```bash
grep -rnE "Codex Browser" references/
```
Expected: **无输出**。

- [ ] **Step 4: 提交（执行阶段先向用户确认是否提交）**

```bash
git add references/execution-flow.md references/stage-guides.md
git commit -m "docs: neutralize Codex-only terms in references"
```

---

### Task 4: 根 `SKILL.md` 与 `AGENTS.md` — 双平台对称安装/使用文档

**Files:**
- Modify: `SKILL.md`（仓库根）
- Modify: `AGENTS.md`（仓库根）

**Interfaces:**
- Consumes: Task 1 的 npm 安装脚本。 Produces: 面向人类的对称安装文档。

- [ ] **Step 1: 根 `SKILL.md` 安装段改为双平台对称**

把现有：
```markdown
For global Codex discovery, install it as:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -sfn "$(pwd)/skills/text2html-image" "${CODEX_HOME:-$HOME/.codex}/skills/text2html-image"
```
```
替换为：
```markdown
## Install as a discoverable skill (Claude Code + Codex)

Install for both coding agents at once (creates symlinks into each agent's skills directory):

```bash
cd skills/text2html-image
npm run install:all          # Claude Code + Codex
# or one platform only:
npm run install:claude   # ~/.claude/skills/text2html-image        -> /text2html-image
npm run install:codex    # ${CODEX_HOME:-$HOME/.codex}/skills/text2html-image
```

Manual fallback (equivalent symlinks):

```bash
# Claude Code
mkdir -p ~/.claude/skills
ln -sfn "$(pwd)/skills/text2html-image" ~/.claude/skills/text2html-image

# Codex
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -sfn "$(pwd)/skills/text2html-image" "${CODEX_HOME:-$HOME/.codex}/skills/text2html-image"
```
```

- [ ] **Step 2: `AGENTS.md` 的 Build/Test 段补双平台定位说明**

在 `AGENTS.md` 中 "Run commands from `skills/text2html-image/`:" 这一行之后（其代码块之前）插入一段：

```markdown
Install the skill so each agent can discover it: `npm run install:all` (Claude Code + Codex), or `npm run install:claude` / `npm run install:codex`. In Claude Code the skill directory is `${CLAUDE_SKILL_DIR}`; in Codex it is `$CODEX_HOME/skills/text2html-image`. `cd` into that directory before running the commands below.
```

- [ ] **Step 3: 校验**

Run:
```bash
grep -nE "npm run install:all|CLAUDE_SKILL_DIR|CODEX_HOME" SKILL.md AGENTS.md
```
Expected: 根 `SKILL.md` 与 `AGENTS.md` 都出现 Claude Code 与 Codex 两平台的安装/定位说明。

- [ ] **Step 4: 提交（执行阶段先向用户确认是否提交）**

```bash
git add SKILL.md AGENTS.md
git commit -m "docs: document symmetric Claude Code + Codex skill install"
```

---

### Task 5: 全量集成验证

**Files:**
- 无（只运行验证命令）。

**Interfaces:**
- Consumes: Task 1–4 的全部产物。 Produces: 通过/失败的验证结论。

- [ ] **Step 1: 单元 + 端到端测试全绿**

Run: `npm test`
Expected: PASS，含新加的 install-skill 断言。

- [ ] **Step 2: 真实安装到本机两个平台**

Run: `npm run install:all`
Expected: 打印 `[claude] created/replaced: ...` 与 `[codex] created/replaced: ...`，末尾 `Skill install complete...`。

- [ ] **Step 3: 确认两个符号链接指向仓库技能目录**

Run:
```bash
ls -l ~/.claude/skills/text2html-image
ls -l "${CODEX_HOME:-$HOME/.codex}/skills/text2html-image"
cat ~/.claude/skills/text2html-image/SKILL.md | head -5
```
Expected: 两处均为指向 `<repo>/skills/text2html-image` 的符号链接；`cat` 能读到真实 frontmatter。

- [ ] **Step 4: 经符号链接执行命令正常**

Run: `cd ~/.claude/skills/text2html-image && npm test`
Expected: PASS。

- [ ] **Step 5: 术语残留与幂等性终检**

Run:
```bash
cd - >/dev/null
grep -rnE "Codex Browser" skills/text2html-image/SKILL.md skills/text2html-image/references/ ; echo "exit=$?"
cd skills/text2html-image && npm run install:all   # 二次运行验证幂等
```
Expected: grep 无匹配（`exit=1`）；二次安装无报错、结果一致。

- [ ] **Step 6: 告知用户重启提示**

在最终回复中提醒：当前正在运行的 Claude Code 会话可能需**重启**才会在斜杠菜单出现 `/text2html-image`。

---

## Self-Review

**Spec coverage：**
- 组件1（双平台安装）→ Task 1 + Task 4（文档）+ Task 5（真实安装验证）✅
- 组件2（命令定位适配）→ Task 2 Step 2 + Task 4 Step 2 ✅
- 组件3（术语中立化）→ Task 2 Step 3 + Task 3 ✅
- 组件4（frontmatter 合规 + when_to_use）→ Task 2 Step 1/Step 4 ✅
- spec §6 验证清单 → Task 5 全覆盖（符号链接、经链接 npm test、frontmatter 字符、grep 残留、幂等、安全）✅
- 安全策略（真实目录报错不删）→ Task 1 测试 + `installOne` 实现 ✅

**Placeholder scan：** 无 TBD/TODO；install-skill.js 与测试代码完整；每处术语替换给出精确 old→new。✅

**Type consistency：** `resolveTargets`/`classifyTarget`/`installOne`/`parseArgs` 在导出、测试、主流程中签名一致；npm 脚本名 `install`/`install:claude`/`install:codex` 在 Task 1/2/4/5 中一致；符号链接目标路径公式在脚本与测试中一致。✅
