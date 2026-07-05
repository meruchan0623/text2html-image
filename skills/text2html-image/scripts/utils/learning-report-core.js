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
