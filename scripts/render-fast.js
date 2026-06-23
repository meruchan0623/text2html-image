const { parseArgs } = require('./utils/workflow-core');

const args = parseArgs();
console.log(`render-fast entry invoked${args['profile-only'] ? ' in profile-only mode' : ''}.`);
process.exit(0);
