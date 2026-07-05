function normalizeId(value) {
  return String(value || '').trim();
}

function findRoutedElement(routingTable, elementId) {
  const elements = Array.isArray(routingTable?.elements)
    ? routingTable.elements
    : Array.isArray(routingTable?.routing?.elements)
      ? routingTable.routing.elements
      : [];
  const wanted = normalizeId(elementId);
  return elements.find((element) => normalizeId(element.id || element.element_id) === wanted);
}

function auditExpectedRouteContract({ expectedContract, routingTable } = {}) {
  const requiredRoutes = Array.isArray(expectedContract?.required_routes)
    ? expectedContract.required_routes
    : [];
  const results = [];
  const failures = [];

  for (const required of requiredRoutes) {
    const elementId = normalizeId(required.element_id || required.id);
    const expectedRoute = normalizeId(required.expected_route);
    const allowedRoutes = Array.isArray(required.allowed_routes)
      ? required.allowed_routes.map(normalizeId).filter(Boolean)
      : [];
    const forbiddenRoutes = Array.isArray(required.forbidden_routes)
      ? required.forbidden_routes.map(normalizeId).filter(Boolean)
      : [];
    const actual = findRoutedElement(routingTable, elementId);
    const actualRoute = normalizeId(actual?.route);
    const result = {
      element_id: elementId,
      kind: required.kind || actual?.kind || null,
      expected_route: expectedRoute,
      allowed_routes: allowedRoutes,
      forbidden_routes: forbiddenRoutes,
      actual_route: actualRoute || null,
      route_match_type: null,
      status: 'pass',
    };

    if (!actual) {
      result.status = 'fail';
      result.route_match_type = 'missing';
      failures.push({
        code: 'missing_routed_element',
        element_id: elementId,
        message: 'required route element is missing from routing table',
      });
      results.push(result);
      continue;
    }

    if (forbiddenRoutes.includes(actualRoute)) {
      result.status = 'fail';
      result.route_match_type = 'forbidden_route';
      failures.push({
        code: 'forbidden_route',
        element_id: elementId,
        expected_route: expectedRoute,
        actual_route: actualRoute,
        forbidden_routes: forbiddenRoutes,
        message: 'actual route is explicitly forbidden by expected contract',
      });
      results.push(result);
      continue;
    }

    if (actualRoute === expectedRoute) {
      result.route_match_type = 'exact';
      results.push(result);
      continue;
    }

    if (allowedRoutes.includes(actualRoute)) {
      result.route_match_type = 'allowed_route';
      results.push(result);
      continue;
    }

    result.status = 'fail';
    result.route_match_type = 'mismatch';
    failures.push({
      code: 'route_mismatch',
      element_id: elementId,
      expected_route: expectedRoute,
      allowed_routes: allowedRoutes,
      actual_route: actualRoute,
      message: allowedRoutes.length
        ? 'actual route is not in expected or allowed route family'
        : 'actual route does not match expected route and no allowed_routes family is declared',
    });
    results.push(result);
  }

  return {
    generated_at: new Date().toISOString(),
    case_id: expectedContract?.case_id || null,
    status: failures.length ? 'fail' : 'pass',
    summary: {
      required_route_count: requiredRoutes.length,
      pass_count: results.filter((result) => result.status === 'pass').length,
      fail_count: failures.length,
      allowed_route_match_count: results.filter((result) => result.route_match_type === 'allowed_route').length,
      exact_match_count: results.filter((result) => result.route_match_type === 'exact').length,
    },
    results,
    failures,
  };
}

module.exports = {
  auditExpectedRouteContract,
};
