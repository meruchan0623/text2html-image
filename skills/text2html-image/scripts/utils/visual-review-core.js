const fs = require('fs');
const path = require('path');

const SCORE_FIELDS = ['overall_score', 'layout_score', 'typography_score', 'color_score', 'asset_score', 'text_legibility_score'];
const ISSUE_FIELDS = ['severity', 'area', 'observed', 'expected', 'evidence', 'fix_hint'];

function padRound(round) {
  return String(round).padStart(2, '0');
}

function validateScoreField(report, field, errors) {
  if (typeof report[field] !== 'number' || report[field] < 0 || report[field] > 100) {
    errors.push(`${field} must be a number from 0 to 100`);
  }
}

function validateVisualReviewReport(report) {
  const errors = [];
  for (const field of SCORE_FIELDS) validateScoreField(report, field, errors);
  if (!Array.isArray(report.issues)) {
    errors.push('issues must be an array');
  } else {
    report.issues.forEach((issue, index) => {
      for (const field of ISSUE_FIELDS) {
        if (!issue || typeof issue[field] !== 'string' || !issue[field].trim()) {
          errors.push(`issues[${index}].${field} must be a non-empty string`);
        }
      }
    });
  }
  if (typeof report.next_action !== 'string' || !report.next_action.trim()) {
    errors.push('next_action must be a non-empty string');
  }
  return { errors };
}

function loadDomStatus(projectPaths) {
  const domReportPath = path.join(projectPaths.reports, 'dom-editability-report.json');
  if (!fs.existsSync(domReportPath)) return { status: 'missing', path: domReportPath };
  const report = JSON.parse(fs.readFileSync(domReportPath, 'utf8'));
  return { status: report.status || 'review', path: domReportPath };
}

function finalizeVisualReview(report, projectPaths) {
  const validation = validateVisualReviewReport(report);
  if (validation.errors.length) {
    return {
      ...report,
      status: 'fail',
      validation_errors: validation.errors,
    };
  }
  const dom = loadDomStatus(projectPaths);
  const issueStatus = report.issues.length ? 'review' : 'pass';
  return {
    ...report,
    status: dom.status === 'fail' ? 'fail' : issueStatus,
    dom_report: dom.path,
    dom_status: dom.status,
    validation_errors: [],
  };
}

module.exports = {
  finalizeVisualReview,
  padRound,
  validateVisualReviewReport,
};
