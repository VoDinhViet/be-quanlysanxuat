#!/usr/bin/env node
// PostToolUse: format the TypeScript file Claude just wrote with the repo's Prettier config.
// Formatting only; lint stays a separate `pnpm lint` so unrelated auto-fixes never touch the file.
const { execFileSync } = require('child_process');
const fs = require('fs');

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(raw).tool_input?.file_path ?? '';
  } catch {
    process.exit(0);
  }

  if (!/\.ts$/.test(filePath) || !fs.existsSync(filePath)) process.exit(0);

  try {
    execFileSync('npx', ['prettier', '--write', filePath], { stdio: 'pipe' });
  } catch (error) {
    console.error(`prettier failed on ${filePath}:\n${error.stderr ?? error}`);
    process.exit(2);
  }
});
