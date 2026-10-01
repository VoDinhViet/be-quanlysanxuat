#!/usr/bin/env node
// PreToolUse: refuse edits to env files, applied drizzle migrations and the pnpm lock file.
// Exit code 2 blocks the tool call and sends stderr back to Claude.
const path = require('path');

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let filePath = '';
  try {
    const input = JSON.parse(raw);
    filePath = input.tool_input?.file_path ?? '';
  } catch {
    process.exit(0);
  }

  const normalized = filePath.split(path.sep).join('/');
  const base = path.basename(normalized);

  if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
    console.error(
      `Blocked: ${base} holds real connection strings. Ask the user to edit it.`,
    );
    process.exit(2);
  }

  if (base === 'pnpm-lock.yaml') {
    console.error('Blocked: pnpm-lock.yaml changes only through `pnpm install`/`pnpm add`.');
    process.exit(2);
  }

  if (/(^|\/)drizzle\/.+\.sql$/.test(normalized)) {
    console.error(
      'Blocked: drizzle/*.sql are applied migrations (db:check-drift compares their hashes). ' +
        'Add a new migration with `pnpm db:generate` (ask the user to run it) instead of editing one.',
    );
    process.exit(2);
  }
});
