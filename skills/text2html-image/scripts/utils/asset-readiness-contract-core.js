const ASSET_ROUTES = new Set(['reference_cutout', 'regenerated_image', 'locked_base_layer', 'review']);
const NON_ASSET_ROUTES = new Set(['editable_text', 'editable_vector', 'omit_or_simplify']);
const SOURCE_TRUTH_KINDS = new Set(['qr', 'qr_code', 'barcode', 'payment_logo', 'country_flag', 'app_icon', 'application_icon']);

function stringSet(values) {
  return new Set((Array.isArray(values) ? values : []).map((value) => String(value || '')).filter(Boolean));
}

function routeSet(entry) {
  const routes = stringSet(entry.allowed_routes);
  if (entry.expected_route) routes.add(String(entry.expected_route));
  return routes;
}

function requiresAssetReadiness(entry) {
  const routes = routeSet(entry);
  if ([...routes].some((route) => ASSET_ROUTES.has(route))) return true;
  if ([...routes].length && [...routes].every((route) => NON_ASSET_ROUTES.has(route))) return false;
  return SOURCE_TRUTH_KINDS.has(String(entry.kind || '').toLowerCase());
}

function collectEntries(provenance) {
  return [
    ...(Array.isArray(provenance?.assets) ? provenance.assets : []),
    ...(Array.isArray(provenance?.dom_assets) ? provenance.dom_assets : []),
  ];
}

function idFor(entry) {
  return String(entry?.id || entry?.asset_id || entry?.route_target || '').trim();
}

function isFinalReady(entry) {
  return Boolean(entry && (entry.final_asset_ready === true || entry.status === 'accepted_for_html' || entry.accepted === true));
}

function acceptedCandidateFor(candidates, assetId) {
  return candidates.find((candidate) => {
    const target = String(candidate.route_target || candidate.routeTarget || candidate.asset_id || '').trim();
    return target === assetId && (candidate.accepted === true || candidate.status === 'accepted') && candidate.blocked_from_final_html !== true;
  }) || null;
}

function candidateListFor(candidates, assetId) {
  return candidates.filter((candidate) => {
    const target = String(candidate.route_target || candidate.routeTarget || candidate.asset_id || '').trim();
    return target === assetId;
  });
}

function reviewCoverageSet(reviewGateAudit, provenance) {
  const covered = new Set();
  if (Array.isArray(provenance?.review_gated_assets)) {
    for (const id of provenance.review_gated_assets) covered.add(String(id));
  }
  for (const gate of Array.isArray(reviewGateAudit?.gates) ? reviewGateAudit.gates : []) {
    if (gate.status && gate.status !== 'pass') continue;
    if (gate.asset_id) covered.add(String(gate.asset_id));
    for (const id of Array.isArray(gate.review_covers) ? gate.review_covers : []) covered.add(String(id));
  }
  return covered;
}

function routingById(routingTable) {
  const elements = Array.isArray(routingTable?.elements) ? routingTable.elements : [];
  return new Map(elements.map((element) => [String(element.id || element.element_id || ''), element]).filter(([id]) => id));
}

function hasFlattenedTextConflict(required, routingEntry, entries) {
  const signals = new Set([
    ...(Array.isArray(required?.difficulty_signals) ? required.difficulty_signals : []),
    ...(Array.isArray(routingEntry?.difficulty_signals) ? routingEntry.difficulty_signals : []),
    ...entries.flatMap((entry) => Array.isArray(entry.difficulty_signals) ? entry.difficulty_signals : []),
  ].map(String));
  return Boolean(
    String(required?.kind || '').toLowerCase() === 'photo_background'
    && (
      signals.has('flattened_text_conflicts_dom_overlay')
      || routingEntry?.route === 'review'
      || routingEntry?.status === 'review'
      || entries.some((entry) => entry.contains_flattened_text === true && entry.requires_dom_overlay === true)
    )
  );
}

