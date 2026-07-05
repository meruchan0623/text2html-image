# Training Results Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only learning index and productization report for the existing `text2html-image` ImageGen-TDD training outputs.

**Architecture:** Add focused Node.js core utilities under `scripts/utils/` that scan project reports, normalize evidence, classify projects, generate promotion candidates, and write user-readable reports. Add thin CLI wrappers under `scripts/`, package scripts, documentation, and tests in the existing `scripts/test.js` harness.

**Tech Stack:** Node.js built-ins (`fs`, `path`, `os`), existing `workflow-core.js` helpers (`parseArgs`, `writeJson`), plain JSON and Markdown reports, existing `npm test` harness.

## Global Constraints

- Output root defaults to `/Users/tsimclaw/Documents/text2html-image-project` through `~/Documents/text2html-image-project`.
- First implementation is read-only for historical project folders.
- New generated reports may only be written under `~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/`.
- Do not generate new ImageGen reference posters.
- Do not delete, migrate, or rewrite old project folders.
- Visual similarity can never override DOM, source-truth, asset readiness, or route failure.
- Historical schema mismatch becomes a warning, not a pass.
- Random project names such as `test-p*` are excluded from success statistics unless explicitly marked as fixtures.
- Add tests through `skills/text2html-image/scripts/test.js`.
- Run commands from `/Users/tsimclaw/Develop/text2html-image/skills/text2html-image`.

---

## File Structure

- Create `skills/text2html-image/scripts/utils/learning-evidence-core.js`
  - Owns filesystem scanning, JSON reading, status normalization, score extraction, project evidence normalization, project classification, aggregate statistics, and promotion candidate generation.
- Create `skills/text2html-image/scripts/utils/learning-report-core.js`
  - Owns Markdown and JSON report model creation from a normalized index.
- Create `skills/text2html-image/scripts/learning-index.js`
  - CLI wrapper for writing `normalized-project-index.json`.
- Create `skills/text2html-image/scripts/learning-report.js`
  - CLI wrapper for writing `training-productization-report.json`, `training-productization-report.md`, `promotion-candidates.json`, and `next-training-plan.md`.
- Modify `skills/text2html-image/package.json`
  - Add `learning:index` and `learning:report` scripts.
- Modify `skills/text2html-image/scripts/test.js`
  - Add unit tests for normalizer, classifier, promotion rules, report generation, package scripts, and CLI script existence.
- Modify `skills/text2html-image/SKILL.md`
  - Document the new read-only learning productization commands and the rule that training should not resume before a learning report exists.

## Task 1: Core Evidence Normalizer

**Files:**
- Create: `skills/text2html-image/scripts/utils/learning-evidence-core.js`
- Modify: `skills/text2html-image/scripts/test.js`

**Interfaces:**
- Produces:
  - `safeReadJson(filePath: string): object | null`
  - `normalizeStatus(value: unknown): "pass" | "review" | "fail" | "missing" | "not_applicable"`
  - `extractScore(...objects: object[]): number | null`
  - `normalizeProjectEvidence(projectRoot: string): NormalizedProject`

- [ ] **Step 1: Add failing tests for status, scores, and project normalization**

In `skills/text2html-image/scripts/test.js`, add this require near the other utility imports:

```js
const {
  extractScore,
  normalizeProjectEvidence,
  normalizeStatus,
  safeReadJson,
} = require('./utils/learning-evidence-core');
```

Then add this test block after the existing project path assertions:

```js
const learningFixtureRoot = path.join(projectPaths.root, 'learning-productization-fixtures');
fs.rmSync(learningFixtureRoot, { recursive: true, force: true });
fs.mkdirSync(learningFixtureRoot, { recursive: true });

const learningSuccessProject = path.join(learningFixtureRoot, 'airport-pricing-source-truth-success');
fs.mkdirSync(path.join(learningSuccessProject, 'source'), { recursive: true });
fs.mkdirSync(path.join(learningSuccessProject, 'html'), { recursive: true });
fs.mkdirSync(path.join(learningSuccessProject, 'exports'), { recursive: true });
fs.mkdirSync(path.join(learningSuccessProject, 'reports'), { recursive: true });
fs.writeFileSync(path.join(learningSuccessProject, 'source', 'reference.png'), 'reference');
fs.writeFileSync(path.join(learningSuccessProject, 'html', 'index.html'), '<!doctype html><main></main>');
fs.writeFileSync(path.join(learningSuccessProject, 'exports', 'index.png'), 'export');
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'project-summary.json'), JSON.stringify({
  status: 'complete',
  similarity_score: 89,
}, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'reference-vs-render-review.json'), JSON.stringify({
  status: 'pass',
  visual_similarity_score: 89,
}, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'dom-editability-report.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'cell-overflow-report.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'asset-readiness-audit.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'source-truth-acquisition-audit.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'route-contract-audit.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningSuccessProject, 'reports', 'reference-vs-render-pixel-audit.json'), JSON.stringify({ status: 'pass', similarity_score: 88 }, null, 2));

assert(safeReadJson(path.join(learningSuccessProject, 'reports', 'project-summary.json')).status === 'complete', 'learning safeReadJson should read valid JSON');
assert(safeReadJson(path.join(learningSuccessProject, 'reports', 'missing.json')) === null, 'learning safeReadJson should return null for missing JSON');
assert(normalizeStatus('PASS') === 'pass', 'learning normalizeStatus should lowercase pass');
assert(normalizeStatus('partial_pass_with_review_gaps') === 'review', 'learning normalizeStatus should map partial pass to review');
assert(normalizeStatus('not_applicable') === 'not_applicable', 'learning normalizeStatus should preserve not_applicable');
assert(normalizeStatus(undefined) === 'missing', 'learning normalizeStatus should map empty values to missing');
assert(extractScore({ visual_score: 77 }, { similarity_score: 88 }) === 77, 'learning extractScore should use first available score');
assert(extractScore({ status: 'pass' }) === null, 'learning extractScore should return null when no score exists');

const normalizedSuccess = normalizeProjectEvidence(learningSuccessProject);
assert(normalizedSuccess.project_id === 'airport-pricing-source-truth-success', 'learning normalizer should use folder name as project id');
assert(normalizedSuccess.classification === 'success', `learning success project should classify as success, got ${normalizedSuccess.classification}`);
assert(normalizedSuccess.visual.score === 89, 'learning normalizer should capture visual score');
assert(normalizedSuccess.visual.pixel_score === 88, 'learning normalizer should capture pixel score');
assert(normalizedSuccess.gates.dom_editability === 'pass', 'learning normalizer should capture DOM gate');
assert(normalizedSuccess.gates.source_truth === 'pass', 'learning normalizer should capture source-truth gate');
assert(normalizedSuccess.paths.reference.endsWith('source/reference.png'), 'learning normalizer should preserve reference path');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: fail with `Cannot find module './utils/learning-evidence-core'`.

- [ ] **Step 3: Create `learning-evidence-core.js` with minimal normalizer**

Create `skills/text2html-image/scripts/utils/learning-evidence-core.js`:

```js
const fs = require('fs');
const path = require('path');

