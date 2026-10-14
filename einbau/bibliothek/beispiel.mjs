#!/usr/bin/env node
/**
 * Smallest use of the library @hpro/kern (S8, docs/spezifikation/06-einbau.md, chapter 4):
 * Markdown text → document model → container → read back → conformance check.
 *
 *   node beispiel.mjs [ausgabe.hpro]
 */
import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { KERN_VERSION, author, checkConformance, createContainer, readContainer } from '@hpro/kern';

const markdown = `---
titel: Aktennotiz Besprechung Brandschutz
kennung: urn:uuid:3f0c6a52-8d1e-4b7a-9c2d-5e6f7a8b9c0d
datum: 2026-10-14
sprache: de-AT
---

# Anlass

Abstimmung der Mängelbehebung an den Brandschutztüren im Bauteil B.

# Vereinbart

1. Schließer der Tür B.03 nachstellen.
2. Dichtung der Tür B.07 tauschen.

| Tür | Frist |
|---|---|
| B.03 | 21.10.2026 |
| B.07 | 28.10.2026 |

Table: Fristen der Mängelbehebung {#fristen}
`;

// 1. Source → document model (every loss is reported in source.messages).
const source = author.readMarkdown(markdown);
// 2. Model + template → container input (XHTML, navigation, metadata).
const written = await author.writeDocument(source, author.findTemplate('frei'));
// 3. Container: ZIP with mimetype, OCF, package.opf, manifest.json with SHA-256 per file.
const created = await createContainer(written.document);
const out = process.argv[2] ?? 'aktennotiz.hpro';
await writeFile(out, created.bytes);

// 4. Read back like a foreign file and check against the rule catalogue shipped in the package.
const back = await readContainer(created.bytes);
const catalog = JSON.parse(await readFile(new URL(import.meta.resolve('@hpro/kern/spec/01-regelkatalog.json')), 'utf8'));
const report = await checkConformance(created.bytes, catalog, { fileName: out });

console.log(`@hpro/kern ${KERN_VERSION}: ${out} (${created.bytes.length} Bytes), Titel „${back.manifest.name}“, Hash-Manifest ${back.integrity.ok ? 'ok' : 'FEHLER'}`);
console.log(`Meldungen des Autorenwegs: ${written.messages.length === 0 ? 'keine' : written.messages.map((m) => `${m.severity} ${m.code}`).join(', ')}`);
console.log(`Prüfer: ${report.summary.fatal} fatal, ${report.summary.error} Fehler, ${report.summary.warning} Warnungen; Stufen ${JSON.stringify(report.levels.verdict)}`);
process.exit(report.summary.fatal + report.summary.error > 0 ? 1 : 0);