function hasCleanLockedBaseProof(entries) {
  return entries.some((entry) => (
    entry.final_asset_ready === true
    && entry.route === 'locked_base_layer'
    && (
      entry.clean_base_layer === true
      || entry.contains_flattened_text === false
      || entry.text_removed === true
      || entry.no_text_base_layer === true
    )
  ));
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function dimensionsWithChecksum(entry) {
  const dimensions = entry.dimensions || {};
  return Boolean(
    (Number(entry.width || dimensions.width) > 0)
    && (Number(entry.height || dimensions.height) > 0)
    && hasValue(entry.sha256 || dimensions.sha256 || entry.checksum || dimensions.checksum)
  );
}

function regeneratedLockedBaseIssues(entry) {
  if (!entry || entry.route !== 'locked_base_layer' || entry.asset_source_type !== 'regenerated_image') return [];
  const issues = [];
  if (entry.clean_base_layer !== true) issues.push('missing_clean_base_layer_true');
  if (entry.no_text_base_layer !== true && entry.contains_flattened_text !== false) issues.push('missing_no_text_base_proof');
  if (!hasValue(entry.path || entry.output_path || entry.src)) issues.push('missing_output_path');
  if (!hasValue(entry.source_path || entry.source_image || entry.source_reference)) issues.push('missing_source_path');
  if (!dimensionsWithChecksum(entry)) issues.push('missing_dimensions_or_checksum');
  return issues;
}

function hasPoseFidelityProof(entries) {
  return entries.some((entry) => (
    entry.pose_fidelity_review === true
    || entry.pose_fidelity_verified === true
    || entry.pose_scale_review === true
    || entry.relative_scale_review === true
    || entry.source_guided_pose === true
    || entry.reference_pose_matched === true
    || entry.pose_fidelity_status === 'pass'
  ));
}

function childEntriesFor(provenanceEntries, assetId) {
  return provenanceEntries.filter((entry) => {
    const parentId = String(entry.parent_asset_id || entry.parent_id || entry.group_id || '').trim();
    return parentId === assetId;
  });
}

function auditAssetReadinessContract({ expectedContract, provenance, imagegenCandidates, reviewGateAudit, routingTable } = {}) {
  const requiredRoutes = Array.isArray(expectedContract?.required_routes) ? expectedContract.required_routes : [];
  const provenanceEntries = collectEntries(provenance);
  const candidates = Array.isArray(imagegenCandidates?.candidates) ? imagegenCandidates.candidates : [];
  const coveredByReview = reviewCoverageSet(reviewGateAudit, provenance);
  const routing = routingById(routingTable);
  const assets = [];

  for (const required of requiredRoutes) {
    const assetId = String(required.element_id || required.id || '').trim();
    const routes = [...routeSet(required)];
    const entries = provenanceEntries.filter((entry) => idFor(entry) === assetId);
    const childEntries = childEntriesFor(provenanceEntries, assetId);
    const routingEntry = routing.get(assetId) || null;
    const finalEntry = entries.find(isFinalReady) || null;
    const regeneratedLockedBaseProblems = finalEntry ? regeneratedLockedBaseIssues(finalEntry) : [];
    const finalChildCount = childEntries.filter(isFinalReady).length;
    const inlineChildCount = entries.reduce((count, entry) => (
      count + (Array.isArray(entry.child_assets) ? entry.child_assets.filter((child) => isFinalReady(child)).length : 0)
    ), 0);
    const childAssetCount = finalChildCount + inlineChildCount;
    const requiresIndependentChildren = required.requires_independent_children === true;
    const minChildAssets = Math.max(1, Number(required.min_child_assets || 1));
    const acceptedCandidate = acceptedCandidateFor(candidates, assetId);
    const matchingCandidates = candidateListFor(candidates, assetId);
    const reviewGateFound = coveredByReview.has(assetId);
    const flattenedTextConflict = hasFlattenedTextConflict(required, routingEntry, entries);
    const cleanLockedBaseProof = hasCleanLockedBaseProof(entries);
    const poseFidelityProof = hasPoseFidelityProof(entries);
    const failures = [];
    let status = 'pass';
    let readiness = 'not_asset_required';

    if (requiresAssetReadiness(required)) {
      if (flattenedTextConflict && !cleanLockedBaseProof && !reviewGateFound) {
        status = 'fail';
        readiness = 'locked_base_needs_clean_source_or_review';
        failures.push({
          code: 'locked_base_contains_flattened_text',
          message: 'photo background route has flattened text conflict and needs clean no-text base-layer proof or review gate coverage',
        });
      } else if (regeneratedLockedBaseProblems.length && !reviewGateFound) {
        status = 'fail';
        readiness = 'regenerated_locked_base_needs_provenance';
        failures.push({
          code: 'missing_regenerated_locked_base_provenance',
          message: 'regenerated opaque locked-base assets require explicit clean-base provenance, source/output paths, dimensions, and checksum evidence',
          issues: regeneratedLockedBaseProblems,
        });
      } else if (requiresIndependentChildren && childAssetCount < minChildAssets && reviewGateFound) {
        status = 'review';
        readiness = 'independent_children_review_gated';
      } else if (requiresIndependentChildren && childAssetCount < minChildAssets) {
        status = 'fail';
        readiness = 'missing_independent_children';
        failures.push({
          code: 'missing_independent_child_assets',
          message: 'asset group requires independently final-ready child assets or explicit review gate coverage',
          child_asset_count: childAssetCount,
          min_child_assets: minChildAssets,
        });
      } else if (requiresIndependentChildren) {
        readiness = 'independent_children_ready';
      } else if (required.requires_pose_fidelity_review === true && !poseFidelityProof && !reviewGateFound) {
        status = 'fail';
        readiness = 'pose_fidelity_needs_review';
        failures.push({
          code: 'missing_pose_fidelity_review',
          message: 'primary regenerated human/device assets require pose, floor-contact, or relative-scale review evidence before final promotion',
        });
      } else if (finalEntry) {
        readiness = 'final_asset_ready';
      } else if (reviewGateFound) {
        status = 'review';
        readiness = 'review_gated';
      } else {
        status = 'fail';
        readiness = 'missing_final_or_review_gate';
        failures.push({
          code: 'missing_review_gate',
          message: 'asset route requires final-ready provenance or explicit review gate coverage',
        });

        if (entries.some((entry) => entry.asset_source_type === 'prompt_only' || entry.status === 'prompt_only')) {
          failures.push({
            code: 'prompt_only_not_review_gated',
            message: 'prompt_only entries are planning artifacts and must be review-gated until a final asset exists',
          });
        }
        if (entries.some((entry) => entry.asset_source_type === 'planned_reference_cutout' || entry.status === 'planned')) {
          failures.push({
            code: 'planned_cutout_not_review_gated',
            message: 'planned cutouts must be review-gated until a real cutout asset exists',
          });
        }
        if (routes.includes('regenerated_image') && !acceptedCandidate) {
          failures.push({
            code: 'no_accepted_imagegen_candidate',
            message: 'regenerated image route requires an accepted ImageGen candidate or review gate',
            rejected_candidate_count: matchingCandidates.filter((candidate) => candidate.accepted === false || candidate.blocked_from_final_html === true).length,
          });
        }
        if (SOURCE_TRUTH_KINDS.has(String(required.kind || '').toLowerCase())) {
          failures.push({
            code: 'source_truth_asset_missing_review_gate',
            message: 'source-truth semantic assets require real source provenance or explicit review gate coverage',
          });
        }
      }
    }

    assets.push({
      asset_id: assetId || null,
      kind: required.kind || null,
      routes,
      readiness,
      status,
      final_asset_found: Boolean(finalEntry),
      accepted_candidate_found: Boolean(acceptedCandidate),
      review_gate_found: reviewGateFound,
      flattened_text_conflict: flattenedTextConflict,
      clean_locked_base_proof: cleanLockedBaseProof,
      pose_fidelity_proof: poseFidelityProof,
      provenance_entry_count: entries.length,
      candidate_count: matchingCandidates.length,
      child_asset_count: childAssetCount,
      min_child_assets: requiresIndependentChildren ? minChildAssets : null,
      requires_independent_children: requiresIndependentChildren,
      regenerated_locked_base_provenance_issues: regeneratedLockedBaseProblems,
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
      checked_count: assets.length,
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
  auditAssetReadinessContract,
};
