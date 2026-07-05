# Training Results Productization Design

## Purpose

Turn the current ImageGen-TDD training output for `text2html-image` into a usable product improvement system.

The next step is not to generate more posters. The next step is to make the existing training evidence readable, comparable, and actionable. This design defines a read-only learning index and promotion workflow that scans the current output projects, identifies real capability gains, finds repeated failures, and tells the next agent exactly what to implement or train next.

## Current Evidence

The current training output shows real progress, but the evidence is scattered.

Observed local evidence on 2026-07-05:

- Output root: `/Users/tsimclaw/Documents/text2html-image-project`
- Top-level project directories: 154
- Random early `test-p*` project directories: 24
- `project-summary.json` files: 120
- Projects with core evidence chain: 118
- `reference-vs-render-review.json` files: 121
- Reference-vs-render score median: about 83
- Reference-vs-render scores at or above 75: 103 of 121
- Pixel audit files: 23
- DOM editability reports: 147
- Cell overflow reports: 74
- Asset readiness reports: 143
- Source-truth reports: 124
- Cross-project learning log lines: 182
- Current repo test command: `npm test` from `skills/text2html-image`
- Current test status during review: pass

The repo has also gained concrete capabilities from the training loop:

- Browser-backed cell overflow audit.
- Reference-vs-render visual compare audit and diff output.
- Export evidence for bitmap layer visibility.
- Stronger asset readiness rules for regenerated locked bases, independent child assets, pose fidelity, and rectangular masks.
- Clearer skill documentation for source-truth assets, baked raster text conflicts, and visual comparison gates.

## Product Problem

The training loop produced useful capability, but the product cannot yet answer these questions reliably:

- Which projects are valid success cases?
- Which projects are only exploration or fixtures?
- Which repeated failures should become tests?
- Which reusable visual rules are stable enough to write into `SKILL.md` or reference docs?
- Which review-gated cases are acceptable limitations, and which are missing evidence?
- What exactly should the next training round do?

The main issue is not lack of data. The issue is inconsistent evidence shape. Historical projects use mixed schemas, mixed status names, incomplete phase summaries, and inconsistent score fields. Continuing to train without normalizing this evidence will make the output root larger but not necessarily make the product better.

## Decision

Implement a read-only training productization workflow before running more training.

The workflow will:

1. Scan the output root.
2. Normalize project evidence into one stable model.
3. Classify projects into success, review, invalid, fixture, exploration, and blocker categories.
4. Aggregate repeated failures and reusable rules.
5. Generate promotion candidates.
6. Produce a report that says what to implement, what to document, and what to train next.

This workflow must not rewrite old project folders, delete generated assets, or edit `SKILL.md` automatically. It only reads historical evidence and writes new reports under the learning lab.

## What To Do After This Spec

After this spec is reviewed, the next execution should be P0: implement the learning index and productization report.

The intended implementation sequence is:

1. Create a detailed implementation plan from this spec.
2. Add a read-only learning index command.
3. Add a productization report command.
4. Run both commands against the existing output root.
5. Use the generated promotion candidates to decide the next repo tests, skill rules, and training tasks.
6. Only after that, resume training in small hypothesis-driven batches.

The user does not need to manually inspect 154 project folders. The next agent should build tooling that does that inspection and summarizes the result.

## Proposed Commands

The implementation should add commands similar to:

```bash
npm run learning:index -- --root ~/Documents/text2html-image-project
npm run learning:report -- --root ~/Documents/text2html-image-project
```

The exact script names may change during planning if they fit existing naming patterns better, but the first implementation should stay read-only.

Expected output files:

```text
~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/
├── normalized-project-index.json
├── training-productization-report.json
├── training-productization-report.md
├── promotion-candidates.json
└── next-training-plan.md
```

## Normalized Evidence Model

Each project should normalize into this shape:

```json
{
  "project_id": "readable-project-name",
  "project_root": "/absolute/path",
  "classification": "success|review|invalid_sample|fixture|exploration|blocker",
  "paths": {
    "reference": "/absolute/path-or-null",
    "html": "/absolute/path-or-null",
    "export": "/absolute/path-or-null",
    "summary": "/absolute/path-or-null"
  },
  "visual": {
    "status": "pass|review|fail|missing",
    "score": 0,
    "pixel_score": 0,
    "diff_path": "/absolute/path-or-null"
  },
  "gates": {
    "route_contract": "pass|review|fail|missing",
    "dom_editability": "pass|review|fail|missing",
    "overflow": "pass|review|fail|missing|not_applicable",
    "asset_readiness": "pass|review|fail|missing",
    "source_truth": "pass|review|fail|missing",
    "export": "pass|review|fail|missing"
  },
  "failure_types": [],
  "learning_rules": [],
  "promotion_recommendations": [],
  "warnings": []
}
```

The normalizer must preserve source paths and raw report paths so a reviewer can inspect the original evidence.

## Classification Rules

Project classification should be conservative.

- `success`: visual score is at or above the configured gate, required core files exist, and no hard gate failed.
- `review`: core evidence exists, but one or more gates are review-gated with clear blocking conditions.
- `invalid_sample`: required reference, export, HTML, or summary is missing.
- `fixture`: project name or report marks it as a test fixture.
- `exploration`: historical or random project, such as early `test-p*`, that should not count as a product success case.
- `blocker`: a repeated or severe failure with enough evidence to become implementation work.

