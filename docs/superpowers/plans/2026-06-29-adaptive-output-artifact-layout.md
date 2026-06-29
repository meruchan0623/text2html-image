# Adaptive Output Artifact Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `text2html-image` 的项目产物目录规范调整为“稳定入口 + 按需分组 + 可裁剪运行记录”，让单组项目保持浅层，复杂迭代项目保留必要证据，同时避免过程文件和测试样例污染真实交付目录。

**Architecture:** 本计划限定为目录结构和命名规范的文档级落地，不改 runtime 写入逻辑，不迁移旧产物，不删除历史文件。先更新 canonical skill 文档中的 Project Workspace 合同，再同步 execution/stage reference 中的报告、导出和 runs 规则，最后用现有 `scripts/test.js` 的文档合同断言锁住关键短语，避免后续维护把规则改回固定七目录或 report-only 误写。

**Tech Stack:** Markdown, Node.js CommonJS test runner, existing `npm test`, existing `text2html-image` skill package.

---

## Assumptions

- 本计划执行时仍保持用户选择的 A 范围：只实现目录结构和命名规范文档，不改 `workflow-core.js`、`build.js`、`render-fast.js`、`batch-export.js` 等 runtime 脚本。
- 当前真实 workspace 根路径仍是用户文稿目录下的 `text2html-image-project`；`/Users/tashima_meru/Documents` 在本机是指向 OneDrive 文稿目录的 symlink，因此计划不引入第二个根路径。
- 现有项目目录中已经存在历史混合产物，例如测试项目、smoke 项目、多组 `html_group`、多轮截图和导出；本计划只定义后续规范，不做旧目录自动迁移。
- 当前仓库已有未跟踪文件 `docs/superpowers/plans/2026-06-25-transparent-layer-generation.md`，执行本计划时不要修改、删除、格式化或纳入无关提交。
- 少量报告不应为了“规范感”被强制放入 `reports/`；只有报告数量、类型或生命周期复杂到需要集合管理时，才创建报告目录。

## First Principles

目录结构按资产生命周期设计，不按脚本阶段机械建目录。

1. **不可丢输入优先清楚**：参考图、二维码、原始裁剪、外部素材必须容易找到，默认放入 `source/`。
2. **可编辑源产物是主入口**：HTML/CSS/SVG 是后续修改的权威入口，默认放入 `html/`，单组项目不再套一层 `<html-group>/`。
3. **最终交付和过程证据分离**：用户拿走的 PNG/HTML 包属于 `exports/`；截图、评分、DOM 审计、切图调试属于过程证据。
4. **目录只在有分组价值时出现**：只有一个 summary 文件就放根目录；只有一组 HTML 就直接放在 `html/`；只有一组导出就直接放在 `exports/`。
5. **过程证据默认可覆盖**：普通迭代进入 `runs/latest/`，仅在用户确认、交付前、踩坑复用或需要审计时提升为命名 run。
6. **空间占用可控**：不为每个视觉微调保留完整截图、PNG、mask 和报告；保留的 run 必须有明确价值。

## Target Directory Contract

### 单组轻量项目

```text
<workspace-root>/<project-id>/
├── source/
├── html/
│   ├── index.html
│   ├── index.en-us.html
│   └── master.css
├── exports/
│   ├── index.png
│   └── index.en-us.png
└── project-summary.json
```

Use this when one project has one page/master group and only a small stable summary.

### 多组项目

```text
<workspace-root>/<project-id>/
├── source/
├── html/
│   ├── query/
│   │   ├── index.html
│   │   └── master.css
│   └── app-install/
│       ├── index.html
│       └── master.css
├── exports/
│   ├── query/
│   └── app-install/
└── project-summary.json
```

Use this only when multiple page/master groups must coexist under one project.

### 复杂迭代项目

```text
<workspace-root>/<project-id>/
├── source/
├── html/
├── exports/
├── project-summary.json
└── runs/
    ├── latest/
    │   ├── working/
    │   ├── screenshots/
    │   ├── scores/
    │   └── reports/
    ├── 2026-06-29-r01-layout/
    └── 2026-06-29-r02-i18n/
```

Use this when the project needs repeat visual scoring, browser screenshots, flood-cutout diagnostics, export audits, or handoff evidence.

## Directory Creation Rules

- One summary file: write `project-summary.json` at project root.
- Three or more stable summary/report files: create `reports/`.
- One HTML group: write files directly under `html/`.
- Two or more HTML groups: write each group under `html/<group>/`.
- One export group: write files directly under `exports/`.
- Two or more export groups or delivery packs: write each under `exports/<delivery-id>/` or `exports/<group>/`.
- Ordinary iteration evidence: write or update `runs/latest/`.
- Accepted milestone, delivery checkpoint, or reusable failure evidence: promote `runs/latest/` to `runs/YYYY-MM-DD-rNN-<reason>/`.
- Temporary browser/MCP screenshots that are not part of acceptance evidence: keep in `runs/latest/working/` and do not promote.