const HARD_GATE_KEYS = ['route_contract', 'dom_editability', 'asset_readiness', 'source_truth', 'export'];
const SCORE_KEYS = ['similarity_score', 'overall_similarity_score', 'visual_similarity_score', 'visual_score', 'reference_vs_render_score'];

function safeReadJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'missing';
  if (raw === 'not_applicable' || raw === 'n/a') return 'not_applicable';
  if (raw === 'pass' || raw === 'complete' || raw === 'passed') return 'pass';
  if (raw === 'fail' || raw === 'failed' || raw.includes('fail')) return 'fail';
  if (raw === 'review' || raw.includes('review') || raw.includes('partial') || raw.includes('gap')) return 'review';
  return 'review';
}

function extractScore(...objects) {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    for (const key of SCORE_KEYS) {
      const value = Number(obj[key]);
      if (Number.isFinite(value)) return value;
    }
    if (obj.visual && Number.isFinite(Number(obj.visual.score))) return Number(obj.visual.score);
    if (obj.audits && Number.isFinite(Number(obj.audits.overall_similarity_score))) return Number(obj.audits.overall_similarity_score);
  }
  return null;
}

function existingPath(projectRoot, relativePath) {
  const target = path.join(projectRoot, relativePath);
  return fs.existsSync(target) ? target : null;
}

function reportPath(projectRoot, filename) {
  return path.join(projectRoot, 'reports', filename);
}

function firstExisting(projectRoot, filenames) {
  return filenames.map((name) => reportPath(projectRoot, name)).find((file) => fs.existsSync(file)) || null;
}

function normalizeGate(report) {
  return normalizeStatus(report?.status || report?.review_status || report?.phase_status);
}

function classifyProject(project) {
  if (/^test-p\d+$/i.test(project.project_id) || project.project_id === 'default') return 'exploration';
  if (!project.paths.reference || !project.paths.html || !project.paths.export || !project.paths.summary) return 'invalid_sample';
  if (project.visual.score === null) return 'review';
  if (project.visual.score < 75) return 'blocker';
  if (HARD_GATE_KEYS.some((key) => project.gates[key] === 'fail')) return 'blocker';
  if (Object.values(project.gates).some((status) => status === 'review' || status === 'missing')) return 'review';
  return 'success';
}

