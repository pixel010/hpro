import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import { buildCalcSample, buildLiveSample, buildLockSample, buildPrintSample, buildSample } from './scripts/sample.ts';

const kernSource = fileURLToPath(new URL('../kern/src/index.ts', import.meta.url));

/**
 * Content Security Policy of the reader shell (production build only; the dev server needs
 * inline scripts and a websocket). Documents are not shown in the shell itself but in the
 * document frame inside frame.html, which does not inherit this policy (src/frame-host.ts).
 */
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' blob: 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * Policy of the frame host (frame.html). The document frame below it inherits this policy and
 * adds its own (src/render.ts, kern live.frameCsp); both apply. This one therefore does not
 * restrict inline scripts (the frame's own policy allows only hashed ones), but it already
 * blocks every network source, so a document frame can never be more permissive than this.
 */
const FRAME_HOST_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'media-src data:',
  'font-src data:',
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Writes the precache list into the service worker: every emitted file (except source maps
 * and the worker itself) and every file from public/. The cache version is the hash over
 * names and contents, so a changed build replaces the old cache.
 */
function serviceWorkerPrecache(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'hpro-sw-precache',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml(html) {
      return html
        .replace('<!--hpro:csp-->', `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}" />`)
        .replace('<!--hpro:csp-frame-->', `<meta http-equiv="Content-Security-Policy" content="${FRAME_HOST_CSP}" />`);
    },
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      const files = new Set<string>();
      for (const [fileName, item] of Object.entries(bundle)) {
        if (fileName === 'sw.js' || fileName.endsWith('.map')) continue;
        files.add(fileName);
        hash.update(fileName);
        hash.update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source));
      }
      if (config.publicDir) {
        for (const full of listFiles(config.publicDir)) {
          const name = relative(config.publicDir, full).split(sep).join('/');
          files.add(name);
          hash.update(name);
          hash.update(statSync(full).size.toString());
        }
      }
      const sw = bundle['sw.js'];
      if (!sw || sw.type !== 'chunk') throw new Error('service worker chunk sw.js missing');
      const list = ['./', ...[...files].sort().map((f) => `./${f}`)];
      const version = hash.digest('hex').slice(0, 16);
      const before = sw.code;
      sw.code = sw.code
        .replace(/\[\s*["'`]__HPRO_PRECACHE__["'`]\s*\]/, JSON.stringify(list))
        .replaceAll('__HPRO_VERSION__', version);
      if (sw.code === before || sw.code.includes('__HPRO_')) throw new Error('precache placeholders not found in sw.js');
    },
  };
}

/** The sample documents, built by the core: `beispiel.hpro` (app/sample/), `kostenschaetzung.hpro` (P19), `lebendig.hpro` (P15), `sperren.hpro` (P17), `druck.hpro` (P18). */
function sampleDocument(): Plugin {
  return {
    name: 'hpro-sample',
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'beispiel.hpro', source: await buildSample() });
      this.emitFile({ type: 'asset', fileName: 'kostenschaetzung.hpro', source: await buildCalcSample() });
      this.emitFile({ type: 'asset', fileName: 'lebendig.hpro', source: await buildLiveSample() });
      this.emitFile({ type: 'asset', fileName: 'sperren.hpro', source: await buildLockSample() });
      this.emitFile({ type: 'asset', fileName: 'druck.hpro', source: await buildPrintSample() });
    },
    configureServer(server) {
      server.middlewares.use('/lebendig.hpro', (_req, res) => {
        buildLiveSample().then(
          (bytes) => {
            res.setHeader('Content-Type', 'application/epub+zip');
            res.end(Buffer.from(bytes));
          },
          (err: unknown) => {
            res.statusCode = 500;
            res.end(String(err));
          },
        );
      });
      server.middlewares.use('/druck.hpro', (_req, res) => {
        buildPrintSample().then(
          (bytes) => {
            res.setHeader('Content-Type', 'application/epub+zip');
            res.end(Buffer.from(bytes));
          },
          (err: unknown) => {
            res.statusCode = 500;
            res.end(String(err));
          },
        );
      });
      server.middlewares.use('/sperren.hpro', (_req, res) => {
        buildLockSample().then(
          (bytes) => {
            res.setHeader('Content-Type', 'application/epub+zip');
            res.end(Buffer.from(bytes));
          },
          (err: unknown) => {
            res.statusCode = 500;
            res.end(String(err));
          },
        );
      });
      server.middlewares.use('/kostenschaetzung.hpro', (_req, res) => {
        buildCalcSample().then(
          (bytes) => {
            res.setHeader('Content-Type', 'application/epub+zip');
            res.end(Buffer.from(bytes));
          },
          (err: unknown) => {
            res.statusCode = 500;
            res.end(String(err));
          },
        );
      });
      server.middlewares.use('/beispiel.hpro', (_req, res) => {
        buildSample().then(
          (bytes) => {
            res.setHeader('Content-Type', 'application/epub+zip');
            res.end(Buffer.from(bytes));
          },
          (err: unknown) => {
            res.statusCode = 500;
            res.end(String(err));
          },
        );
      });
    },
  };
}

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@hpro/kern': kernSource },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        frame: fileURLToPath(new URL('./frame.html', import.meta.url)),
        sw: fileURLToPath(new URL('./src/sw.ts', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  plugins: [sampleDocument(), serviceWorkerPrecache()],
  preview: { host: '127.0.0.1', port: 4317, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