## Run Retention Policy

永久保留 run 的条件必须明确，避免空间爆炸。

Keep a named run only when one of these is true:

- The user accepted that round visually.
- The run was used for final delivery/export.
- The run documents a reusable failure, such as path breakage, text overflow, alpha/matte pollution, QR loss, unsupported CSS, or language-specific layout regression.
- The run contains a before/after proof needed for later audit.

Everything else remains overwriteable under `runs/latest/`.

## File Structure

- Modify: `skills/text2html-image/SKILL.md`
  - Replace the fixed Project Workspace tree with the adaptive layout contract.
  - Add the directory creation rules and run retention policy.
  - Clarify that this is the preferred future output contract, while existing historical projects may keep legacy layout.
- Modify: `skills/text2html-image/references/execution-flow.md`
  - Route complex process evidence to `runs/latest/` or named runs.
  - Keep stable delivery and source paths shallow.
  - Align report-only export wording with current `reports/export-report.json` behavior.
- Modify: `skills/text2html-image/references/stage-guides.md`
  - Replace stale `exports/export-manifest.json` wording with `reports/export-report.json`.
  - Add “single group stays shallow, multi group gets subdirectories” guidance for multilingual and export stages.
- Modify: `skills/text2html-image/scripts/test.js`
  - Add documentation contract assertions only. Do not add runtime behavior or filesystem migration.
- Create: `docs/superpowers/plans/2026-06-29-adaptive-output-artifact-layout.md`
  - Preserve this implementation plan.

## Task 1: Lock Current Scope And Evidence

**Files:**
- Read: `skills/text2html-image/SKILL.md`
- Read: `skills/text2html-image/references/execution-flow.md`
- Read: `skills/text2html-image/references/stage-guides.md`
- Read: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Confirm current git state**

Run:

```bash
git -C /Users/tashima_meru/Develop/text2html-image status --short --branch
```

Expected:

```text
## main...origin/main
?? docs/superpowers/plans/2026-06-25-transparent-layer-generation.md
?? docs/superpowers/plans/2026-06-29-adaptive-output-artifact-layout.md
```

If additional files appear, classify them before editing and do not revert unrelated user changes.

- [ ] **Step 2: Re-read the current Project Workspace section**

Run:

```bash
rg -n "## Project Workspace|## HTML Grouping|## Completion Contract|## Stop Conditions" /Users/tashima_meru/Develop/text2html-image/skills/text2html-image/SKILL.md
```

Expected: line numbers for the existing sections that will be edited.

- [ ] **Step 3: Re-read stale export wording**

Run:

```bash
rg -n "export-manifest|export-report|reports/export-report|exports/export" /Users/tashima_meru/Develop/text2html-image/skills/text2html-image/references
```

Expected: `execution-flow.md` already names `reports/export-report.json`; `stage-guides.md` still contains stale `exports/export-manifest.json` wording that must be corrected.

## Task 2: Update The Canonical Workspace Contract

**Files:**
- Modify: `skills/text2html-image/SKILL.md`

- [ ] **Step 1: Replace the fixed seven-directory tree**

In `skills/text2html-image/SKILL.md`, replace the current fixed tree under `## Project Workspace` with this text:

````markdown
Runtime files live outside the repo in the current user's Documents folder. The preferred future layout is adaptive: keep stable project entrypoints shallow, add subdirectories only when there is more than one group or when process evidence must be retained.

For a single-group project:

```text
<Documents>/text2html-image-project/<project-id>/
├── source/
├── html/
│   ├── index.html
│   ├── index.<lang>.html
│   └── master.css
├── exports/
│   └── index.png
└── project-summary.json
```

For a multi-group project:

```text
<Documents>/text2html-image-project/<project-id>/
├── source/
├── html/<html-group>/
├── exports/<delivery-id-or-group>/
└── project-summary.json
```

For complex iteration, add process evidence under `runs/`:

```text
<Documents>/text2html-image-project/<project-id>/
└── runs/
    ├── latest/
    │   ├── working/
    │   ├── screenshots/
    │   ├── scores/
    │   └── reports/
    └── YYYY-MM-DD-rNN-<reason>/
```
````

- [ ] **Step 2: Add the on-demand directory rules**

Immediately after the adaptive tree, add:

