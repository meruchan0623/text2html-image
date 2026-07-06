# Colleague Task Brief Convenience Design

## Context

The attached colleague conversations show that `text2html-image` already works for image-to-HTML recreation and iterative poster editing. The costly part is not core generation. The costly part is repeatedly translating natural-language intent into the correct workflow surface, overwrite policy, preview handoff, multilingual sync, font handling, and export boundary.

The convenience upgrade should keep the existing static HTML/CSS workflow intact and add a low-friction task brief layer that helps the agent start each image round with the right constraints.

## Goals

- Reduce repeated prompt writing for common copy-image and edit rounds.
- Make the active work mode explicit before editing.
- Prevent accidental formal image export unless the user asks for it.
- Make preview handoff reliable by proactively surfacing preview file links and the active `index.html` path in the conversation.
- Keep changes small, testable, and aligned with the existing scripts and reports.

## Non-Goals

- Do not build a GUI or interactive control page.
- Do not add scripts to generated previews.
- Do not replace `visual:intake`, `route:assets`, `prompt:compose`, `audit:*`, or `export-fast`.
- Do not introduce a full automated design generator.
- Do not change the workspace root or project layout rules.

## Recommended Approach

Add a lightweight task brief generator, exposed as:

```bash
npm run task:brief -- --project <project-id> --mode <mode> [--source-image <path>] [--html <path>] [--constraint <text>] [--lang <lang>...]
```

The command writes:

- `reports/task-brief.json`
- `reports/task-brief.md`

The Markdown brief is optimized for direct agent read-in. The JSON brief is optimized for tests and future automation.

## Modes

### `faithful-recreate`

Use when the user asks for 1:1 recreation from a reference image.

Default rules:

- Use the reference image as the only visual source.
- Do not redesign, beautify, simplify, or change copy.
- Produce editable static HTML/CSS.
- Run the existing first-pass entrance when appropriate: `visual:intake -> route:assets --from-intake -> prompt:compose`.
- Complex art, logos, app icons, people, maps, phones, and dense screenshots must be routed as source-truth bitmap/cutout/review assets instead of approximate CSS redraws.

### `preview-overwrite`

Use when the user wants the current main preview updated.

Default rules:

- It is allowed to overwrite the active project `html/index.html`.
- It is allowed to overwrite the active project `html/master.css`.
- Do not write or overwrite `exports/` unless the user explicitly asks for formal export.
- Every response that hands off a visual result must explicitly include the clickable active `index.html` preview link and the plain absolute local HTML path.
- If a screenshot preview or browser-rendered preview file exists, include that preview file link in the conversation as well.

### `preview-only`

Use when the user asks to see a draft before applying it.

Default rules:

- Do not overwrite canonical `html/index.html` or `html/master.css`.
- Write a clearly named preview file, such as `html/preview-<topic>.html` plus its CSS.
- Do not write or overwrite `exports/` unless explicitly requested.
- Every response that hands off the draft must explicitly include the clickable detached preview HTML file link and its plain absolute local path.
- The final response must identify that the preview is detached from the canonical files.

### `surgical-edit`

Use for narrow edits such as changing a status mark, order number, one badge, one copy block, one color token, or one font family.

Default rules:

- Edit only the smallest affected HTML/CSS surface.
- Do not rebuild before editing generated workspace HTML.
- Keep sibling language variants synchronized unless the user scopes the edit to one language.
- Do not change layout, spacing, imagery, color, font, export files, or other elements outside the requested target.

### `multilingual-sync`

Use when the user asks for English, Japanese, or other language variants.

Default rules:

- Start from the accepted source language design.
- Preserve the layout and visual hierarchy.
- Use language-specific font and line-height overrides only where needed.
- Check line breaks, overflow, and visual balance for every affected locale.
- Do not shrink text excessively to force a translation into the source-language box.

### `finalize-export`

