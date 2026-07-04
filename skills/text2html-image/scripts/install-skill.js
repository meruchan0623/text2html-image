#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..');
const SKILL_NAME = 'text2html-image';

// 纯函数：解析每个平台的符号链接目标路径
function resolveTargets({ target = 'all', claudeDir, codexDir, env = {}, homedir } = {}) {
  const home = homedir || os.homedir();
  const claudeRoot = claudeDir || path.join(home, '.claude', 'skills');
  const codexRoot = codexDir || path.join(env.CODEX_HOME || path.join(home, '.codex'), 'skills');
  const all = [
    { platform: 'claude', linkPath: path.join(claudeRoot, SKILL_NAME) },
    { platform: 'codex', linkPath: path.join(codexRoot, SKILL_NAME) },
  ];
  if (target === 'all') return all;
  return all.filter((t) => t.platform === target);
}

// 判定目标现状（碰 fs）
function classifyTarget(linkPath) {
  let stat;
  try {
    stat = fs.lstatSync(linkPath);
  } catch (_e) {
    return 'missing';
  }
  return stat.isSymbolicLink() ? 'symlink' : 'real';
}

// 幂等安装单个目标；真实目录/文件时抛错，绝不删除
function installOne(linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const kind = classifyTarget(linkPath);
  if (kind === 'real') {
    throw new Error(
      `Refusing to overwrite real path (not a symlink): ${linkPath}. Remove or rename it manually, then re-run.`
    );
  }
  if (kind === 'symlink') {
    fs.unlinkSync(linkPath);
  }
  fs.symlinkSync(SKILL_DIR, linkPath, 'dir');
  return kind === 'symlink' ? 'replaced' : 'created';
}

function parseArgs(argv) {
  const args = { target: 'all', claudeDir: undefined, codexDir: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--target') args.target = argv[i + 1];
    else if (a === '--claude-dir') args.claudeDir = argv[i + 1];
    else if (a === '--codex-dir') args.codexDir = argv[i + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['all', 'claude', 'codex'].includes(args.target)) {
    console.error(`Invalid --target "${args.target}". Use claude | codex | all.`);
    process.exit(2);
  }
  const targets = resolveTargets({
    target: args.target,
    claudeDir: args.claudeDir,
    codexDir: args.codexDir,
    env: process.env,
  });
  let failures = 0;
  for (const t of targets) {
    try {
      const action = installOne(t.linkPath);
      console.log(`[${t.platform}] ${action}: ${t.linkPath} -> ${SKILL_DIR}`);
    } catch (e) {
      failures += 1;
      console.error(`[${t.platform}] FAILED: ${e.message}`);
    }
  }
  console.log(
    failures === 0
      ? 'Skill install complete. Restart Claude Code if the /text2html-image command does not appear yet.'
      : `Skill install finished with ${failures} failure(s).`
  );
  process.exit(failures === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { resolveTargets, classifyTarget, installOne, parseArgs, SKILL_DIR, SKILL_NAME };
