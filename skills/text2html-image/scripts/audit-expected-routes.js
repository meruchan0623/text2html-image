#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('./utils/workflow-core');
const { auditExpectedRouteContract } = require('./utils/expected-route-contract-core');

function usage() {
  return [
    'Usage: npm run audit:routes -- --expected <expected-contract.json> --routing <asset-routing-table.json> [--report <route-contract-audit.json>]',
    '',
    'Validates expected route contracts against an asset routing table, including allowed_routes and forbidden_routes.',
  ].join('\n');
}

function readJsonFile(filePath, label) {
  const resolved = path.resolve(String(filePath || ''));
  if (!filePath || !fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  return { path: resolved, json: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
}

function main() {
  const args = parseArgs();
  if (args.help || !args.expected || !args.routing) {
    console.error(usage());
    process.exit(args.help ? 0 : 1);
  }

  let expected;
  let routing;
  try {
    expected = readJsonFile(args.expected, 'Expected contract');
    routing = readJsonFile(args.routing, 'Routing table');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const report = {
    expected_contract_path: expected.path,
    routing_table_path: routing.path,
    ...auditExpectedRouteContract({
      expectedContract: expected.json,
      routingTable: routing.json,
    }),
  };

  const reportPath = args.report
    ? path.resolve(String(args.report))
    : path.join(path.dirname(expected.path), 'route-contract-audit.json');
  writeJson(reportPath, report);

  console.log(`Route contract audit written: ${reportPath}`);
  console.log(`Route contract status: ${report.status}`);
  console.log(`Required routes: ${report.summary.required_route_count}; failures: ${report.summary.fail_count}`);
}

main();
