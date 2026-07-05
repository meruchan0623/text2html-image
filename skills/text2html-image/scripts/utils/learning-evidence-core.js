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
      export: existingPath(projectRoot, 'exports/index.png') ? (normalizeGate(exportReport) === 'fail' ? 'fail' : 'pass') : 'missing',
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
