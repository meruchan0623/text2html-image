# Colleague Workflow Convenience Design

## Background

The provided colleague conversations show that the core `text2html-image` flow is already useful for copy-image and edit-image work. The repeated friction is operational: locating the right existing project, deciding whether the active surface is the canonical HTML or a preview draft, keeping preview/export boundaries clear, and reporting the correct HTML/PNG paths after each round.

## Assumptions

- The fastest useful improvement is a thin workflow helper, not a GUI or a new renderer.
- Existing generated projects remain outside the repo under `~/Documents/text2html-image-project/`.
- Preview-first edits should stay cheap and explicit. Formal export remains opt-in unless the user asks for it.
- `task:brief` is already the right boundary guard for edit intent; the missing convenience is project-state discovery.

## Options

### Option A: Documentation only

This is safest, but it still makes the agent manually rediscover active HTML files, language variants, exports, and reports each time.

### Option B: Add a read-only project inspection command

Add `npm run project:inspect -- --project <project-id>` to scan an existing workspace project and write a compact handoff report with active HTML entries, CSS files, source assets, exports, key reports, and recommended next commands.

This is the recommended option. It directly supports the successful colleague pattern: locate existing project -> identify active preview -> make surgical edits -> verify/export only when requested.

### Option C: Add an export orchestration command

This might help later, but it is broader and riskier. The conversations show more failures around wrong edit surface and preview/final confusion than around missing export mechanics.

## Design

`project:inspect` is read-only. It must not create a project folder, write HTML/CSS, run build, or export images. If the project root does not exist, it fails with a clear message.

The command writes:

- `reports/project-inspect.json`
- `reports/project-inspect.md`

The report includes:

- Workspace root and project root.
- HTML entries from the existing layout, using current shallow/grouped detection rules.
- CSS files beside active HTML groups.
- Source asset count and sample file names.
- Export file count, sample file names, and latest modified export.
- Existing report file count and sample file names.
- Recommended next commands:
  - `task:brief --mode preview-overwrite` when editable HTML exists.
  - `task:brief --mode faithful-recreate --source-image <path>` when source images exist but no HTML exists.
  - `project:init` only when the project is missing.
  - `task:brief --mode finalize-export` when the user asks for final image export.

## Success Criteria

- `npm test` covers the read-only project inspection core and CLI output.
- Inspecting an existing test project does not create new HTML/CSS/export files.
- The report gives an agent enough information to continue a preview-first edit without rediscovering paths manually.
- Docs explain that `project:inspect` is for discovery and `task:brief` is for edit/export boundaries.
