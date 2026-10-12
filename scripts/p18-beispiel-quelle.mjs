#!/usr/bin/env node
/**
 * Writes the source of the P18 print test document to docs/spezifikation/beispiele/p18-druck/
 * (Zusage 6, HP-PRINT-001 … 011, test cases HPL-PRINT-001 … 005):
 *
 *  - content/index.xhtml: three heading levels, internal and external links, a measurement log
 *    with 200 rows (thead, caption), a schedule with 12 columns, a 2400 px wide image, a code
 *    block with a 300-character line, a video with poster, a CSS animation, the component
 *    hp-chart with its static equivalent, a collapsed `details`, a block of priority 3 and a
 *    section with the lock `no-print`;
 *  - content/anhang.xhtml: a second content document (starts on a new page in print);
 *  - media, component and data file copied from the P15 example.
 *
 * Deterministic (no clock, no randomness): the measurement values come from a fixed formula.
 * Run again after a change; the files are checked in, the build does not run this script.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/spezifikation/beispiele/p18-druck');
const P15 = join(ROOT, 'docs/spezifikation/beispiele/p15-lebendig');

const write = (path, text) => {
  mkdirSync(dirname(join(OUT, path)), { recursive: true });
  writeFileSync(join(OUT, path), text);
};
const copy = (from, to) => {
  mkdirSync(dirname(join(OUT, to)), { recursive: true });
  copyFileSync(join(P15, from), join(OUT, to));
};

const de = (n, digits) => n.toFixed(digits).replace('.', ',');

// 200 measuring points: axis A–H, field 1–25; moisture and temperature from a fixed formula.
const rows = [];
for (let i = 0; i < 200; i++) {
  const axis = 'ABCDEFGH'[i % 8];
  const field = Math.floor(i / 8) + 1;
  const moisture = 11 + ((i * 37) % 90) / 10; // 11,0 … 19,9 %
  const temp = 6 + ((i * 53) % 120) / 10; // 6,0 … 17,9 °C
  const verdict = moisture >= 18 ? 'nachtrocknen' : moisture >= 16 ? 'beobachten' : 'in Ordnung';
  rows.push(
    `            <tr><th scope="row">M-${String(i + 1).padStart(3, '0')}</th><td>${axis}</td><td>${field}</td><td>${de(moisture, 1)}</td><td>${de(temp, 1)}</td><td class="bewertung">${verdict}</td></tr>`,
  );
}

const weeks = ['KW 36', 'KW 37', 'KW 38', 'KW 39', 'KW 40', 'KW 41', 'KW 42', 'KW 43', 'KW 44', 'KW 45'];
const trades = ['Gerüst', 'Altdeckung abtragen', 'Lattung und Unterdach', 'Eindeckung Ziegel', 'Spenglerarbeiten', 'Entsorgung', 'Blitzschutz', 'Schlussreinigung'];
const plan = trades
  .map((t, r) => {
    const cells = weeks.map((_, w) => {
      const on = w >= r && w < r + 3;
      return `<td>${on ? `${8 + ((r * 3 + w * 5) % 9) * 4} h` : '–'}</td>`;
    });
    return `            <tr><th scope="row">${r + 1}</th><th scope="row">${t}</th>${cells.join('')}</tr>`;
  })
  .join('\n');

// A real-looking long line: CSV header of the export of the measuring device (300 characters).
const csvHeader =
  'messpunkt;achse;feld;datum_iso;uhrzeit;holzfeuchte_prozent;temperatur_celsius;relative_luftfeuchte_prozent;geraet_seriennummer;sonde_typ;kalibrierung_datum;holzart;korrekturfaktor_holzart;korrekturfaktor_temperatur;bewertung;bearbeiter_kuerzel;bemerkung_freitext;foto_dateiname;gps_breite;gps_laenge;hoehe';
if (csvHeader.length < 300) throw new Error(`csv header too short: ${csvHeader.length}`);
const longLine = csvHeader.slice(0, 300);

const index = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Dachsanierung Haus Nr. 12 – Feuchtemessung und Bauablauf</title>
  <link rel="stylesheet" type="text/css" href="styles/document.css"/>
  <script src="../components/hp-chart@0.1.0/hp-chart.js"></script>
</head>
<body>
  <main id="inhalt">
    <h1 id="titel">Dachsanierung Haus Nr. 12 – Feuchtemessung und Bauablauf</h1>
    <p id="einleitung">Dieser Bericht ist ein Prüfdokument für den abgeleiteten Ausdruck (Paket P18). Er
      enthält alles, was beim Drucken schiefgehen kann: ein Messprotokoll mit 200 Zeilen
      (<a href="#messprotokoll">Messprotokoll</a>), einen Bauzeitenplan mit zwölf Spalten, ein
      Übersichtsbild, das breiter ist als jede Seite, einen Codeblock mit einer 300 Zeichen langen
      Zeile, ein Video, einen bewegten Ablaufplan und ein umschaltbares Diagramm. Die Quellen stehen
      im <a href="anhang.xhtml#quellen">Anhang</a>; die Regeln für den Ausdruck beschreibt
      <a href="https://www.w3.org/TR/css-page-3/">CSS Paged Media Level 3</a>.</p>

    <section id="ueberblick">
      <h2 id="ueberblick-h">Überblick</h2>
      <p id="ueberblick-text">Gemessen wurde die Holzfeuchte der neuen Lattung an 200 Punkten in acht
        Achsen (A bis H) und 25 Feldern. Grenzwert für das Eindecken sind 18 Prozent; zwischen 16 und
        18 Prozent wird beobachtet. Der Bauzeitenplan zeigt die geplanten Stunden je Gewerk und
        Kalenderwoche.</p>
      <details id="verfahren">
        <summary>Messverfahren (aufklappbar)</summary>
        <p id="verfahren-text">Widerstandsmessung mit Einschlagelektroden, Eindringtiefe 15 mm,
          Holzart Fichte, Temperaturausgleich am Gerät. Jeder Punkt wurde zweimal gemessen; im
          Protokoll steht der Mittelwert. Die Elektroden wurden quer zur Faser gesetzt.</p>
      </details>
      <aside id="randnotiz" data-hp-priority="3">
        <p>Randnotiz (Detailtiefe 3): Am Messtag lag die Außentemperatur bei 9 °C, relative
          Luftfeuchte 71 Prozent. Die Werte sind deshalb eher hoch als niedrig angesetzt.</p>
      </aside>
    </section>

    <section id="messprotokoll">
      <h2 id="messprotokoll-h">Messprotokoll</h2>
      <p id="messprotokoll-text">Alle 200 Messpunkte. Die Kopfzeile der Tabelle steht auf jeder
        gedruckten Seite; keine Zeile wird geteilt.</p>
      <table id="messwerte" data-hp-table="scroll">
        <caption>Holzfeuchte und Temperatur je Messpunkt</caption>
        <thead>
          <tr><th scope="col">Punkt</th><th scope="col">Achse</th><th scope="col">Feld</th><th scope="col">Holzfeuchte (%)</th><th scope="col">Temperatur (°C)</th><th scope="col">Bewertung</th></tr>
        </thead>
        <tbody>
${rows.join('\n')}
        </tbody>
      </table>
    </section>

    <section id="bauzeitenplan">
      <h2 id="bauzeitenplan-h">Bauzeitenplan</h2>
      <section id="plan-tabelle">
        <h3 id="plan-tabelle-h">Stunden je Gewerk und Woche</h3>
        <table id="plan" data-hp-table="scroll">
          <caption>Geplante Stunden je Gewerk, Kalenderwochen 36 bis 45</caption>
          <thead>
            <tr><th scope="col">Pos.</th><th scope="col">Gewerk</th>${weeks.map((w) => `<th scope="col">${w}</th>`).join('')}</tr>
          </thead>
          <tbody>
${plan}
          </tbody>
        </table>
      </section>
      <section id="plan-bild">
        <h3 id="plan-bild-h">Übersicht als Balkenplan</h3>
        <figure id="balkenplan">
          <img src="media/balkenplan.svg" width="2400" height="330"
               alt="Balkenplan: acht Gewerke als Balken über die Kalenderwochen 36 bis 45, jedes Gewerk drei Wochen lang, jeweils eine Woche nach dem vorigen beginnend."/>
          <figcaption>Balkenplan der acht Gewerke. Das Bild ist 2400 Pixel breit und wird im
            Ausdruck auf die Satzbreite verkleinert, mit unverändertem Seitenverhältnis.</figcaption>
        </figure>
      </section>
    </section>

    <section id="datenexport">
      <h2 id="datenexport-h">Datenexport des Messgeräts</h2>
      <p id="datenexport-text">Das Messgerät schreibt eine CSV-Datei. Die erste Zeile (Spaltennamen)
        ist 300 Zeichen lang; im Ausdruck bricht sie mit sichtbarer Markierung um.</p>
      <pre id="csv-beispiel"><code>${longLine}
M-001;A;1;2026-10-08;07:42;11,0;6,0;71;HM-4471-0932;E15;2026-09-30;Fichte;1,00;0,98;in Ordnung;JP;;;47,2692;11,4041
M-002;B;1;2026-10-08;07:44;14,7;11,3;71;HM-4471-0932;E15;2026-09-30;Fichte;1,00;0,98;in Ordnung;JP;;;47,2692;11,4043
# Prüfsumme der Datei: sha256 7c1e0f3a9b2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f</code></pre>
    </section>

    <section id="zeitraffer">
      <h2 id="zeitraffer-h">Zeitraffer der Eindeckung</h2>
      <figure id="zeitraffer-abbildung">
        <video id="zeitraffer-video" src="media/zeitraffer.webm" poster="media/zeitraffer-standbild.png"
               width="640" height="360" controls="controls" muted="muted" loop="loop" autoplay="autoplay"
               playsinline="playsinline" aria-describedby="zeitraffer-text">
          <img src="media/zeitraffer-standbild.png" width="640" height="360"
               alt="Standbild am Tag 8: das Dach ist zu drei Vierteln mit roten Ziegeln gedeckt, rechts liegt noch die alte braune Fläche."/>
        </video>
        <figcaption id="zeitraffer-text">Zeitraffer, 8 Sekunden, ohne Ton: zehn Arbeitstage in 96
          Bildern. Die neue Ziegeldeckung (rot) wächst von links nach rechts über die alte Dachfläche
          (braun). Das Standbild zeigt Tag 8: drei Viertel der Fläche sind gedeckt.</figcaption>
      </figure>
    </section>

    <section id="ablauf">
      <h2 id="ablauf-h">Ablaufplan</h2>
      <p id="ablauf-text">Die Hervorhebung wandert im Takt von zwei Sekunden von Schritt zu Schritt.
        Bei reduzierter Bewegung und im Ausdruck steht der Plan still, alle Schritte sind voll sichtbar.</p>
      <figure id="ablauf-abbildung">
        <svg xmlns="http://www.w3.org/2000/svg" class="ablauf" viewBox="0 0 640 110" role="img" aria-labelledby="ablauf-titel">
          <title id="ablauf-titel">Ablauf: 1 Gerüst, 2 Abdecken, 3 Lattung, 4 Eindecken, 5 Spengler</title>
          <line x1="60" y1="40" x2="580" y2="40" class="linie"/>
          <g class="schritt s1"><circle cx="60" cy="40" r="22"/><text x="60" y="46">1</text><text x="60" y="95">Gerüst</text></g>
          <g class="schritt s2"><circle cx="190" cy="40" r="22"/><text x="190" y="46">2</text><text x="190" y="95">Abdecken</text></g>
          <g class="schritt s3"><circle cx="320" cy="40" r="22"/><text x="320" y="46">3</text><text x="320" y="95">Lattung</text></g>
          <g class="schritt s4"><circle cx="450" cy="40" r="22"/><text x="450" y="46">4</text><text x="450" y="95">Eindecken</text></g>
          <g class="schritt s5"><circle cx="580" cy="40" r="22"/><text x="580" y="46">5</text><text x="580" y="95">Spengler</text></g>
        </svg>
        <figcaption id="ablauf-legende">Reihenfolge: 1 Gerüst stellen, 2 alte Deckung abtragen,
          3 Lattung und Unterdach, 4 Ziegel eindecken, 5 Spenglerarbeiten.</figcaption>
      </figure>
    </section>

    <section id="aufwand">
      <h2 id="aufwand-h">Aufwand je Gewerk</h2>
      <p id="aufwand-text">Mit Skript lässt sich das Diagramm zwischen Stunden und Kosten umschalten;
        ohne Skript und im Ausdruck zeigen Bild und Tabelle die Kosten.</p>
      <hp-chart id="aufwand-diagramm" source="aufwand-tabelle" state="data/diagramm.json">
        <figure id="aufwand-bild">
          <img src="media/diagramm-statisch.svg" width="640" height="190"
               alt="Balkendiagramm Kosten je Gewerk: Eindeckung Ziegel 14.400,00 €, Lattung und Unterdach 6.850,00 €, Spenglerarbeiten 5.100,00 €, Gerüst 3.200,00 €, Altdeckung abtragen 2.900,00 €, Entsorgung 1.250,00 €."/>
          <figcaption>Kosten je Gewerk, Stand 12.10.2026 (statische Fassung).</figcaption>
        </figure>
        <table id="aufwand-tabelle" data-hp-table="scroll">
          <caption>Stunden und Kosten je Gewerk</caption>
          <thead><tr><th scope="col">Gewerk</th><th scope="col">Stunden</th><th scope="col">Kosten (€)</th></tr></thead>
          <tbody>
            <tr><th scope="row">Gerüst</th><td>24</td><td>3.200,00 €</td></tr>
            <tr><th scope="row">Altdeckung abtragen</th><td>40</td><td>2.900,00 €</td></tr>
            <tr><th scope="row">Lattung und Unterdach</th><td>56</td><td>6.850,00 €</td></tr>
            <tr><th scope="row">Eindeckung Ziegel</th><td>96</td><td>14.400,00 €</td></tr>
            <tr><th scope="row">Spenglerarbeiten</th><td>32</td><td>5.100,00 €</td></tr>
            <tr><th scope="row">Entsorgung</th><td>8</td><td>1.250,00 €</td></tr>
          </tbody>
          <tfoot><tr><th scope="row">Summe</th><td>256</td><td>33.700,00 €</td></tr></tfoot>
        </table>
      </hp-chart>
    </section>

    <section id="preise-intern">
      <h2 id="preise-intern-h">Interne Preiskalkulation</h2>
      <p id="preise-intern-text">Einheitspreise des Auftragnehmers: Lattung 18,40 € je Laufmeter,
        Ziegel 42,10 € je Quadratmeter. Dieser Abschnitt ist mit der Sperre „no-print“ versehen und
        erscheint im Ausdruck nicht.</p>
    </section>
  </main>
</body>
</html>
`;

const anhang = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="de-AT" lang="de-AT">
<head>
  <meta charset="UTF-8"/>
  <title>Anhang</title>
  <link rel="stylesheet" type="text/css" href="styles/document.css"/>
</head>
<body>
  <section id="anhang">
    <h1 id="anhang-h">Anhang</h1>
    <section id="quellen">
      <h2 id="quellen-h">Quellen</h2>
      <ul id="quellen-liste">
        <li>ÖNORM B 2215, Holzbauarbeiten – Werkvertragsnorm.</li>
        <li>W3C: CSS Paged Media Module Level 3, <a href="https://www.w3.org/TR/css-page-3/">https://www.w3.org/TR/css-page-3/</a>.</li>
        <li>W3C: CSS Fragmentation Module Level 3, <a href="https://www.w3.org/TR/css-break-3/">https://www.w3.org/TR/css-break-3/</a>.</li>
      </ul>
    </section>
    <section id="begriffe">
      <h2 id="begriffe-h">Begriffe</h2>
      <section id="begriff-holzfeuchte">
        <h3 id="begriff-holzfeuchte-h">Holzfeuchte</h3>
        <p>Masse des Wassers im Holz bezogen auf die Masse des darrtrockenen Holzes, in Prozent.
          Für das Eindecken gilt hier ein Grenzwert von 18 Prozent (siehe <a href="index.xhtml#ueberblick">Überblick</a>).</p>
      </section>
      <section id="begriff-lattung">
        <h3 id="begriff-lattung-h">Lattung</h3>
        <p>Waagrechte Latten auf der Konterlattung, auf denen die Ziegel aufliegen. Der Abstand
          richtet sich nach dem Ziegelmodell.</p>
      </section>
    </section>
  </section>
</body>
</html>
`;

const css = `/* Beispiel p18-druck: Lesetext, Tabellen, Code, Medien, bewegter Ablaufplan. */
body {
  font-family: var(--hp-font-family, Georgia, "Times New Roman", serif);
  font-size: var(--hp-font-size, 1rem);
  line-height: var(--hp-line-height, 1.55);
  color: var(--hp-foreground, #1d1d1b);
  background: var(--hp-background, #ffffff);
  max-width: 46em;
  margin: 0 auto;
  padding: 1em;
}
h1, h2, h3 { font-family: system-ui, sans-serif; line-height: 1.25; }
p { margin: 0 0 var(--hp-paragraph-spacing, 1em); }
figure { margin: 1em 0; }
figcaption { font-size: 0.9em; }
video, img { max-width: 100%; height: auto; }
table { border-collapse: collapse; margin: 0.5em 0; }
th, td { border: 1px solid #999999; padding: 0.2em 0.5em; text-align: left; }
td { font-variant-numeric: tabular-nums; }
caption { text-align: left; font-weight: bold; padding-bottom: 0.3em; }
pre { background: #f3f4f5; padding: 0.6em; overflow-x: auto; font-size: 0.85em; }
aside[data-hp-priority] { border-left: 3px solid #8a8d91; padding-left: 0.8em; color: #3a3d40; }

/* Abgeleiteter Druck: Abbildungen, Tabellen und Code nicht teilen, soweit sie auf eine Seite passen;
   Überschriften beim Folgetext. */
figure, table, pre { break-inside: avoid; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; }

.ablauf { width: 100%; height: auto; max-width: 40em; }
.ablauf .linie { stroke: #8a8d91; stroke-width: 4; }
.ablauf circle { fill: #e8eef0; stroke: #1f4e5f; stroke-width: 3; }
.ablauf text { font: 15px system-ui, sans-serif; text-anchor: middle; fill: #1d1d1b; }
.ablauf .schritt { animation: hervorheben 10s linear infinite; }
.ablauf .s2 { animation-delay: -8s; }
.ablauf .s3 { animation-delay: -6s; }
.ablauf .s4 { animation-delay: -4s; }
.ablauf .s5 { animation-delay: -2s; }
@keyframes hervorheben {
  0%, 18% { opacity: 1; }
  20%, 100% { opacity: 0.45; }
}
@media (prefers-reduced-motion: reduce) {
  .ablauf .schritt { animation: none; opacity: 1; }
}
`;

// Wide image: 2400 × 330 px bar chart of the eight trades over ten weeks.
const bars = trades
  .map((t, r) => {
    const y = 40 + r * 34;
    return `  <text x="10" y="${y + 18}" font-size="18" font-family="sans-serif">${t}</text>\n  <rect x="${300 + r * 200}" y="${y}" width="600" height="24" fill="${r % 2 ? '#1f4e5f' : '#8a5a2b'}"/>`;
  })
  .join('\n');
const weekLabels = weeks.map((w, i) => `  <text x="${300 + i * 200 + 100}" y="26" font-size="18" font-family="sans-serif" text-anchor="middle">${w}</text>`).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="330" viewBox="0 0 2400 330" role="img" aria-labelledby="titel">
  <title id="titel">Balkenplan der acht Gewerke, Kalenderwochen 36 bis 45</title>
  <rect width="2400" height="330" fill="#ffffff"/>
${weekLabels}
${bars}
</svg>
`;

write('content/index.xhtml', index);
write('content/anhang.xhtml', anhang);
write('content/styles/document.css', css);
write('content/media/balkenplan.svg', svg);
copy('content/media/zeitraffer.webm', 'content/media/zeitraffer.webm');
copy('content/media/zeitraffer-standbild.png', 'content/media/zeitraffer-standbild.png');
copy('content/media/diagramm-statisch.svg', 'content/media/diagramm-statisch.svg');
copy('components/hp-chart@0.1.0/hp-chart.js', 'components/hp-chart@0.1.0/hp-chart.js');
copy('data/diagramm.json', 'data/diagramm.json');
copy('data/diagramm.schema.json', 'data/diagramm.schema.json');

const dokument = {
  id: 'urn:uuid:8d41f0b2-5c7e-4e2a-9f13-2b6a0c18d4e7',
  title: 'Dachsanierung Haus Nr. 12 – Feuchtemessung und Bauablauf',
  language: 'de-AT',
  modified: '2026-10-12T15:00:00Z',
  profile: 'interactive',
  creators: ['hpro Beispielsammlung'],
  description: 'Prüfdokument des Pakets P18 für den abgeleiteten A4-Ausdruck: lange und breite Tabellen, breites Bild, Codeblock mit langer Zeile, Video, Animation, Komponente, aufklappbare Abschnitte und eine Sperre no-print.',
  readingOrder: ['content/index.xhtml', 'content/anhang.xhtml'],
  toc: {
    title: 'Inhalt',
    entries: [
      { title: 'Überblick', href: 'content/index.xhtml#ueberblick' },
      { title: 'Messprotokoll', href: 'content/index.xhtml#messprotokoll' },
      {
        title: 'Bauzeitenplan',
        href: 'content/index.xhtml#bauzeitenplan',
        children: [
          { title: 'Stunden je Gewerk und Woche', href: 'content/index.xhtml#plan-tabelle' },
          { title: 'Übersicht als Balkenplan', href: 'content/index.xhtml#plan-bild' },
        ],
      },
      { title: 'Datenexport des Messgeräts', href: 'content/index.xhtml#datenexport' },
      { title: 'Zeitraffer der Eindeckung', href: 'content/index.xhtml#zeitraffer' },
      { title: 'Ablaufplan', href: 'content/index.xhtml#ablauf' },
      { title: 'Aufwand je Gewerk', href: 'content/index.xhtml#aufwand' },
      { title: 'Interne Preiskalkulation', href: 'content/index.xhtml#preise-intern' },
      {
        title: 'Anhang',
        href: 'content/anhang.xhtml#anhang',
        children: [
          { title: 'Quellen', href: 'content/anhang.xhtml#quellen' },
          { title: 'Begriffe', href: 'content/anhang.xhtml#begriffe' },
        ],
      },
    ],
  },
  accessibility: {
    accessMode: ['textual', 'visual'],
    accessModeSufficient: ['textual'],
    accessibilityFeature: ['structuralNavigation', 'tableOfContents', 'alternativeText', 'longDescription', 'displayTransformability'],
    accessibilityHazard: ['none'],
    accessibilitySummary: 'Tabellen mit Kopfzeilen, Bilder mit Alternativtext, Video und Animation mit Beschreibung; der Ausdruck nennt für jedes bewegte oder interaktive Element die Adresse der lebendigen Fassung.',
  },
  components: [{ name: 'hp-chart', version: '0.1.0', url: 'components/hp-chart@0.1.0/hp-chart.js' }],
  data: [{ url: 'data/diagramm.json', schema: 'data/diagramm.schema.json' }],
  access: [{ target: 'content/index.xhtml#preise-intern', rules: ['no-print'] }],
};
write('dokument.json', `${JSON.stringify(dokument, null, 2)}\n`);
console.log(`geschrieben: ${OUT} (Messprotokoll ${rows.length} Zeilen, Bauzeitenplan ${weeks.length + 2} Spalten, lange Zeile ${longLine.length} Zeichen)`);