function normalizeProjectEvidence(projectRoot) {
  const projectId = path.basename(projectRoot);
  const summaryPath = firstExisting(projectRoot, ['project-summary.json']);
  const reviewPath = firstExisting(projectRoot, ['reference-vs-render-review.json']);
  const pixelPath = firstExisting(projectRoot, ['reference-vs-render-pixel-audit.json']);
  const domPath = firstExisting(projectRoot, ['dom-editability-report.json']);
  const overflowPath = firstExisting(projectRoot, ['cell-overflow-report.json']);
  const readinessPath = firstExisting(projectRoot, ['asset-readiness-audit.json']);
  const sourceTruthPath = firstExisting(projectRoot, ['source-truth-acquisition-audit.json', 'source-truth-bitmap-audit.json', 'source-truth-audit.json']);
  const routePath = firstExisting(projectRoot, ['route-contract-audit.json', 'expected-route-contract-audit.json']);
  const exportPath = firstExisting(projectRoot, ['png-export-report.json']);
  const summary = safeReadJson(summaryPath);
  const review = safeReadJson(reviewPath);
  const pixel = safeReadJson(pixelPath);
  const dom = safeReadJson(domPath);
  const overflow = safeReadJson(overflowPath);
  const readiness = safeReadJson(readinessPath);
  const sourceTruth = safeReadJson(sourceTruthPath);
  const route = safeReadJson(routePath);
  const exportReport = safeReadJson(exportPath);
  const project = {
    project_id: projectId,
    project_root: projectRoot,
    classification: 'review',
    paths: {
      reference: existingPath(projectRoot, 'source/reference.png'),
      html: existingPath(projectRoot, 'html/index.html') || existingPath(projectRoot, 'html/main/index.html'),
      export: existingPath(projectRoot, 'exports/index.png'),
      summary: summaryPath,
    },
    visual: {
      status: normalizeGate(review),
      score: extractScore(review, summary),
      pixel_score: extractScore(pixel),
      diff_path: existingPath(projectRoot, 'reports/reference-vs-render-diff.png'),
    },
    gates: {
      route_contract: normalizeGate(route),
      dom_editability: normalizeGate(dom),
      overflow: overflow ? normalizeGate(overflow) : 'missing',
      asset_readiness: normalizeGate(readiness),
      source_truth: normalizeGate(sourceTruth),
      export: existingPath(projectRoot, 'exports/index.png') ? normalizeGate(exportReport) === 'fail' ? 'fail' : 'pass' : 'missing',
    },
    failure_types: [],
    learning_rules: [],
    promotion_recommendations: [],
    warnings: [],
    reports: {
      summary: summaryPath,
      reference_review: reviewPath,
      pixel_audit: pixelPath,
      dom_editability: domPath,
      overflow: overflowPath,
      asset_readiness: readinessPath,
      source_truth: sourceTruthPath,
      route_contract: routePath,
      export: exportPath,
    },
  };
  if (project.visual.score === null) project.warnings.push('missing_visual_score');
  for (const [key, status] of Object.entries(project.gates)) {
    if (status === 'missing') project.warnings.push(`missing_${key}`);
  }
  project.classification = classifyProject(project);
  return project;
}

module.exports = {
  classifyProject,
  extractScore,
  normalizeProjectEvidence,
  normalizeStatus,
  safeReadJson,
};
```

- [ ] **Step 4: Run the tests and verify Task 1 passes**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add skills/text2html-image/scripts/test.js skills/text2html-image/scripts/utils/learning-evidence-core.js
git commit -m "feat: normalize learning evidence"
```

## Task 2: Scanner, Aggregates, And Promotion Candidates

**Files:**
- Modify: `skills/text2html-image/scripts/utils/learning-evidence-core.js`
- Modify: `skills/text2html-image/scripts/test.js`

**Interfaces:**
- Consumes:
  - `normalizeProjectEvidence(projectRoot: string): NormalizedProject`
- Produces:
  - `scanProjectRoots(outputRoot: string): string[]`
  - `buildNormalizedProjectIndex(outputRoot: string): NormalizedProjectIndex`
  - `buildPromotionCandidates(projects: NormalizedProject[]): PromotionCandidate[]`

- [ ] **Step 1: Add failing tests for scanning, aggregates, and promotions**

Append this test block after the Task 1 learning normalizer tests:

