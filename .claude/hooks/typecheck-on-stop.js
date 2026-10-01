#!/usr/bin/env node
// Stop: run `tsc --noEmit` when TypeScript files changed; exit 2 hands the errors back to Claude.
const { execSync } = require('child_process');

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  try {
    // Already continuing because of this hook: do not loop.
    if (JSON.parse(raw).stop_hook_active) process.exit(0);
  } catch {
    // no JSON on stdin; carry on
  }

  const changed = execSync('git status --porcelain', { encoding: 'utf8' })
    .split('\n')
    .some((line) => /\.ts$/.test(line.trim()));
  if (!changed) process.exit(0);

  try {
    execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    console.error(`tsc --noEmit failed:\n${output.slice(0, 4000)}`);
    process.exit(2);
  }
});
