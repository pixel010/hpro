#!/usr/bin/env node
/**
 * Prepares the npm package @hpro/kern (S8); `npm pack` runs it as `prepack`.
 *
 * 1. builds the library (dist/) and the command line (cli/, tsconfig.cli.json);
 * 2. copies the files the command line needs from the specification into spec/:
 *    the rule catalogue (part 1), the report schema and the function list (part 3);
 * 3. copies the licence text (Apache-2.0, LICENSE of the repository, P14) into the package;
 * 4. checks that the version of package.json and KERN_VERSION agree.
 *
 * Outside the repository (installed package) the CLI finds these files in spec/
 * (bin/cli-common.ts, specFile).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KERN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = resolve(KERN, '..', 'docs', 'spezifikation');
const tsc = resolve(KERN, '..', 'node_modules', 'typescript', 'bin', 'tsc');

rmSync(join(KERN, 'cli'), { recursive: true, force: true });
for (const config of ['tsconfig.json', 'tsconfig.cli.json']) execFileSync(process.execPath, [tsc, '-p', join(KERN, config)], { stdio: 'inherit' });

rmSync(join(KERN, 'spec'), { recursive: true, force: true });
for (const rel of ['01-regelkatalog.json', '03-funktionen.json', 'schema/konformitaetsbericht.schema.json', 'schema/maschinensicht.schema.json']) {
  mkdirSync(dirname(join(KERN, 'spec', rel)), { recursive: true });
  cpSync(join(SPEC, rel), join(KERN, 'spec', rel));
}

cpSync(resolve(KERN, '..', 'LICENSE'), join(KERN, 'LICENSE'));

const pkg = JSON.parse(readFileSync(join(KERN, 'package.json'), 'utf8'));
const version = /KERN_VERSION = '([^']+)'/.exec(readFileSync(join(KERN, 'src', 'version.ts'), 'utf8'))?.[1];
if (version !== pkg.version) throw new Error(`package.json ${pkg.version} != KERN_VERSION ${version}`);
console.log(`@hpro/kern ${pkg.version}: dist/, cli/ und spec/ vorbereitet`);