```js
const learningReviewProject = path.join(learningFixtureRoot, 'logo-review-gap-project');
fs.mkdirSync(path.join(learningReviewProject, 'source'), { recursive: true });
fs.mkdirSync(path.join(learningReviewProject, 'html'), { recursive: true });
fs.mkdirSync(path.join(learningReviewProject, 'exports'), { recursive: true });
fs.mkdirSync(path.join(learningReviewProject, 'reports'), { recursive: true });
fs.writeFileSync(path.join(learningReviewProject, 'source', 'reference.png'), 'reference');
fs.writeFileSync(path.join(learningReviewProject, 'html', 'index.html'), '<!doctype html><main></main>');
fs.writeFileSync(path.join(learningReviewProject, 'exports', 'index.png'), 'export');
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'project-summary.json'), JSON.stringify({ status: 'complete', similarity_score: 82 }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'reference-vs-render-review.json'), JSON.stringify({ status: 'pass', visual_similarity_score: 82 }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'dom-editability-report.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'cell-overflow-report.json'), JSON.stringify({ status: 'pass' }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'asset-readiness-audit.json'), JSON.stringify({
  status: 'fail',
  failures: [{ code: 'missing_review_gate' }],
}, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'source-truth-acquisition-audit.json'), JSON.stringify({ status: 'review' }, null, 2));
fs.writeFileSync(path.join(learningReviewProject, 'reports', 'route-contract-audit.json'), JSON.stringify({ status: 'pass' }, null, 2));

const learningSecondReviewProject = path.join(learningFixtureRoot, 'logo-review-gap-repeat-project');
fs.cpSync(learningReviewProject, learningSecondReviewProject, { recursive: true });

const learningInvalidProject = path.join(learningFixtureRoot, 'missing-export-project');
fs.mkdirSync(path.join(learningInvalidProject, 'reports'), { recursive: true });
fs.writeFileSync(path.join(learningInvalidProject, 'reports', 'project-summary.json'), JSON.stringify({ status: 'complete' }, null, 2));

const learningFixtureProject = path.join(learningFixtureRoot, 'test-p12345');
fs.mkdirSync(path.join(learningFixtureProject, 'reports'), { recursive: true });
fs.writeFileSync(path.join(learningFixtureProject, 'reports', 'project-summary.json'), JSON.stringify({ status: 'fixture' }, null, 2));

const {
  buildNormalizedProjectIndex,
  buildPromotionCandidates,
  scanProjectRoots,
} = require('./utils/learning-evidence-core');

const scannedLearningRoots = scanProjectRoots(learningFixtureRoot);
assert(scannedLearningRoots.includes(learningSuccessProject), 'learning scanner should include project folders with reports');
assert(scannedLearningRoots.includes(learningInvalidProject), 'learning scanner should include invalid samples for reporting');

const learningIndex = buildNormalizedProjectIndex(learningFixtureRoot);
assert(learningIndex.output_root === learningFixtureRoot, 'learning index should record output root');
assert(learningIndex.summary.total_projects === 5, `learning index should count 5 fixture projects, got ${learningIndex.summary.total_projects}`);
assert(learningIndex.summary.classification_counts.success === 1, 'learning index should count one success');
assert(learningIndex.summary.classification_counts.blocker === 2, 'learning index should count two blocker projects');
assert(learningIndex.summary.classification_counts.invalid_sample === 1, 'learning index should count one invalid sample');
assert(learningIndex.summary.classification_counts.exploration === 1, 'learning index should count one random exploration project');
assert(learningIndex.summary.score_stats.median === 82, 'learning index should compute score median from scored projects');

const learningPromotions = buildPromotionCandidates(learningIndex.projects);
assert(learningPromotions.some((candidate) => candidate.type === 'promote_to_test' && candidate.id === 'failure-missing-review-gate'), 'repeated missing_review_gate should promote to test');
assert(learningPromotions.some((candidate) => candidate.type === 'keep_as_review_gap' && candidate.id === 'review-source-truth'), 'repeated source-truth review should stay review gap');
assert(learningPromotions.some((candidate) => candidate.type === 'needs_more_training' && candidate.id === 'visual-success-pattern'), 'successful project pattern should request more training before rule promotion');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: fail because `scanProjectRoots`, `buildNormalizedProjectIndex`, or `buildPromotionCandidates` is not exported.

- [ ] **Step 3: Extend `learning-evidence-core.js`**

Append these functions before `module.exports`:

```js
function scanProjectRoots(outputRoot) {
  if (!outputRoot || !fs.existsSync(outputRoot)) return [];
  return fs.readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(outputRoot, entry.name))
    .filter((projectRoot) => path.basename(projectRoot) !== 'imagegen-tdd-learning-lab')
    .filter((projectRoot) => fs.existsSync(path.join(projectRoot, 'reports')) || fs.existsSync(path.join(projectRoot, 'html')) || fs.existsSync(path.join(projectRoot, 'exports')));
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function scoreStats(projects) {
  const scores = projects
    .map((project) => project.visual.score)
    .filter((score) => Number.isFinite(score))
    .sort((a, b) => a - b);
  if (!scores.length) return { count: 0, min: null, median: null, max: null, average: null, at_or_above_75: 0, below_75: 0 };
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return {
    count: scores.length,
    min: scores[0],
    median: scores[Math.floor((scores.length - 1) / 2)],
    max: scores[scores.length - 1],
    average: Number(average.toFixed(1)),
    at_or_above_75: scores.filter((score) => score >= 75).length,
    below_75: scores.filter((score) => score < 75).length,
  };
}

function collectFailureTypes(project) {
  const failures = [];
  for (const reportName of ['asset-readiness-audit.json', 'source-truth-acquisition-audit.json', 'route-contract-audit.json']) {
    const report = safeReadJson(reportPath(project.project_root, reportName));
    for (const failure of report?.failures || []) {
      if (failure.code || failure.type) failures.push(failure.code || failure.type);
    }
    for (const asset of report?.assets || []) {
      for (const failure of asset.failures || []) {
        if (failure.code || failure.type) failures.push(failure.code || failure.type);
      }
    }
  }
  return failures;
}

function buildPromotionCandidates(projects) {
  const candidates = [];
  const failureCounts = {};
  const reviewCounts = {};
  for (const project of projects.filter((item) => item.classification !== 'exploration' && item.classification !== 'fixture')) {
    for (const failure of project.failure_types || []) {
      failureCounts[failure] = failureCounts[failure] || [];
      failureCounts[failure].push(project.project_id);
    }
    for (const [gate, status] of Object.entries(project.gates)) {
      if (status === 'review') {
        const key = `review-${gate.replace(/_/g, '-')}`;
        reviewCounts[key] = reviewCounts[key] || [];
        reviewCounts[key].push(project.project_id);
      }
    }
  }
  for (const [failure, evidenceProjects] of Object.entries(failureCounts)) {
    if (evidenceProjects.length >= 2) {
      candidates.push({
        id: `failure-${failure.replace(/_/g, '-')}`,
        type: 'promote_to_test',
        title: `Repeated failure: ${failure}`,
        evidence_projects: evidenceProjects,
        failure_or_rule: failure,
        recommended_next_action: `Add a RED test for repeated ${failure}.`,
        confidence: 'high',
      });
    }
  }
  for (const [reviewKey, evidenceProjects] of Object.entries(reviewCounts)) {
    if (evidenceProjects.length >= 2) {
      candidates.push({
        id: reviewKey,
        type: 'keep_as_review_gap',
        title: `Repeated review gate: ${reviewKey.slice('review-'.length)}`,
        evidence_projects: evidenceProjects,
        failure_or_rule: reviewKey,
        recommended_next_action: 'Keep as review gap until blocking condition and required evidence are available.',
        confidence: 'medium',
      });
    }
  }
  const successProjects = projects.filter((project) => project.classification === 'success').map((project) => project.project_id);
  if (successProjects.length) {
    candidates.push({
      id: 'visual-success-pattern',
      type: successProjects.length >= 2 ? 'promote_to_skill_rule' : 'needs_more_training',
      title: 'Successful hard-gated visual reconstruction pattern',
      evidence_projects: successProjects,
      failure_or_rule: 'visual score >= 75 with hard gates passing',
      recommended_next_action: successProjects.length >= 2
        ? 'Document the stable reconstruction pattern in SKILL.md or references.'
        : 'Run another non-fixture project with the same pattern before promoting to a rule.',
      confidence: successProjects.length >= 2 ? 'medium' : 'low',
    });
  }
  return candidates;
}