Visual similarity can never override DOM, source-truth, asset readiness, or route failure. A close-looking poster with flattened business copy or unresolved source-truth assets is not a success.

## Promotion Rules

Promotion is how training becomes product improvement.

Use these rules:

- A repeated failure seen in at least two independent non-fixture projects becomes `promote_to_test`.
- A rule that passes in at least two new non-fixture projects becomes `promote_to_skill_rule` or `promote_to_reference_doc`.
- A review-gated asset category that appears repeatedly without enough evidence becomes `needs_tooling_or_manual_review`.
- A project with score below 75 must either show one focused repair round or become `visual_gap_blocker`.
- A project with score at or above 75 but a hard gate failure becomes `not_success_due_to_hard_gate`.
- A historical schema mismatch becomes `schema_normalization_warning`, not a pass.

Promotion candidates should use this shape:

```json
{
  "id": "stable-slug",
  "type": "promote_to_test|promote_to_skill_rule|promote_to_reference_doc|needs_more_training|keep_as_review_gap",
  "title": "short title",
  "evidence_projects": [],
  "failure_or_rule": "summary",
  "recommended_next_action": "specific action",
  "confidence": "high|medium|low"
}
```

## Training Protocol After Productization

Future training must be hypothesis-driven.

Do not resume unbounded generation until the learning report exists. After the report exists, each training round should contain exactly three projects:

1. Regression case: repeats one known failure from `promotion-candidates.json`.
2. Combination case: combines two already partially stable capabilities.
3. Mini boss case: verifies multiple gates at once in a smaller composite.

Each training project must start with an expected contract before HTML/CSS composition. The contract must say which elements are editable DOM, source-truth bitmap, locked base layer, regenerated image, reference cutout, or review-gated.

Each round must produce:

```text
phase-summary-NN.json
phase-summary-NN.md
promotion-candidates.json
updated normalized-project-index.json
updated cross-project-learning-log.jsonl
next-training-plan.md
```

Training should stop after each three-project round for report review. The next round should be chosen from the report, not from a general desire to create more examples.

## Reports

`training-productization-report.md` should be readable by the user and should answer:

- Did the training improve the program?
- Which capabilities improved?
- Which capabilities are still weak?
- Which projects are best success examples?
- Which projects should be ignored as exploration or fixtures?
- Which failures should become tests?
- Which rules should be written into the skill or reference docs?
- What should the next training round do?

`training-productization-report.json` should be machine-readable and contain:

- Aggregate counts.
- Score distributions.
- Gate status distributions.
- Repeated failure types.
- Promotion candidates.
- Next training plan.

`next-training-plan.md` should be short and operational. It should name the next three project types and the exact hypothesis each one tests.

## Error Handling

The workflow must handle historical messiness without hiding it.

- Missing required files become `invalid_sample`.
- Missing audit reports become `missing`, not `pass`.
- Mixed schema fields become `normalized_with_warnings`.
- Unknown statuses are preserved and mapped to `review` unless clearly successful or clearly failed.
- Project-index and phase-summary count mismatches create `index_integrity_warning`.
- Random project names such as `test-p*` are excluded from success statistics unless explicitly marked as fixtures.
- Review-gated assets require `blocking_condition`, `next_action`, and `evidence_required` when available.
- Forbidden output roots such as CloudStorage, OneDrive, or localized `文档` paths should be reported as hard warnings.

## Testing Strategy

Implementation should add focused tests through the existing `scripts/test.js` harness.

Test categories:

- Normalization: old schema, new schema, missing fields, unknown statuses.
- Classification: success, review, invalid sample, fixture, exploration, blocker.
- Promotion: repeated failure thresholds and stable rule thresholds.
- Hard gates: visual score cannot override DOM/source-truth/asset readiness failure.
- Index integrity: mismatched project count or phase count creates warnings.
- Report generation: JSON and Markdown reports include counts, candidates, and next training plan.

Use small fixture JSON objects where possible. Do not copy real generated project assets into the repo as test fixtures unless they are tiny and reusable.

## Non-Goals

This design does not include:

- Generating new ImageGen reference posters.
- Deleting old project folders.
- Migrating historical projects into a new folder layout.
- Automatically editing `SKILL.md`, reference docs, or tests from report output.
- Solving visual similarity for people, maps, airports, and boss composites in this step.

Those actions should come after the productization report identifies the next highest-value changes.

## Implementation Boundaries

The first implementation should be read-only except for writing new reports under:

```text
~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/
```

Reusable runtime code belongs under:

```text
skills/text2html-image/scripts/
skills/text2html-image/scripts/utils/
```

Do not write generated report output into the repo. Only reusable scripts, tests, package command entries, and documentation belong in the repo.

## Success Criteria

This work is successful when:

- `npm run learning:index` builds a normalized project index from the current output root.
- `npm run learning:report` writes JSON and Markdown productization reports.
- The reports identify real progress, current shortfalls, and promotion candidates.
- The report clearly tells the next agent what to do next.
- `npm test` passes from `skills/text2html-image`.
- No historical project folder is rewritten or deleted.

## Immediate Next Action

After the user reviews this spec, create an implementation plan for P0: the read-only learning index and productization report.

The first implementation plan should not include new training projects. It should focus on:

1. Normalized project scanner.
2. Evidence normalizer.
3. Classifier and promotion engine.
4. Markdown and JSON report writer.
5. Tests for classification, promotion, and hard gates.

Only after this P0 is implemented should the next three-project training round begin.
