#!/usr/bin/env node
// Runs the unit tests of the hpro service (dienst/tests) when the service is installed
// (dienst/setup-dienst.sh); otherwise reports the skip with its reason instead of passing silently.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const python = resolve(root, 'dienst/.venv/bin/python');
if (!existsSync(python)) {
  console.log('dienst:test übersprungen: dienst/.venv fehlt (dienst/setup-dienst.sh)');
  process.exit(0);
}
const r = spawnSync(python, ['-W', 'ignore::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'dienst/tests', '-v'], { cwd: root, stdio: 'inherit', timeout: 1_200_000 });
process.exit(r.status ?? 1);