function buildNormalizedProjectIndex(outputRoot) {
  const projects = scanProjectRoots(outputRoot).map((projectRoot) => {
    const project = normalizeProjectEvidence(projectRoot);
    project.failure_types = collectFailureTypes(project);
    return project;
  });
  const promotionCandidates = buildPromotionCandidates(projects);
  return {
    generated_at: new Date().toISOString(),
    output_root: outputRoot,
    schema_version: 1,
    summary: {
      total_projects: projects.length,
      classification_counts: countBy(projects, (project) => project.classification),
      gate_counts: {
        dom_editability: countBy(projects, (project) => project.gates.dom_editability),
        overflow: countBy(projects, (project) => project.gates.overflow),
        asset_readiness: countBy(projects, (project) => project.gates.asset_readiness),
        source_truth: countBy(projects, (project) => project.gates.source_truth),
      },
      score_stats: scoreStats(projects),
      promotion_candidate_count: promotionCandidates.length,
    },
    projects,
    promotion_candidates: promotionCandidates,
  };
}
```

Update `module.exports`:

```js
module.exports = {
  buildNormalizedProjectIndex,
  buildPromotionCandidates,
  classifyProject,
  extractScore,
  normalizeProjectEvidence,
  normalizeStatus,
  safeReadJson,
  scanProjectRoots,
};
```

- [ ] **Step 4: Run the tests and verify Task 2 passes**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add skills/text2html-image/scripts/test.js skills/text2html-image/scripts/utils/learning-evidence-core.js
git commit -m "feat: index learning evidence"
```

## Task 3: Learning Index CLI

**Files:**
- Create: `skills/text2html-image/scripts/learning-index.js`
- Modify: `skills/text2html-image/package.json`
- Modify: `skills/text2html-image/scripts/test.js`

**Interfaces:**
- Consumes:
  - `buildNormalizedProjectIndex(outputRoot: string): NormalizedProjectIndex`
- Produces:
  - CLI `npm run learning:index -- --root <output-root> [--report <path>]`
  - Report file `imagegen-tdd-learning-lab/reports/normalized-project-index.json`

- [ ] **Step 1: Add failing package and CLI tests**

In `skills/text2html-image/scripts/test.js`, add `learning-index.js` to the script existence array:

```js
'learning-index.js',
```

Add package assertion near other script assertions:

```js
assert(packageJson.scripts['learning:index'] === 'node scripts/learning-index.js', 'package.json missing learning:index script');
```

Add this CLI test after Task 2 tests:

```js
const learningIndexCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'learning-index.js'),
  '--root', learningFixtureRoot,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(learningIndexCliOutput.includes('Learning index written:'), 'learning index CLI should report output path');
const learningIndexReportPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'normalized-project-index.json');
const learningIndexReport = JSON.parse(fs.readFileSync(learningIndexReportPath, 'utf8'));
assert(learningIndexReport.summary.total_projects === 5, 'learning index CLI should write normalized project index');
assert(learningIndexReport.promotion_candidates.length >= 2, 'learning index CLI should include promotion candidates');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: fail because `scripts/learning-index.js` or `learning:index` does not exist.

- [ ] **Step 3: Create `learning-index.js`**

Create `skills/text2html-image/scripts/learning-index.js`:

```js
#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { buildNormalizedProjectIndex } = require('./utils/learning-evidence-core');

function usage() {
  return [
    'Usage: npm run learning:index -- --root <text2html-image-project-root> [--report <normalized-project-index.json>]',
    '',
    'Builds a read-only normalized index from existing training projects.',
  ].join('\n');
}

function defaultOutputRoot() {
  return path.join(os.homedir(), 'Documents', 'text2html-image-project');
}

function defaultReportPath(outputRoot) {
  return path.join(outputRoot, 'imagegen-tdd-learning-lab', 'reports', 'normalized-project-index.json');
}

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const outputRoot = path.resolve(String(args.root || defaultOutputRoot()).replace(/^~(?=$|\/)/, os.homedir()));
  if (!fs.existsSync(outputRoot)) {
    console.error(`Output root not found: ${outputRoot}`);
    process.exit(1);
  }
  const index = buildNormalizedProjectIndex(outputRoot);
  const reportPath = args.report ? path.resolve(String(args.report)) : defaultReportPath(outputRoot);
  writeJson(reportPath, index);
  console.log(`Learning index written: ${reportPath}`);
  console.log(`Projects: ${index.summary.total_projects}`);
  console.log(`Promotion candidates: ${index.summary.promotion_candidate_count}`);
}