```markdown
Directory creation rules:

- If there is only one stable summary file, keep it as `project-summary.json` at project root; do not create `reports/` for one file.
- If stable reports grow to three or more files, create `reports/` and keep report names specific.
- If there is only one HTML group, write `index.html`, localized `index.<lang>.html`, and `master.css` directly under `html/`.
- If there are two or more HTML groups, write them under `html/<html-group>/`.
- If there is only one export group, write PNG/WebP/JPG outputs directly under `exports/`.
- If there are two or more delivery groups, write them under `exports/<delivery-id-or-group>/`.
- Keep ordinary iteration evidence overwriteable under `runs/latest/`.
- Promote `runs/latest/` to `runs/YYYY-MM-DD-rNN-<reason>/` only for accepted milestones, final delivery checkpoints, or reusable failure evidence.
```

- [ ] **Step 3: Add the retention rule**

Add:

```markdown
Do not preserve every micro-iteration as a named run. Named runs should exist only when they support later review: user acceptance, delivery/export proof, reusable failure analysis, or before/after audit evidence. Temporary browser screenshots, MCP captures, mask experiments, and one-off work files should stay in `runs/latest/working/` unless they become part of that proof.
```

- [ ] **Step 4: Preserve legacy compatibility wording**

Add:

```markdown
Existing historical project folders may still use the older `source/`, `working/`, `html/`, `screenshots/`, `scores/`, `exports/`, `reports/` layout. Do not migrate or delete old folders unless the user explicitly requests a migration task.
```

## Task 3: Update Execution Flow Reference

**Files:**
- Modify: `skills/text2html-image/references/execution-flow.md`

- [ ] **Step 1: Update report path guidance**

In `## 7. Rework Prevention Reports`, replace the generic sentence before the list with:

```markdown
For complex poster edits, prefer structured evidence over prose. Stable project-level summaries can stay at project root as `project-summary.json` when they are the only report. Iteration-specific reports should go under `runs/latest/reports/` unless they are promoted to a named run. Create project-level `reports/` only when stable reports grow into a real report set.
```

- [ ] **Step 2: Split stable and run report examples**

Replace the current flat list with:

```markdown
Stable project-level examples:

- `project-summary.json`
- `delivery-audit.json`
- `reports/export-report.json`
- `reports/png-export-report.json`

Run-level examples:

- `runs/latest/reports/intake-report.json`
- `runs/latest/reports/html-patch-report.json`
- `runs/latest/reports/layout-impact-report.json`
- `runs/latest/reports/dom-contract-report.json`
- `runs/latest/reports/dom-editability-report.json`
- `runs/latest/reports/dom-editability-summary.md`
- `runs/latest/reports/locale-risk-report.json`
- `runs/latest/reports/render-profile-report.json`
```

- [ ] **Step 3: Add run promotion guidance**

After the report examples, add:

```markdown
Promote `runs/latest/` to a named run only when the evidence needs to survive: accepted visual milestone, final delivery, reusable failure, or before/after audit. Use names such as `2026-06-29-r01-layout`, `2026-06-29-r02-i18n`, or `2026-06-29-r03-export`.
```

## Task 4: Update Stage Guide Export And Grouping Rules

**Files:**
- Modify: `skills/text2html-image/references/stage-guides.md`

- [ ] **Step 1: Correct stale export-report wording**

Replace:

```markdown
Current export is manifest-only and writes project `exports/export-manifest.json`; real screenshot export must wait until final assets and browser rendering runtime are verified.
```

With:

```markdown
Current `npm run batch-export` is report-only and writes `reports/export-report.json`; it does not create PNG files. Real PNG files require `npm run export-fast` for supported render profiles or an explicit browser screenshot/export fallback.
```

- [ ] **Step 2: Add adaptive grouping bullets**

Under `## 6. 多语言化与批量导出`, add:

```markdown
- If a project has one HTML group, keep localized variants directly under `html/` as `index.html` and `index.<lang>.html`.
- If a project has multiple page/master groups, keep each group under `html/<html-group>/`.
- If a project has one export group, keep generated images directly under `exports/`.
- If a project has multiple export groups or delivery packs, keep each under `exports/<delivery-id-or-group>/`.
- Put iterative screenshots, score JSON, mask debug files, and temporary export diagnostics under `runs/latest/` unless the run is promoted for acceptance, delivery, or reusable failure evidence.
```

## Task 5: Add Documentation Contract Assertions

**Files:**
- Modify: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Add SKILL.md phrase assertions**

In the existing `skillBody` assertion block, add:

```js
assert(skillBody.includes('The preferred future layout is adaptive'), 'skill must document adaptive project layout');
assert(skillBody.includes('If there is only one HTML group'), 'skill must document single HTML group shallow layout');
assert(skillBody.includes('If there are two or more HTML groups'), 'skill must document multi HTML group layout');
assert(skillBody.includes('Keep ordinary iteration evidence overwriteable under `runs/latest/`'), 'skill must document overwriteable latest run evidence');
assert(skillBody.includes('Promote `runs/latest/` to `runs/YYYY-MM-DD-rNN-<reason>/`'), 'skill must document named run promotion');
assert(skillBody.includes('Existing historical project folders may still use the older'), 'skill must document legacy project compatibility');
```

