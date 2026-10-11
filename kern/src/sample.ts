/**
 * Sample document used by tests, the CLI and the evidence run for package P1.
 * Content is German like the prototype's test document (prototyp/build_container.py),
 * extended by a second chapter and an SVG figure so that more than one content
 * document and a non-text resource are exercised.
 */
import type { DocumentInput } from './container.js';

const INDEX_XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Prüfdokument html-Pro P1</title>
  <link rel="stylesheet" type="text/css" href="styles/document.css"/>
</head>
<body>
  <main>
    <h1 id="b1">Prüfdokument html-Pro</h1>
    <p id="b2">Dieses Dokument wurde vom TypeScript-Kern <code>@html-pro/kern</code> erzeugt. Es prüft,
      ob der Container den Regeln aus dem Prototyp entspricht.</p>
    <section aria-labelledby="b3">
      <h2 id="b3">Vereinbarung</h2>
      <p id="b4">Die Parteien vereinbaren eine Lieferung von <strong>12 Stück</strong> zum Preis
        von <strong>1.200,00 EUR</strong>.</p>
      <table id="b5">
        <caption>Positionen</caption>
        <thead><tr><th scope="col">Position</th><th scope="col">Menge</th><th scope="col">Betrag</th></tr></thead>
        <tbody><tr><td>Prüfgerät</td><td>12</td><td>1.200,00 EUR</td></tr></tbody>
      </table>
    </section>
  </main>
</body>
</html>
`;

const ANHANG_XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Anhang: Lieferplan</title>
  <link rel="stylesheet" type="text/css" href="styles/document.css"/>
</head>
<body>
  <section aria-labelledby="c1">
    <h1 id="c1">Anhang: Lieferplan</h1>
    <p id="c2">Die Lieferung erfolgt in zwei Teilen. Die Abbildung zeigt die Mengen je Teillieferung.</p>
    <figure id="c3">
      <img src="media/lieferplan.svg" alt="Balkendiagramm: Teillieferung 1 mit 8 Stück, Teillieferung 2 mit 4 Stück."/>
      <figcaption>Mengen je Teillieferung</figcaption>
    </figure>
  </section>
</body>
</html>
`;

const DOCUMENT_CSS = `:root { --hp-font-size: 1rem; --hp-line-height: 1.5; }
body { font-family: sans-serif; font-size: var(--hp-font-size); line-height: var(--hp-line-height); margin: 0 auto; max-width: 40em; padding: 1em; }
table { border-collapse: collapse; break-inside: avoid; }
th, td { border: 1px solid #555; padding: 0.25em 0.5em; text-align: left; }
figure { margin: 1em 0; break-inside: avoid; }
figure img { max-width: 100%; height: auto; }
`;

const LIEFERPLAN_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" width="240" height="120" role="img" aria-labelledby="t">
  <title id="t">Mengen je Teillieferung</title>
  <rect x="20" y="20" width="160" height="30" fill="#2b6cb0"/>
  <text x="190" y="40" font-family="sans-serif" font-size="12">8</text>
  <rect x="20" y="70" width="80" height="30" fill="#2b6cb0"/>
  <text x="110" y="90" font-family="sans-serif" font-size="12">4</text>
</svg>
`;

export function sampleDocument(): DocumentInput {
  return {
    id: 'urn:uuid:0b6f3c1e-8d2a-4f57-9c3e-5a1d7e2b4c90',
    title: 'Prüfdokument html-Pro P1',
    language: 'de-AT',
    modified: '2026-10-11T00:00:00Z',
    profile: 'static',
    creators: ['html-Pro'],
    readingOrder: ['content/index.xhtml', 'content/anhang.xhtml'],
    toc: {
      title: 'Inhalt',
      entries: [
        { title: 'Prüfdokument html-Pro', href: 'content/index.xhtml#b1', children: [{ title: 'Vereinbarung', href: 'content/index.xhtml#b3' }] },
        { title: 'Anhang: Lieferplan', href: 'content/anhang.xhtml#c1' },
      ],
    },
    resources: [
      { path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: INDEX_XHTML },
      { path: 'content/anhang.xhtml', mediaType: 'application/xhtml+xml', data: ANHANG_XHTML },
      { path: 'content/styles/document.css', mediaType: 'text/css', data: DOCUMENT_CSS },
      { path: 'content/media/lieferplan.svg', mediaType: 'image/svg+xml', data: LIEFERPLAN_SVG },
    ],
    // Descriptive metadata only. No conformance claim: no accessibility audit was done (package P8).
    accessibility: {
      accessMode: ['textual', 'visual'],
      accessModeSufficient: ['textual'],
      accessibilityFeature: ['structuralNavigation', 'tableOfContents', 'alternativeText'],
      accessibilityHazard: ['none'],
      accessibilitySummary: 'Textdokument mit Überschriften, einer Tabelle mit Kopfzeilen und einer Abbildung mit Alternativtext.',
    },
  };
}
