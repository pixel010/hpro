import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig } from 'vite';
import { defineConfig } from 'vitest/config';

const kernSource = fileURLToPath(new URL('../kern/src/index.ts', import.meta.url));

/**
 * Content Security Policy of the reader shell (production build only; the dev server needs
 * inline scripts and a websocket). `srcdoc` frames inherit it, so document frames get this
 * policy plus their own stricter one (see src/render.ts).
 */
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' blob: 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src blob:",
  "font-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'self' blob: about:",
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
      return html.replace('<!--hpro:csp-->', `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}" />`);
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
        .replace(/\[\s*["']__HPRO_PRECACHE__["']\s*\]/, JSON.stringify(list))
        .replaceAll('__HPRO_VERSION__', version);
      if (sw.code === before || sw.code.includes('__HPRO_')) throw new Error('precache placeholders not found in sw.js');
    },
  };
}

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@html-pro/kern': kernSource },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        sw: fileURLToPath(new URL('./src/sw.ts', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  plugins: [serviceWorkerPrecache()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
