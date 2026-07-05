# Codex First-Pass HTML Prompt Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the successful "read image -> structured visual spec -> asset routing -> first HTML pass -> DOM/Visual-DOM review" workflow into a stable prompt-bundle command that Codex can read before writing HTML.

**Architecture:** Add one focused command, `prompt:compose`, that consumes existing project reports and writes prompt-ready artifacts under `reports/`. It does not call a model and does not generate HTML; it fail-fasts unless visual intake and asset routing evidence already exist, then produces `reverse-visual-spec.md`, `visual-elements.json`, `first-pass-html-plan.md`, `codex-first-pass-html-prompt.md`, and `codex-prompt-compose-audit.json`.

**Tech Stack:** Node.js scripts in `skills/text2html-image`, existing `workflow-core` project path helpers, JSON/Markdown reports, current `scripts/test.js` harness.

---

## Requirements Summary

- Build from the pasted successful cases: reverse visual specs improve first-pass HTML because they externalize visual structure and reduce simultaneous vision/code load.
- Solidify the read-in method as local files, not conversational memory.
- Keep source-truth boundaries: prompt-only assets are not final assets; OCR/business text still needs verification.
- Require existing `visual-intake-manifest.json`, `asset-routing-table.json`, and `reverse-prompt-brief.md` before composing a Codex first-pass prompt.
- Produce a single prompt bundle file that names the exact artifact read order and blocks HTML generation if inputs are missing or intake is still `review`.
- Keep generated project artifacts outside the repository; only reusable runtime code, docs, and tests are committed.

## File Structure

- Create `skills/text2html-image/scripts/compose-codex-html-prompt.js`
  - CLI wrapper for `npm run prompt:compose`.
  - Parses `--project`, `--subproject`, optional input overrides, and `--allow-review`.
  - Prints every written report path.
- Create `skills/text2html-image/scripts/utils/codex-html-prompt-core.js`
  - Pure-ish core for loading reports, validating required evidence, rendering Markdown/JSON artifacts, and writing an audit report.
  - Exports `composeCodexHtmlPrompt`, `renderReverseVisualSpec`, `renderFirstPassHtmlPlan`, and `renderCodexPromptBundle`.
- Modify `skills/text2html-image/package.json`
  - Add `"prompt:compose": "node scripts/compose-codex-html-prompt.js"`.
- Modify `skills/text2html-image/SKILL.md`
  - Document the prompt bundle gate and command.
  - Add the new command to the command list.
- Modify `skills/text2html-image/references/execution-flow.md`
  - Insert the prompt bundle into the pre-HTML evidence chain.
- Modify `skills/text2html-image/references/stage-guides.md`
  - Clarify that first-pass HTML should read prompt bundle artifacts after routing.
- Modify `skills/text2html-image/scripts/test.js`
  - Add RED assertions for package script, target file, docs, core fail-fast behavior, core output shape, and CLI smoke.

### Task 1: RED Tests For Prompt Bundle Contract

**Files:**
- Modify: `skills/text2html-image/scripts/test.js`

- [ ] **Step 1: Import the future core**

Add this import near the current `visual-intake-core` import:

```js
const { composeCodexHtmlPrompt } = require('./utils/codex-html-prompt-core');
```

- [ ] **Step 2: Add package script and docs assertions**

Add assertions near the existing package script checks:

```js
assert(packageJson.scripts['prompt:compose'] === 'node scripts/compose-codex-html-prompt.js', 'package.json missing prompt:compose script');
```

Add `compose-codex-html-prompt.js` to the required script target list, and add docs assertions:

```js
assert(skillBody.includes('Codex First-Pass HTML Prompt Bundle'), 'skill must document Codex first-pass prompt bundle');
assert(skillBody.includes('reports/codex-first-pass-html-prompt.md'), 'skill must document codex first-pass prompt output');
assert(skillBody.includes('npm run prompt:compose'), 'skill must document prompt:compose command');
```

- [ ] **Step 3: Add behavior tests**

After the existing `visual:intake` + `route:assets` assertions, add tests that:

```js
assert.throws(() => composeCodexHtmlPrompt({ projectPaths }), /visual-intake-manifest\.json/, 'prompt compose should fail when visual intake manifest is missing');
```

Then create a passing fixture with `visual-intake-manifest.json`, `reverse-prompt-brief.md`, `asset-routing-table.json`, and `asset-generation-prompts.json`. Assert:

