# Colleague Workflow Convenience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `project:inspect` command that makes existing image-edit projects easier to resume by surfacing active HTML, CSS, source, export, report, and next-command guidance.

**Architecture:** Add a small CommonJS core module for scanning existing project paths and rendering JSON/Markdown. Add a CLI wrapper and npm script. Extend the existing single-file test harness with fixture-based assertions, then document how `project:inspect` pairs with `task:brief`.

**Tech Stack:** Node.js CommonJS, existing `workflow-core.js` and `html-entries.js`, current `scripts/test.js` harness, Markdown docs.

---

## Files

- Create: `skills/text2html-image/scripts/utils/project-inspect-core.js`
- Create: `skills/text2html-image/scripts/project-inspect.js`
- Modify: `skills/text2html-image/package.json`
- Modify: `skills/text2html-image/scripts/test.js`
- Modify: `skills/text2html-image/SKILL.md`
- Modify: `README.md`
- Modify: `skills/text2html-image/references/execution-flow.md`

## Tasks

### Task 1: Project Inspect Core

- [ ] Create `project-inspect-core.js` with `inspectProject`, `renderProjectInspectMarkdown`, and `writeProjectInspect`.
- [ ] Reuse `listHtmlEntries(projectPaths)` so shallow/grouped HTML detection stays consistent.
- [ ] Fail if `projectPaths.root` does not exist unless `allowMissing` is passed.
- [ ] Count source, export, report, and CSS files without reading large image contents.

### Task 2: CLI Wrapper

- [ ] Add `scripts/project-inspect.js`.
- [ ] Parse `--project` and optional `--subproject`.
- [ ] Use `getProjectPaths` rather than `createProjectWorkspace` so a missing project is not silently created.
- [ ] Print report paths, active HTML count, export count, and recommended next command.

### Task 3: Tests

- [ ] Import the project inspect helpers in `scripts/test.js`.
- [ ] Add `package.json` assertion for `"project:inspect": "node scripts/project-inspect.js"`.
- [ ] Create a fixture workspace with `html/index.html`, `html/index.en.html`, `html/master.css`, `source/reference.png`, `exports/index.png`, and a sample report.
- [ ] Assert the inspector finds HTML variants, CSS, source/export/report files, and preview-overwrite recommendation.
- [ ] Assert the CLI writes `reports/project-inspect.json` and `reports/project-inspect.md`.
- [ ] Assert a missing project fails without creating that project folder.

### Task 4: Docs

- [ ] Update `SKILL.md` near the `task:brief` section.
- [ ] Update README command lists and workflow explanation.
- [ ] Update `references/execution-flow.md` so existing-project edits start with `project:inspect` when the active surface is unclear.

### Task 5: Verification

- [ ] Run `cd skills/text2html-image && npm test`.
- [ ] Run `git diff --check`.
- [ ] Confirm the new command is read-only for missing projects.
