# Repository Guidelines

## Project Structure & Module Organization

This repository is organized as a self-contained Codex skill package. The active npm package lives in `skills/text2html-image/`; the repository root has no `package.json`.

- `skills/text2html-image/SKILL.md`: canonical skill instructions.
- `skills/text2html-image/scripts/`: Node.js workflow commands for project init, build, QC, export, DOM audit, and flood cutout.
- `skills/text2html-image/data/`: shared copy/data inputs such as `copy_master` rows.
- `skills/text2html-image/config/`: workflow configuration.
- `skills/text2html-image/references/`: detailed process references for complex edits.
- `skills/text2html-image/agents/`: agent-specific support files.
- `docs/`: repository-level design notes and planning documents.

Generated poster projects must stay outside this repo, under `~/Documents/text2html-image-project/<project-id>/`.

## Build, Test, and Development Commands

Run commands from `skills/text2html-image/`:

```bash
npm run project:init -- --project <project-id>
npm run build -- --project <project-id>
npm run quality-check -- --project <project-id>
npm run audit:dom -- --project <project-id> --group <html-group>
npm run render:profile -- --project <project-id> --group <html-group>
npm run export-fast -- --project <project-id> --group <html-group> --scale 2
npm run flood-cutout -- --input <source.png>
npm test
```

Use `build` to generate static HTML previews. Use `quality-check` and `audit:dom` before export. `batch-export` may create reports only; verify real image files separately.

## Coding Style & Naming Conventions

Use plain Node.js scripts and keep changes surgical. Prefer small functions, explicit paths, and readable JSON reports. Project IDs should be lowercase ASCII kebab-case, for example `travel-esim-banner`, and capped to short stable names. Keep generated files, screenshots, exports, and one-off helpers out of the skill package unless they are reusable fixtures with clear metadata.

## Testing Guidelines

The package test entrypoint is:

```bash
npm test
```

Add or update tests through the existing `scripts/test.js` harness when changing workflow behavior. For HTML/image work, also verify DOM editability, missing assets, scroll/overflow status, and exported image dimensions.

## Commit & Pull Request Guidelines

Recent history uses concise imperative or scoped messages, for example `Add flood-cutout tool, docs, and SKILL updates`, `feat: add DOM editability audit`, and `docs: define adaptive output artifact layout`.

PRs should include:

- Summary of changed workflow behavior or documentation.
- Commands run and key outputs.
- Affected project/template paths.
- Screenshots or exported image paths for visual changes.
- Notes on any skipped verification or known limitations.

## Security & Configuration Tips

Do not commit secrets, API keys, private customer assets, or generated deliverables. Read secrets only from environment variables or local private config. Keep runtime output contained under `~/Documents/text2html-image-project/`.
