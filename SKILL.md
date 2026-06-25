---
name: text2html-image
description: Use when locating, installing, or forwarding to the canonical text2html-image skill from this repository root.
---

# text2html-image Repository Entry

The canonical skill package is `skills/text2html-image/`.

Read and follow `skills/text2html-image/SKILL.md` for the actual workflow. Use that directory as the runtime root for commands:

```bash
cd skills/text2html-image
npm test
npm run build -- --project <project-id>
```

For global Codex discovery, install it as:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -sfn "$(pwd)/skills/text2html-image" "${CODEX_HOME:-$HOME/.codex}/skills/text2html-image"
```

Do not treat this repository root as an image project workspace. Runtime image projects belong under the current user's `Documents/text2html-image-project/` folder.