main();
```

- [ ] **Step 4: Add package script**

In `skills/text2html-image/package.json`, add:

```json
"learning:index": "node scripts/learning-index.js",
```

Place it near the other workflow/audit commands.

- [ ] **Step 5: Run the tests and verify Task 3 passes**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add skills/text2html-image/package.json skills/text2html-image/scripts/test.js skills/text2html-image/scripts/learning-index.js
git commit -m "feat: add learning index command"
```

## Task 4: Productization Report Core And CLI

**Files:**
- Create: `skills/text2html-image/scripts/utils/learning-report-core.js`
- Create: `skills/text2html-image/scripts/learning-report.js`
- Modify: `skills/text2html-image/package.json`
- Modify: `skills/text2html-image/scripts/test.js`

**Interfaces:**
- Consumes:
  - `NormalizedProjectIndex`
- Produces:
  - `buildProductizationReport(index: NormalizedProjectIndex): ProductizationReport`
  - `renderProductizationMarkdown(report: ProductizationReport): string`
  - `renderNextTrainingPlan(report: ProductizationReport): string`
  - CLI `npm run learning:report -- --root <output-root>`

- [ ] **Step 1: Add failing tests for report core and CLI**

In `skills/text2html-image/scripts/test.js`, add this require near the learning evidence require:

```js
const {
  buildProductizationReport,
  renderNextTrainingPlan,
  renderProductizationMarkdown,
} = require('./utils/learning-report-core');
```

Add `learning-report.js` to the script existence array:

```js
'learning-report.js',
```

Add package assertion:

```js
assert(packageJson.scripts['learning:report'] === 'node scripts/learning-report.js', 'package.json missing learning:report script');
```

Append this test block after the learning-index CLI test:

```js
const productizationReport = buildProductizationReport(learningIndexReport);
assert(productizationReport.summary.total_projects === 5, 'productization report should preserve total project count');
assert(productizationReport.assessment.has_clear_progress === true, 'productization report should identify progress when success projects exist');
assert(productizationReport.shortfalls.some((item) => item.includes('asset_readiness')), 'productization report should list asset readiness shortfall');
assert(productizationReport.next_actions[0].includes('Implement'), 'productization report should start with implementation action');

const productizationMarkdown = renderProductizationMarkdown(productizationReport);
assert(productizationMarkdown.includes('# Training Productization Report'), 'productization markdown should have title');
assert(productizationMarkdown.includes('## What To Do Next'), 'productization markdown should include next action section');
assert(productizationMarkdown.includes('Do not resume broad training'), 'productization markdown should stop broad training');

const nextTrainingPlan = renderNextTrainingPlan(productizationReport);
assert(nextTrainingPlan.includes('# Next Training Plan'), 'next training plan should have title');
assert(nextTrainingPlan.includes('Regression case'), 'next training plan should name regression case');

const learningReportCliOutput = require('child_process').execFileSync(process.execPath, [
  path.join(ROOT, 'scripts', 'learning-report.js'),
  '--root', learningFixtureRoot,
], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert(learningReportCliOutput.includes('Training productization report written:'), 'learning report CLI should write markdown report');
const productizationReportPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'training-productization-report.json');
const productizationMarkdownPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'training-productization-report.md');
const promotionCandidatesPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'promotion-candidates.json');
const nextTrainingPlanPath = path.join(learningFixtureRoot, 'imagegen-tdd-learning-lab', 'reports', 'next-training-plan.md');
assert(fs.existsSync(productizationReportPath), 'learning report CLI should write JSON report');
assert(fs.existsSync(productizationMarkdownPath), 'learning report CLI should write markdown report');
assert(fs.existsSync(promotionCandidatesPath), 'learning report CLI should write promotion candidates');
assert(fs.existsSync(nextTrainingPlanPath), 'learning report CLI should write next training plan');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: fail because `learning-report-core` or `learning-report.js` does not exist.

- [ ] **Step 3: Create `learning-report-core.js`**

Create `skills/text2html-image/scripts/utils/learning-report-core.js`:

```js
function gateShortfalls(index) {
  const shortfalls = [];
  const gateCounts = index.summary?.gate_counts || {};
  for (const [gate, counts] of Object.entries(gateCounts)) {
    const weakCount = Number(counts.review || 0) + Number(counts.fail || 0) + Number(counts.missing || 0);
    if (weakCount > 0) shortfalls.push(`${gate}: ${weakCount} review/fail/missing projects`);
  }
  return shortfalls;
}

function bestExamples(projects) {
  return projects
    .filter((project) => project.classification === 'success')
    .sort((a, b) => (b.visual.score || 0) - (a.visual.score || 0))
    .slice(0, 10)
    .map((project) => ({
      project_id: project.project_id,
      score: project.visual.score,
      project_root: project.project_root,
    }));
}

function buildProductizationReport(index) {
  const successCount = index.summary?.classification_counts?.success || 0;
  const candidates = index.promotion_candidates || [];
  const shortfalls = gateShortfalls(index);
  return {
    generated_at: new Date().toISOString(),
    schema_version: 1,
    output_root: index.output_root,
    summary: index.summary,
    assessment: {
      has_clear_progress: successCount > 0 && (index.summary?.score_stats?.at_or_above_75 || 0) > 0,
      progress_summary: successCount > 0
        ? 'Training produced hard-gated success examples and reusable evidence.'
        : 'Training evidence exists, but no hard-gated success examples were found.',
    },
    best_examples: bestExamples(index.projects || []),
    shortfalls,
    promotion_candidates: candidates,
    next_actions: [
      'Implement RED tests for high-confidence promote_to_test candidates.',
      'Promote stable rules to SKILL.md or references only after evidence thresholds are met.',
      'Keep review-gated gaps out of success counts until required evidence exists.',
      'Do not resume broad training until this report is reviewed.',
    ],
  };
}

