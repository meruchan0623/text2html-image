#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createProjectWorkspace, parseArgs, writeJson } = require('./utils/workflow-core');
const { buildImagegenCandidateReport } = require('./utils/imagegen-candidate-core');

function usage() {
  return [
    'Usage: npm run audit:imagegen -- --input <candidates.json> [--report <report.json>] [--project <project-id>] [--subproject <subproject-id>]',
    '',
    'The input JSON must include a candidates array. Each candidate needs output_path, id, route_target, and prompt metadata.',
  ].join('\n');
}

function normalizeCandidate(candidate, inputDir) {
  const outputPath = candidate.output_path || candidate.outputPath;
  return {
    ...candidate,
    outputPath: outputPath && !path.isAbsolute(String(outputPath))
      ? path.resolve(inputDir, String(outputPath))
      : outputPath,
    routeTarget: candidate.route_target || candidate.routeTarget,
    sourceReferenceRole: candidate.source_reference_role || candidate.sourceReferenceRole,
  };
}

function main() {
  const args = parseArgs();
  if (args.help || !args.input) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(String(args.input));
  if (!fs.existsSync(inputPath)) {
    console.error(`Candidate input not found: ${inputPath}`);
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(input.candidates)) {
    console.error('Candidate input must include a candidates array.');
    process.exit(1);
  }

  const inputDir = path.dirname(inputPath);
  const candidates = input.candidates.map((candidate) => normalizeCandidate(candidate, inputDir));
  const report = {
    case_id: input.case_id || input.subproject_id || args.subproject || null,
    input_path: inputPath,
    ...buildImagegenCandidateReport(candidates),
  };

  let reportPath = args.report ? path.resolve(String(args.report)) : null;
  if (!reportPath) {
    const projectPaths = createProjectWorkspace(args.project, { subprojectId: args.subproject });
    reportPath = path.join(projectPaths.reports, 'imagegen-candidates.json');
    report.project_id = projectPaths.project_id;
    report.subproject_id = projectPaths.subproject_id || null;
  }
  writeJson(reportPath, report);

  console.log(`ImageGen candidate audit written: ${reportPath}`);
  console.log(`ImageGen candidate status: ${report.status}`);
  console.log(`Accepted: ${report.summary.accepted}; rejected: ${report.summary.rejected}`);
}

main();
