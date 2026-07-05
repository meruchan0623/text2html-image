const SOURCE_TRUTH_KINDS = new Set(['qr', 'qr_code', 'barcode', 'payment_logo', 'country_flag', 'app_icon', 'application_icon']);
const REQUIRED_FORBIDDEN_ACTIONS = ['regenerated_image', 'approximate_redraw', 'editable_vector'];
const ALLOWED_SOURCE_TYPES = new Set(['user_provided_asset', 'licensed_asset', 'reference_cutout', 'source_bitmap', 'review_required']);
const ALLOWED_FINAL_SOURCE_TYPES = new Set(['user_provided_asset', 'licensed_asset', 'reference_cutout', 'source_bitmap']);
const FORBIDDEN_FINAL_SOURCE_TYPES = new Set(['regenerated_image', 'approximate_redraw', 'editable_vector', 'prompt_only', 'ai_generated_flag']);

function normalize(value) {
  return String(value || '').trim();
}

function normalizeKind(kind) {
  return normalize(kind).toLowerCase();
}

function routeSet(entry) {
  const routes = new Set((Array.isArray(entry.allowed_routes) ? entry.allowed_routes : []).map(normalize).filter(Boolean));
  if (entry.expected_route) routes.add(normalize(entry.expected_route));
  return routes;
}

function isSourceTruthRequired(entry) {
  const kind = normalizeKind(entry.kind || entry.asset_type);
  if (SOURCE_TRUTH_KINDS.has(kind)) return true;
  const routes = routeSet(entry);
  return routes.has('review') && ['payment_logo', 'country_flag', 'app_icon', 'application_icon'].includes(kind);
}

function collectEntries(provenance) {
  return [
    ...(Array.isArray(provenance?.assets) ? provenance.assets : []),
    ...(Array.isArray(provenance?.dom_assets) ? provenance.dom_assets : []),
  ];
}

function idFor(entry) {
  return normalize(entry?.id || entry?.asset_id || entry?.route_target);
}

function isFinalReady(entry) {
  return Boolean(entry && (entry.final_asset_ready === true || entry.status === 'accepted_for_html' || entry.accepted === true));
}

function reviewCoverageSet(reviewGateAudit, provenance) {
  const covered = new Set();
  if (Array.isArray(provenance?.review_gated_assets)) {
    for (const id of provenance.review_gated_assets) covered.add(normalize(id));
  }
  for (const gate of Array.isArray(reviewGateAudit?.gates) ? reviewGateAudit.gates : []) {
    if (gate.status && gate.status !== 'pass') continue;
    if (gate.asset_id) covered.add(normalize(gate.asset_id));
    for (const id of Array.isArray(gate.review_covers) ? gate.review_covers : []) covered.add(normalize(id));
  }
  return covered;
}

function planEntries(acquisitionPlan) {
  return Array.isArray(acquisitionPlan?.assets) ? acquisitionPlan.assets : [];
}

function planById(acquisitionPlan) {
  return new Map(planEntries(acquisitionPlan).map((entry) => [idFor(entry), entry]).filter(([id]) => id));
}

function auditPlanEntry(required, plan) {
  const failures = [];
  const allowed = new Set((Array.isArray(plan?.allowed_source_types) ? plan.allowed_source_types : []).map(normalize).filter(Boolean));
  const forbidden = new Set((Array.isArray(plan?.forbidden_actions) ? plan.forbidden_actions : []).map(normalize).filter(Boolean));

  if (!plan) {
    failures.push({ code: 'missing_acquisition_plan', message: 'review-gated source-truth asset needs an acquisition plan' });
    return failures;
  }
  if (![...allowed].length) {
    failures.push({ code: 'missing_allowed_source_type', message: 'acquisition plan must list allowed source types' });
  }
  for (const sourceType of allowed) {
    if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
      failures.push({ code: 'unknown_allowed_source_type', message: 'acquisition plan lists an unknown source type', source_type: sourceType });
    }
  }
  for (const action of REQUIRED_FORBIDDEN_ACTIONS) {
    if (!forbidden.has(action)) {
      failures.push({ code: 'missing_forbidden_action', message: 'source-truth acquisition plan must forbid unsafe substitute actions', action });
    }
  }
  if (!normalize(plan.next_action)) {
    failures.push({ code: 'missing_next_action', message: 'acquisition plan must state the next action' });
  }
  if (!normalize(plan.blocking_condition || plan.blocker_type || plan.blocker || plan.blockingCondition)) {
    failures.push({ code: 'missing_blocking_condition', message: 'review-gated source-truth acquisition plan must state the blocking condition' });
  }
  if (!Array.isArray(plan.evidence_required) || plan.evidence_required.map(normalize).filter(Boolean).length === 0) {
    failures.push({ code: 'missing_evidence_required', message: 'review-gated source-truth acquisition plan must list required evidence for promotion' });
  }
  const expectedKind = normalizeKind(required.kind);
  if (plan.kind && normalizeKind(plan.kind) !== expectedKind) {
    failures.push({ code: 'kind_mismatch', message: 'acquisition plan kind does not match expected contract', expected_kind: expectedKind, plan_kind: normalizeKind(plan.kind) });
  }
  return failures;
}

function finalSourceType(entry) {
  const candidates = [
    entry?.source_truth_source_type,
    entry?.asset_source_type,
    entry?.source_type,
    entry?.route,
  ].map(normalize).filter(Boolean);
  return candidates.find((candidate) => ALLOWED_FINAL_SOURCE_TYPES.has(candidate))
    || candidates.find((candidate) => FORBIDDEN_FINAL_SOURCE_TYPES.has(candidate))
    || candidates[0]
    || '';
}