function renderProductizationMarkdown(report) {
  const lines = [
    '# Training Productization Report',
    '',
    `Generated: ${report.generated_at}`,
    `Output root: \`${report.output_root}\``,
    '',
    '## Assessment',
    '',
    `- Clear progress: \`${report.assessment.has_clear_progress}\``,
    `- Summary: ${report.assessment.progress_summary}`,
    `- Total projects: ${report.summary.total_projects}`,
    `- Scored projects: ${report.summary.score_stats.count}`,
    `- Median visual score: ${report.summary.score_stats.median}`,
    `- Scores >= 75: ${report.summary.score_stats.at_or_above_75}`,
    '',
    '## Best Examples',
    '',
  ];
  if (!report.best_examples.length) {
    lines.push('- None');
  } else {
    for (const example of report.best_examples) {
      lines.push(`- ${example.project_id}: score ${example.score}, \`${example.project_root}\``);
    }
  }
  lines.push('', '## Shortfalls', '');
  if (!report.shortfalls.length) {
    lines.push('- None detected');
  } else {
    for (const shortfall of report.shortfalls) lines.push(`- ${shortfall}`);
  }
  lines.push('', '## Promotion Candidates', '');
  if (!report.promotion_candidates.length) {
    lines.push('- None');
  } else {
    for (const candidate of report.promotion_candidates) {
      lines.push(`- ${candidate.type}: ${candidate.title} (${candidate.evidence_projects.length} projects)`);
    }
  }
  lines.push('', '## What To Do Next', '');
  lines.push('- Do not resume broad training until this report is reviewed.');
  for (const action of report.next_actions) lines.push(`- ${action}`);
  return `${lines.join('\n')}\n`;
}

function renderNextTrainingPlan(report) {
  const firstCandidate = report.promotion_candidates[0];
  const regression = firstCandidate ? firstCandidate.title : 'highest-priority repeated failure from promotion-candidates.json';
  return [
    '# Next Training Plan',
    '',
    'Do not run this plan until P0 learning productization has been reviewed.',
    '',
    `1. Regression case: ${regression}.`,
    '2. Combination case: combine one stable success pattern with one review-gated shortfall.',
    '3. Mini boss case: verify route, DOM, overflow, source-truth, asset readiness, export, and visual gates together.',
    '',
  ].join('\n');
}

module.exports = {
  buildProductizationReport,
  renderNextTrainingPlan,
  renderProductizationMarkdown,
};
```

- [ ] **Step 4: Create `learning-report.js`**

Create `skills/text2html-image/scripts/learning-report.js`:

```js
#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { buildNormalizedProjectIndex } = require('./utils/learning-evidence-core');
const {
  buildProductizationReport,
  renderNextTrainingPlan,
  renderProductizationMarkdown,
} = require('./utils/learning-report-core');

function usage() {
  return [
    'Usage: npm run learning:report -- --root <text2html-image-project-root>',
    '',
    'Writes productization JSON, markdown, promotion candidates, and next-training plan reports.',
  ].join('\n');
}

function defaultOutputRoot() {
  return path.join(os.homedir(), 'Documents', 'text2html-image-project');
}

function expandRoot(root) {
  return path.resolve(String(root || defaultOutputRoot()).replace(/^~(?=$|\/)/, os.homedir()));
}

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const outputRoot = expandRoot(args.root);
  if (!fs.existsSync(outputRoot)) {
    console.error(`Output root not found: ${outputRoot}`);
    process.exit(1);
  }
  const reportsDir = path.join(outputRoot, 'imagegen-tdd-learning-lab', 'reports');
  const index = buildNormalizedProjectIndex(outputRoot);
  const report = buildProductizationReport(index);
  const indexPath = path.join(reportsDir, 'normalized-project-index.json');
  const jsonPath = path.join(reportsDir, 'training-productization-report.json');
  const markdownPath = path.join(reportsDir, 'training-productization-report.md');
  const promotionsPath = path.join(reportsDir, 'promotion-candidates.json');
  const nextTrainingPath = path.join(reportsDir, 'next-training-plan.md');
  writeJson(indexPath, index);
  writeJson(jsonPath, report);
  writeJson(promotionsPath, report.promotion_candidates);
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(markdownPath, renderProductizationMarkdown(report), 'utf8');
  fs.writeFileSync(nextTrainingPath, renderNextTrainingPlan(report), 'utf8');
  console.log(`Training productization report written: ${markdownPath}`);
  console.log(`Training productization JSON written: ${jsonPath}`);
  console.log(`Promotion candidates written: ${promotionsPath}`);
  console.log(`Next training plan written: ${nextTrainingPath}`);
}

main();
```

- [ ] **Step 5: Add package script**

In `skills/text2html-image/package.json`, add:

```json
"learning:report": "node scripts/learning-report.js",
```

- [ ] **Step 6: Run the tests and verify Task 4 passes**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add skills/text2html-image/package.json skills/text2html-image/scripts/test.js skills/text2html-image/scripts/learning-report.js skills/text2html-image/scripts/utils/learning-report-core.js
git commit -m "feat: report training productization"
```

## Task 5: Skill Documentation And Real Output Verification