```js
const composed = composeCodexHtmlPrompt({ projectPaths });
assert(composed.audit.status === 'pass', 'prompt compose audit should pass with required artifacts');
assert(fs.existsSync(path.join(projectPaths.reports, 'reverse-visual-spec.md')), 'prompt compose should write reverse-visual-spec.md');
assert(fs.existsSync(path.join(projectPaths.reports, 'visual-elements.json')), 'prompt compose should write visual-elements.json');
assert(fs.existsSync(path.join(projectPaths.reports, 'first-pass-html-plan.md')), 'prompt compose should write first-pass-html-plan.md');
assert(fs.existsSync(path.join(projectPaths.reports, 'codex-first-pass-html-prompt.md')), 'prompt compose should write codex-first-pass-html-prompt.md');
assert(composed.prompt.includes('Read these local artifacts in this order'), 'prompt bundle should define artifact read order');
assert(composed.prompt.includes('Do not start writing HTML until'), 'prompt bundle should block premature HTML');
```

- [ ] **Step 4: Run RED**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: FAIL because `./utils/codex-html-prompt-core` or the package script does not exist yet.

### Task 2: Implement Core And CLI

**Files:**
- Create: `skills/text2html-image/scripts/utils/codex-html-prompt-core.js`
- Create: `skills/text2html-image/scripts/compose-codex-html-prompt.js`
- Modify: `skills/text2html-image/package.json`

- [ ] **Step 1: Implement fail-fast input loading**

In `codex-html-prompt-core.js`, require `fs`, `path`, and `writeJson`. Implement:

```js
function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required ${label}: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
```

- [ ] **Step 2: Implement artifact rendering**

Implement renderers that convert manifest + routing into deterministic Markdown/JSON. `reverse-visual-spec.md` contains source path, canvas, visual hierarchy, business text candidates, and element table. `first-pass-html-plan.md` contains DOM text, vector, bitmap, prompt-only, validation, and forbidden-action sections. `codex-first-pass-html-prompt.md` contains read order, guardrails, paths, and acceptance commands.

- [ ] **Step 3: Implement `composeCodexHtmlPrompt`**

The function defaults paths from `projectPaths.reports`, rejects non-`pass` visual intake unless `allowReview` is true, writes all five reports, and returns:

```js
return {
  audit,
  reverseVisualSpec,
  visualElements,
  firstPassPlan,
  prompt,
  paths,
};
```

- [ ] **Step 4: Implement CLI**

`compose-codex-html-prompt.js` parses args with `parseArgs`, creates project paths, calls `composeCodexHtmlPrompt`, prints written paths, and exits `1` with a concise message on validation failure.

- [ ] **Step 5: Add package script**

Add:

```json
"prompt:compose": "node scripts/compose-codex-html-prompt.js"
```

- [ ] **Step 6: Run GREEN**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: PASS.

### Task 3: Document The Stable Workflow

**Files:**
- Modify: `skills/text2html-image/SKILL.md`
- Modify: `skills/text2html-image/references/execution-flow.md`
- Modify: `skills/text2html-image/references/stage-guides.md`

- [ ] **Step 1: Add SKILL section**

Add a section named `Codex First-Pass HTML Prompt Bundle` stating:

```text
For reference-image recreation, run prompt:compose after visual:intake and route:assets and before writing the first HTML/CSS pass.
```

List outputs:

```text
reports/reverse-visual-spec.md
reports/visual-elements.json
reports/first-pass-html-plan.md
reports/codex-first-pass-html-prompt.md
reports/codex-prompt-compose-audit.json
```

- [ ] **Step 2: Update command list**

Add:

```bash
npm run prompt:compose -- --project <project-id> [--subproject <subproject-id>] [--allow-review]
```

- [ ] **Step 3: Update references**

In `execution-flow.md`, add `codex-first-pass-html-prompt.md` to the evidence chain before HTML composition. In `stage-guides.md`, state that Codex should read the prompt bundle before writing the first pass.

- [ ] **Step 4: Run docs assertions**

Run:

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: PASS.

### Task 4: Verification And Delivery

**Files:**
- No new production files unless tests expose a defect.

- [ ] **Step 1: Run full tests**

```bash
cd /Users/tashima_meru/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: exit `0` and `Tests passed. Generated 5 preview(s).`

- [ ] **Step 2: Run whitespace check**

```bash
cd /Users/tashima_meru/Develop/text2html-image
git diff --check
```

Expected: no output and exit `0`.

- [ ] **Step 3: Inspect final diff**

```bash
git status --short --untracked-files=all
git diff --stat
```

Expected: only reusable skill package/runtime docs and this plan file are changed or added.

- [ ] **Step 4: Commit and push main**

Because the user explicitly requested `main`, stage the relevant changes, commit with:

```bash
git commit -m "Add Codex first-pass HTML prompt bundle"
git push origin main
```

Expected: commit succeeds on `main`; push updates `origin/main`.

## Self-Review

- Spec coverage: The plan implements a fixed prompt read-in path, not a new HTML generator. That matches the user's request to solidify Codex-readable structured artifacts and keeps prompt-only assets out of final HTML.
- Placeholder scan: No task uses TBD/TODO/implement later language.
- Type consistency: The command name is consistently `prompt:compose`; the main prompt output is consistently `reports/codex-first-pass-html-prompt.md`.
