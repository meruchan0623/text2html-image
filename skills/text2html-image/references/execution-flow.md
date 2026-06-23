# Execution Flow

Use this reference when choosing export and verification paths.

## Export Modes

- `batch-export`: report only. It writes `reports/export-report.json` and lists HTML entries plus expected PNG paths, but it does not create PNG files.
- `render:profile`: compatibility check for the direct renderer. It writes `reports/render-profile-report.json` with pass/fail entries and unsupported CSS details.
- `export-fast`: direct HTML-to-SVG-to-PNG export for HTML that passes the render profile. It does not use browser screenshots.

## Direct Renderer Boundary

The direct renderer supports a constrained poster profile:

- fixed `.poster` canvas dimensions from inline pixel styles.
- inline SVG passthrough.
- fixed map labels and title text layers.
- SVG output under `working/render-svg/`.
- PNG output under `exports/`.
- export report under `reports/png-export-report.json`.

It must fail-fast instead of silently degrading output when HTML/CSS requires unsupported rendering features such as `grid`, complex `flex`, `filter`, `mix-blend-mode`, `clip-path`, visual pseudo-elements, media queries, masks, or external HTTP assets.

## Delivery Check

When the user asks to export images, verify:

- `reports/png-export-report.json` exists.
- every intended variant has a PNG path.
- PNG files exist under `exports/`.
- `output_pixels` equals `canvas * scale`.
- failed entries include unsupported CSS reasons.
