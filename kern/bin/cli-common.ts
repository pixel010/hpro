/**
 * Shared parts of the command line (S8): the exit codes of the stable interface, the lookup of
 * files the CLI needs next to the package (rule catalogue, report schema, epubcheck), and the
 * version information.
 *
 * Exit codes of the stable commands (docs/spezifikation/06-einbau.md, chapter 3):
 *
 *   0  done / passed
 *   1  done, the result is negative (check failed, signature not TOTAL_PASSED, a PDF level failed,
 *      template rules not met — nothing written)
 *   2  usage or input error (wrong arguments, unreadable or broken file); nothing written
 *   3  undetermined (only `check`: a level could not be decided, e.g. without epubcheck)
 *   4  a required helper is not available (PDF service, LibreOffice); nothing written
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI_INTERFACE_VERSION, KERN_VERSION, SPEC_VERSION } from '../src/index.js';

export const EXIT = { ok: 0, negative: 1, usage: 2, undetermined: 3, unavailable: 4 } as const;

/** Thrown for wrong arguments; the command prints the message and returns 2. */
export class UsageError extends Error {}

/** Thrown when a helper (service, office program) is missing; the command returns 4. */
export class UnavailableError extends Error {}

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Finds a file the CLI needs. Inside the repository the current specification wins
 * (`docs/spezifikation/<rel>`); an installed package uses its own copy (`spec/<rel>`, written by
 * `npm pack`, see `kern/scripts/prepare-package.mjs`).
 */
export function specFile(rel: string): string {
  for (const base of ['docs/spezifikation', 'spec']) {
    let dir = HERE;
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, base, rel);
      if (existsSync(candidate)) return candidate;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return resolve(HERE, '../../..', 'docs/spezifikation', rel);
}

/** First existing path of `<ancestor>/<rel>` above the CLI, or undefined. */
export function findAbove(rel: string): string | undefined {
  let dir = HERE;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return undefined;
}

/** True when `metaUrl` is the module node was started with (also through an npm bin link). */
export function isMain(metaUrl: string): boolean {
  const started = process.argv[1];
  if (!started) return false;
  try {
    return realpathSync(started) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

/** Version information of `hpro version`. */
export function versionInfo(): Record<string, string | number> {
  let catalog = '?';
  try {
    catalog = String((JSON.parse(readFileSync(specFile('01-regelkatalog.json'), 'utf8')) as { version?: string }).version ?? '?');
  } catch {
    // catalogue not found: reported as '?'
  }
  return {
    package: '@hpro/kern',
    version: KERN_VERSION,
    cliInterface: CLI_INTERFACE_VERSION,
    specification: SPEC_VERSION,
    ruleCatalog: catalog,
    node: process.versions.node,
  };
}