**Files:**
- Modify: `skills/text2html-image/SKILL.md`
- Modify: `skills/text2html-image/scripts/test.js`

**Interfaces:**
- Consumes:
  - CLI commands from Tasks 3 and 4.
- Produces:
  - Documented operator workflow for `learning:index` and `learning:report`.

- [ ] **Step 1: Add failing documentation tests**

In `skills/text2html-image/scripts/test.js`, add these assertions near other `skillBody.includes(...)` command assertions:

```js
assert(skillBody.includes('npm run learning:index'), 'skill must document learning:index command');
assert(skillBody.includes('npm run learning:report'), 'skill must document learning:report command');
assert(skillBody.includes('Do not resume broad ImageGen training until the learning report exists'), 'skill must block broad training before productization report');
assert(skillBody.includes('promotion-candidates.json'), 'skill must document promotion candidates output');
assert(skillBody.includes('training-productization-report.md'), 'skill must document training productization report output');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: fail because `SKILL.md` does not document the learning commands yet.

- [ ] **Step 3: Update `SKILL.md`**

Add this section after the project workspace or command-list section:

```markdown
## Training Productization

Use the learning productization commands after an ImageGen-TDD training loop has generated many project folders and before starting another broad training round.

Do not resume broad ImageGen training until the learning report exists.

Run from the skill root:

```bash
npm run learning:index -- --root ~/Documents/text2html-image-project
npm run learning:report -- --root ~/Documents/text2html-image-project
```

The commands are read-only for historical project folders. They write reports under:

```text
~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/
```

Expected report outputs:

- `normalized-project-index.json`
- `training-productization-report.json`
- `training-productization-report.md`
- `promotion-candidates.json`
- `next-training-plan.md`

Use `promotion-candidates.json` to decide the next RED tests, skill/reference rules, and three-project training round. Do not count a project as a success when visual similarity passes but DOM, source-truth, route, export, or asset readiness gates fail.
```

If this section is placed inside a fenced code block by accident, move it so Markdown renders normally.

- [ ] **Step 4: Run tests**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: pass.

- [ ] **Step 5: Run real read-only report commands**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm run learning:index -- --root ~/Documents/text2html-image-project
npm run learning:report -- --root ~/Documents/text2html-image-project
```

Expected:

- `~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/normalized-project-index.json` exists.
- `~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/training-productization-report.md` exists.
- `~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/promotion-candidates.json` exists.
- `~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/next-training-plan.md` exists.
- Existing project folders are not rewritten.

- [ ] **Step 6: Inspect the real report summary**

Run:

```bash
sed -n '1,180p' ~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/training-productization-report.md
```

Expected: report includes `Assessment`, `Best Examples`, `Shortfalls`, `Promotion Candidates`, and `What To Do Next`.

- [ ] **Step 7: Commit Task 5**

```bash
git add skills/text2html-image/SKILL.md skills/text2html-image/scripts/test.js
git commit -m "docs: document training productization workflow"
```

## Task 6: Final Verification And Handoff

**Files:**
- No new source files.
- Verify generated reports under `~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/`.

**Interfaces:**
- Consumes:
  - Commands from Tasks 3 and 4.
  - Documentation from Task 5.
- Produces:
  - Final verification evidence and next execution recommendation.

- [ ] **Step 1: Run full tests**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm test
```

Expected: pass.

- [ ] **Step 2: Run learning reports on real output root**

Run:

```bash
cd /Users/tsimclaw/Develop/text2html-image/skills/text2html-image
npm run learning:index -- --root ~/Documents/text2html-image-project
npm run learning:report -- --root ~/Documents/text2html-image-project
```

Expected: both commands exit 0 and print report paths.

- [ ] **Step 3: Verify generated report files**

Run:

```bash
test -s ~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/normalized-project-index.json
test -s ~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/training-productization-report.json
test -s ~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/training-productization-report.md
test -s ~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/promotion-candidates.json
test -s ~/Documents/text2html-image-project/imagegen-tdd-learning-lab/reports/next-training-plan.md
```

Expected: no output and exit 0.

- [ ] **Step 4: Summarize report counts**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const root = path.join(process.env.HOME, 'Documents/text2html-image-project/imagegen-tdd-learning-lab/reports');
const index = JSON.parse(fs.readFileSync(path.join(root, 'normalized-project-index.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(root, 'training-productization-report.json'), 'utf8'));
console.log(JSON.stringify({
  total_projects: index.summary.total_projects,
  classification_counts: index.summary.classification_counts,
  score_stats: index.summary.score_stats,
  promotion_candidates: report.promotion_candidates.length,
  clear_progress: report.assessment.has_clear_progress
}, null, 2));
NODE
```

Expected: JSON with nonzero `total_projects` and a boolean `clear_progress`.

- [ ] **Step 5: Confirm no final commit is needed**

Task 6 should only generate reports under `~/Documents/text2html-image-project`, which is outside the repo. Do not commit generated reports. Check the repo status:

```bash
git status --short
```

Expected: no new tracked source changes from Task 6. If this command shows a tracked source change caused by final verification, stop and return to the task that introduced that change; fix it there and re-run that task's test cycle.

- [ ] **Step 6: Handoff summary**

Final response should include:

- Plan tasks completed.
- `npm test` result.
- Real report output paths.
- Top promotion candidate count.
- Reminder that the next training round should be chosen from `next-training-plan.md`.

Do not say broad training should resume until the productization report has been reviewed.