- [ ] **Step 2: Add reference phrase assertions**

After reading `references/execution-flow.md`, add:

```js
assert(executionFlow.includes('Stable project-level examples'), 'execution flow must separate stable project reports');
assert(executionFlow.includes('Run-level examples'), 'execution flow must separate run-level reports');
assert(executionFlow.includes('Promote `runs/latest/` to a named run only when'), 'execution flow must document run promotion policy');
```

Read and assert `references/stage-guides.md`:

```js
const stageGuides = read('references/stage-guides.md');
assert(stageGuides.includes('reports/export-report.json'), 'stage guides must document current report-only export path');
assert(!stageGuides.includes('exports/export-manifest.json'), 'stage guides must not document stale export-manifest output');
assert(stageGuides.includes('If a project has one HTML group'), 'stage guides must document single group shallow output');
assert(stageGuides.includes('runs/latest/'), 'stage guides must document latest run evidence path');
```

## Task 6: Verify Documentation And Current Tests

**Files:**
- Read: `skills/text2html-image/SKILL.md`
- Read: `skills/text2html-image/references/execution-flow.md`
- Read: `skills/text2html-image/references/stage-guides.md`
- Read: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Check for stale export paths**

Run:

```bash
rg -n "exports/export-manifest|export-manifest.json" /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
```

Expected:

```text
```

No matches.

- [ ] **Step 2: Check adaptive layout wording**

Run:

```bash
rg -n "preferred future layout is adaptive|runs/latest|YYYY-MM-DD-rNN|If there is only one HTML group|If there are two or more HTML groups" /Users/tashima_meru/Develop/text2html-image/skills/text2html-image/SKILL.md /Users/tashima_meru/Develop/text2html-image/skills/text2html-image/references
```

Expected: matches in `SKILL.md`, `references/execution-flow.md`, and `references/stage-guides.md`.

- [ ] **Step 3: Run the package contract test**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected healthy result:

```text
Tests passed.
```

If this command writes test artifacts into the real `text2html-image-project` workspace, report that as a pre-existing test-design issue and do not clean or migrate those files in this A-scope task.

- [ ] **Step 4: Review changed files**

Run:

```bash
git -C /Users/tashima_meru/Develop/text2html-image diff -- skills/text2html-image/SKILL.md skills/text2html-image/references/execution-flow.md skills/text2html-image/references/stage-guides.md skills/text2html-image/scripts/test.js docs/superpowers/plans/2026-06-29-adaptive-output-artifact-layout.md
```

Expected: only documentation contract edits plus the current plan file.

## Acceptance Criteria

- `SKILL.md` documents the adaptive layout and no longer presents the fixed seven-directory structure as the only desired future shape.
- Single-group projects are documented as shallow: `html/index*.html` and direct `exports/*.png`.
- Multi-group projects are documented as grouped: `html/<html-group>/` and `exports/<delivery-id-or-group>/`.
- Reports are documented as root-level when sparse and directory-based only when there is a meaningful report set.
- `runs/latest/` is documented as overwriteable process evidence.
- Named runs are documented as milestone/failure/delivery evidence only, not one directory per micro-iteration.
- `stage-guides.md` no longer says `batch-export` writes `exports/export-manifest.json`.
- Static documentation contract tests cover the new wording.
- No runtime output migration, deletion, or script behavior change occurs in this plan.

## Out Of Scope

- Changing `workflow-core.js` path generation.
- Adding CLI options for `--run`, `--delivery`, or adaptive group flattening.
- Moving existing `reports/`, `scores/`, `screenshots/`, `working/`, or `exports/` files.
- Cleaning test projects such as `test-default-project`, `path-lock-smoke`, or `test-unsafe-asset`.
- Creating archive folders or deleting `.DS_Store`.
- Implementing automatic retention, pruning, compression, or quota logic.

## Self-Review

- **Spec coverage:** Covers shallow single-group layout, multi-group layout, sparse reports, `runs/latest/`, named run promotion, and no old-output migration.
- **Placeholder scan:** No unresolved placeholder markers remain. The only generic path names are intentional contract placeholders such as `<project-id>` and `<html-group>`.
- **Type and name consistency:** Uses the same `runs/latest/`, `runs/YYYY-MM-DD-rNN-<reason>/`, `project-summary.json`, `reports/export-report.json`, `html/<html-group>/`, and `exports/<delivery-id-or-group>/` names across all tasks.