function hasFinalSourcePath(entry) {
  return Boolean(normalize(
    entry?.source_path
    || entry?.sourcePath
    || entry?.source
    || entry?.path
    || entry?.output_path
    || entry?.outputPath
    || entry?.src
  ));
}

function hasChecksum(entry) {
  return Boolean(normalize(entry?.sha256 || entry?.checksum || entry?.checksum_sha256));
}

function hasDimensions(entry) {
  const width = Number(entry?.width ?? entry?.dimensions?.width);
  const height = Number(entry?.height ?? entry?.dimensions?.height);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
}

function hasSourceScope(entry) {
  return Boolean(normalize(
    entry?.source_truth_scope
    || entry?.sourceTruthScope
    || entry?.license_scope
    || entry?.licenseScope
    || entry?.source_scope
    || entry?.sourceScope
    || entry?.fixture_scope
    || entry?.fixtureScope
    || entry?.license
    || entry?.usage_rights
    || entry?.usageRights
  ));
}

function auditFinalSourceTruthEntry(entry) {
  const failures = [];
  const sourceType = finalSourceType(entry);

  if (!sourceType) {
    failures.push({ code: 'missing_final_source_type', message: 'final source-truth asset must declare a source type or source route' });
  } else if (FORBIDDEN_FINAL_SOURCE_TYPES.has(sourceType)) {
    failures.push({ code: 'forbidden_final_source_type', message: 'final source-truth asset uses a forbidden source type', source_type: sourceType });
  } else if (!ALLOWED_FINAL_SOURCE_TYPES.has(sourceType)) {
    failures.push({ code: 'unknown_final_source_type', message: 'final source-truth asset uses an unknown source type', source_type: sourceType });
  }

  if (!hasFinalSourcePath(entry)) {
    failures.push({ code: 'missing_final_source_path', message: 'final source-truth asset must include a source/output path' });
  }
  if (!hasDimensions(entry)) {
    failures.push({ code: 'missing_final_dimensions', message: 'final source-truth asset must include pixel dimensions' });
  }
  if (!hasChecksum(entry)) {
    failures.push({ code: 'missing_final_checksum', message: 'final source-truth asset must include checksum evidence' });
  }
  if (!hasSourceScope(entry)) {
    failures.push({ code: 'missing_final_source_scope', message: 'final source-truth asset must include license/source scope evidence' });
  }
  if (failures.length) {
    failures.unshift({ code: 'missing_final_source_metadata', message: 'final source-truth asset needs source type, path, dimensions, checksum, and license/source scope evidence' });
  }
  return failures;
}

function auditSourceTruthAcquisitionPlan({ expectedContract, provenance, reviewGateAudit, acquisitionPlan } = {}) {
  const requiredRoutes = Array.isArray(expectedContract?.required_routes) ? expectedContract.required_routes : [];
  const provenanceEntries = collectEntries(provenance);
  const coveredByReview = reviewCoverageSet(reviewGateAudit, provenance);
  const plans = planById(acquisitionPlan);
  const assets = [];

  for (const required of requiredRoutes) {
    const assetId = normalize(required.element_id || required.id);
    if (!isSourceTruthRequired(required)) continue;
    const entries = provenanceEntries.filter((entry) => idFor(entry) === assetId);
    const finalEntry = entries.find(isFinalReady) || null;
    const reviewGateFound = coveredByReview.has(assetId);
    const plan = plans.get(assetId) || null;
    let status = 'pass';
    let readiness = 'final_asset_ready';
    let failures = [];

    if (finalEntry) {
      failures = auditFinalSourceTruthEntry(finalEntry);
      status = failures.length ? 'fail' : 'pass';
      readiness = failures.length ? 'final_asset_missing_source_metadata' : 'final_asset_ready';
    } else {
      if (reviewGateFound) {
        readiness = 'review_gated_acquisition';
        failures = auditPlanEntry(required, plan);
        status = failures.length ? 'fail' : 'review';
      } else {
        readiness = 'missing_final_or_review_gate';
        failures.push({ code: 'missing_review_gate', message: 'non-final source-truth asset needs review-gate coverage before acquisition planning can be accepted' });
        failures.push({ code: 'missing_acquisition_plan', message: 'non-final source-truth asset needs an acquisition plan' });
        status = 'fail';
      }
    }

    assets.push({
      asset_id: assetId || null,
      kind: required.kind || null,
      readiness,
      status,
      final_asset_found: Boolean(finalEntry),
      review_gate_found: reviewGateFound,
      acquisition_plan_found: Boolean(plan),
      failures,
    });
  }

  const failures = assets.flatMap((asset) => asset.failures.map((failure) => ({ asset_id: asset.asset_id, ...failure })));
  const failCount = assets.filter((asset) => asset.status === 'fail').length;
  const reviewCount = assets.filter((asset) => asset.status === 'review').length;
  return {
    generated_at: new Date().toISOString(),
    case_id: expectedContract?.case_id || null,
    status: failCount ? 'fail' : reviewCount ? 'review' : 'pass',
    summary: {
      asset_count: assets.length,
      pass_count: assets.filter((asset) => asset.status === 'pass').length,
      review_count: reviewCount,
      fail_count: failCount,
      failure_count: failures.length,
      failure_types: [...new Set(failures.map((failure) => failure.code))].sort(),
    },
    assets,
    failures,
  };
}

module.exports = {
  auditSourceTruthAcquisitionPlan,
};