Use only when the user explicitly asks to export PNG/JPG/WebP, save final images, or deliver final assets.

Default rules:

- Produce real image files, not only `reports/export-report.json`.
- Verify file existence, pixel dimensions, and affected language variants.
- Keep CSS canvas dimensions fixed and use export scale rather than changing layout size.

## Default Output Policy

Unless the user explicitly says to export final images:

- Do not create or overwrite formal `exports/index.png`.
- Do not present an export report as a completed image export.
- Preview evidence should be actively surfaced in the conversation, not only buried in reports.
- When preview HTML, screenshot previews, or browser-rendered preview images exist, include explicit preview file links in the response.

When the active mode is `preview-overwrite`, overwriting these files is allowed:

- `html/index.html`
- `html/master.css`

The final response for every preview/edit round must include:

- A clickable link to the active `index.html`.
- The plain absolute local HTML path.
- Explicit links to any generated preview files, such as detached preview HTML or screenshot preview images.
- `reports/preview-links.md` when it exists.
- A note when formal export was intentionally skipped.

## Data Shape

`task-brief.json` should include:

```json
{
  "project_id": "example-project",
  "mode": "preview-overwrite",
  "source_image": "/absolute/path/reference.png",
  "active_html": "/absolute/path/html/index.html",
  "preview_files": ["/absolute/path/html/index.html"],
  "allowed_writes": ["html/index.html", "html/master.css"],
  "forbidden_writes": ["exports/*"],
  "export_allowed": false,
  "rebuild_allowed": false,
  "multilingual_sync": {
    "enabled": false,
    "locales": []
  },
  "required_handoff": [
    "explicit_preview_file_links_in_conversation",
    "clickable_index_html_link",
    "plain_absolute_index_html_path",
    "preview_links_report_if_present",
    "export_skipped_note"
  ],
  "verification": [
    "read active HTML/CSS after edit",
    "refresh or screenshot browser preview when visual layout changes",
    "run targeted audit only when it catches the current failure mode"
  ]
}
```

## CLI Behavior

- `--mode` is required.
- `--project` is required.
- `--source-image` is required for `faithful-recreate`.
- `--html` is optional. If omitted, the command resolves the likely active `html/index.html` under the project.
- `--constraint` may be repeated and is copied into the brief as user-specific hard rules.
- The command should refuse unknown modes.
- The command should not create generated HTML, CSS, screenshots, or exports. It only writes task brief reports.
- The command should record expected preview files so the agent can proactively output them in conversation after the edit/render round.

## Documentation Updates

Update the skill docs to mention the convenience entry near the existing preview and execution-flow guidance:

- Use `task:brief` before an image-edit round when the user intent mixes preview, overwrite, multilingual sync, or export rules.
- The brief does not replace the existing workflow commands.
- Formal export still requires an explicit user request.
- Preview files should be explicitly linked in the user-facing response whenever they exist.

## Testing

Add tests to `scripts/test.js` that verify:

- `package.json` exposes `task:brief`.
- Each known mode renders the expected allowed/forbidden write policy.
- `preview-overwrite` allows `html/index.html` and `html/master.css`, forbids `exports/*`, and sets `export_allowed: false`.
- `preview-overwrite` requires `explicit_preview_file_links_in_conversation` and includes the active `index.html` in `preview_files`.
- `preview-only` requires detached preview file links in the user-facing handoff.
- `finalize-export` sets `export_allowed: true`.
- Unknown modes fail.
- Markdown output contains the active `index.html` handoff requirement and the proactive preview file link requirement.

## Implementation Boundary

This should be a small additive change:

- New script: `scripts/task-brief.js`
- New core helper: `scripts/utils/task-brief-core.js`
- Package script entry: `task:brief`
- Focused docs additions in `SKILL.md`, `README.md`, and `references/execution-flow.md`
- Focused tests in `scripts/test.js`

Do not refactor the build, render, audit, or asset-routing systems while implementing this feature.
