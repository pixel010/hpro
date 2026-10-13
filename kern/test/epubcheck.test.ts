// Acceptance: epubcheck 5.4.0 (JDK 21 from prototyp/tools/) reports 0 errors and 0 warnings.
// The tools are not checked in (prototyp/setup-tools.sh downloads them); without them the
// test is skipped with the reason instead of passing silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createContainer, sampleDocument, type DocumentInput } from '../src/index.js';
import { REPO_ROOT } from './helpers.js';

const JAVA = resolve(REPO_ROOT, 'prototyp/tools/jdk-21.0.12.1+1/bin/java');
const EPUBCHECK = resolve(REPO_ROOT, 'prototyp/tools/epubcheck-5.4.0/epubcheck.jar');
const missing = [JAVA, EPUBCHECK].filter((p) => !existsSync(p));
const skip = missing.length > 0 ? `tools missing (run prototyp/setup-tools.sh): ${missing.join(', ')}` : false;

async function epubcheck(input: DocumentInput): Promise<{ code: number; output: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'hpro-epubcheck-'));
  try {
    const file = join(dir, 'container.epub');
    await writeFile(file, (await createContainer(input)).bytes);
    try {
      const { stdout, stderr } = await promisify(execFile)(JAVA, ['-jar', EPUBCHECK, file], { timeout: 420_000 }); // JVM start is slow on the throttled test host while other test files run in parallel
      return { code: 0, output: stdout + stderr };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      return { code: e.code ?? -1, output: (e.stdout ?? '') + (e.stderr ?? '') };
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('epubcheck 5.4.0: sample container has 0 fatals, 0 errors, 0 warnings', { skip, timeout: 480_000 }, async () => {
  const { code, output } = await epubcheck(sampleDocument());
  assert.match(output, /Messages: 0 fatals \/ 0 errors \/ 0 warnings/, output);
  assert.equal(code, 0, output);
});

test('epubcheck 5.4.0: interactive profile with a component script has 0 errors and 0 warnings', { skip, timeout: 480_000 }, async () => {
  const doc = sampleDocument();
  const interactive: DocumentInput = {
    ...doc,
    profile: 'interactive',
    resources: [
      ...doc.resources.map((r) =>
        r.path === 'content/index.xhtml' ? { ...r, data: String(r.data).replace('</main>', '</main>\n  <script src="../components/hp-components@0.1.0/form.js"></script>') } : r,
      ),
      { path: 'components/hp-components@0.1.0/form.js', mediaType: 'application/javascript', data: '"use strict";\n' },
    ],
  };
  const { code, output } = await epubcheck(interactive);
  assert.match(output, /Messages: 0 fatals \/ 0 errors \/ 0 warnings/, output);
  assert.equal(code, 0, output);
});
