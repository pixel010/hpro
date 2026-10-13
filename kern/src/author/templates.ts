/**
 * Templates of the author path (S5). A template is what an author picks before writing: it sets
 * the stylesheet, the fields the document needs (title, date, addressee …), a header made from
 * these fields, required sections, and whether the result claims the office minimum profile
 * (HP-MIN-001). It never adds structure the source does not have, except the header lines and the
 * title, both from fields the author filled in.
 *
 * Every stylesheet derives size, spacing and colour from the reading-system variables `--hp-*`
 * with fallbacks and never sets them on `:root` (HP-INH-004), keeps tables, figures and code
 * together (HP-INH-016) and ends every `font-family` with a generic family.
 */

export interface TemplateField {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  /** `lines`: several lines (address); `list`: several values (authors); `date`: YYYY-MM-DD or ISO. */
  readonly kind?: 'text' | 'lines' | 'list' | 'date';
}

export interface Template {
  /** Short name, `[a-z][a-z0-9-]*`; also the stylesheet name. */
  readonly name: string;
  readonly label: string;
  readonly description: string;
  /** Default language when the source names none (BCP 47). */
  readonly language: string;
  readonly css: string;
  /** Claim the office minimum profile when the content stays within its element set. */
  readonly officeMin: boolean;
  readonly fields: readonly TemplateField[];
  /** Field that gives the title (default `titel`; a letter uses its subject). */
  readonly titleField?: string;
  /**
   * Header lines after the title, each a paragraph. `{{feld}}` is replaced by the field value; a
   * line whose fields are all empty is left out. `{{datum}}` is the date written out.
   */
  readonly head?: readonly string[];
  /** Closing lines at the end of the document (same rules as `head`). */
  readonly foot?: readonly string[];
  /** Top-level sections that must exist, compared by heading text without numbering. */
  readonly sections?: readonly string[];
  /** Overview section (HP-NEST-005); `required` makes its absence an error. */
  readonly summary?: { readonly title: string; readonly required: boolean };
  /** Markdown starter for `hpro author neu`; `{{id}}` and `{{heute}}` are filled in. */
  readonly skeleton: string;
}

const BASE_CSS = `body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: var(--hp-font-size, 1rem);
  line-height: var(--hp-line-height, 1.5);
  letter-spacing: var(--hp-letter-spacing, normal);
  word-spacing: var(--hp-word-spacing, normal);
  color: var(--hp-foreground, #111);
  background: var(--hp-background, #fff);
  margin: 0 auto;
  max-width: 42em;
  padding: 1em;
  overflow-wrap: break-word;
}
p, ul, ol, table, pre, blockquote, figure, aside, details {
  margin-top: var(--hp-paragraph-spacing, 1em);
  margin-bottom: var(--hp-paragraph-spacing, 1em);
}
h1, h2, h3, h4, h5, h6 { break-after: avoid; line-height: 1.25; }
table, figure, pre { break-inside: avoid; }
table { border-collapse: collapse; max-width: 100%; }
caption { text-align: left; font-style: italic; padding-bottom: 0.25em; }
th, td { border: 1px solid currentColor; padding: 0.25em 0.5em; text-align: left; vertical-align: top; hyphens: auto; overflow-wrap: anywhere; }
figure { margin-left: 0; margin-right: 0; }
figure img { max-width: 100%; height: auto; }
figcaption { font-size: 0.9em; }
pre { white-space: pre-wrap; font-family: "DejaVu Sans Mono", Consolas, monospace; }
code { font-family: "DejaVu Sans Mono", Consolas, monospace; }
blockquote { margin-left: 2em; }
aside[role="doc-footnote"] { font-size: 0.9em; border-top: 1px solid currentColor; }
p.hp-kopf { margin: 0; }
p.hp-import-luecke { font-style: italic; }
p.hp-formel { text-align: center; }
span.hp-fett { font-weight: bold; }
span.hp-kursiv { font-style: italic; }
span.hp-unterstrichen { text-decoration: underline; }
span.hp-durchgestrichen { text-decoration: line-through; }
details > summary { cursor: pointer; font-weight: bold; }
section[data-hp-role="summary"] { border-left: 0.25em solid currentColor; padding-left: 0.75em; }
`;

const css = (name: string, extra: string) => `/* hpro-Vorlage „${name}“ (S5). Darstellung aus den Lesesystem-Variablen --hp-* (HP-INH-004). */\n${BASE_CSS}${extra}`;

export const TEMPLATES: readonly Template[] = [
  {
    name: 'frei',
    label: 'Freies Dokument',
    description: 'Keine Pflichtfelder außer dem Titel; nimmt das Mindestprofil für Büroprogramme in Anspruch, solange der Inhalt darin bleibt. Standard für Importe aus Word.',
    language: 'de',
    css: css('frei', ''),
    officeMin: true,
    fields: [
      { key: 'titel', label: 'Titel', required: true },
      { key: 'autoren', label: 'Verfasst von', kind: 'list' },
      { key: 'datum', label: 'Stand', kind: 'date' },
    ],
    skeleton: `---
titel: Titel des Dokuments
kennung: {{id}}
datum: {{heute}}
sprache: de-AT
---

# Titel des Dokuments

Einleitender Absatz.

## Erster Abschnitt {#erster-abschnitt}

Text mit Fußnote[^1].

[^1]: Text der Fußnote.
`,
  },
  {
    name: 'bericht',
    label: 'Bericht',
    description: 'Bericht oder Prüfbericht: Titel, Stand und Verfasser im Kopf, Zusammenfassung als Überblick vor dem ersten Abschnitt (HP-NEST-005), aufklappbare Details erlaubt. Stufe Basis, nicht das Mindestprofil (Überblick und Details liegen außerhalb des Elementbestands).',
    language: 'de',
    css: css('bericht', `h1 { font-size: 1.6em; }
h2 { font-size: 1.3em; border-bottom: 1px solid currentColor; }
p.hp-kopf { font-size: 0.95em; }
`),
    officeMin: false,
    fields: [
      { key: 'titel', label: 'Titel', required: true },
      { key: 'datum', label: 'Stand', required: true, kind: 'date' },
      { key: 'autoren', label: 'Verfasst von', required: true, kind: 'list' },
      { key: 'auftraggeber', label: 'Auftraggeber' },
      { key: 'geschaeftszahl', label: 'Geschäftszahl' },
    ],
    head: ['Stand: {{datum}}', 'Verfasst von: {{autoren}}', 'Auftraggeber: {{auftraggeber}}', 'Geschäftszahl: {{geschaeftszahl}}'],
    summary: { title: 'Zusammenfassung', required: true },
    skeleton: `---
titel: Titel des Berichts
kennung: {{id}}
datum: {{heute}}
autoren:
  - Name der Verfasserin
auftraggeber: Name des Auftraggebers
sprache: de-AT
---

# Titel des Berichts

::: zusammenfassung
Das Wichtigste in drei Sätzen: Anlass, Ergebnis, Empfehlung.
:::

## Anlass {#anlass}

Worum es geht.

## Befund {#befund}

| Messpunkt | Wert | Einheit |
|-----------|-----:|---------|
| M1        | 12,5 | %       |

Table: Messwerte

## Empfehlung {#empfehlung}

::: details Herleitung im Einzelnen
Der Weg zum Ergebnis, für Leser, die es genau wissen wollen.
:::
`,
  },
  {
    name: 'brief',
    label: 'Brief',
    description: 'Geschäftsbrief: Absender, Empfänger, Ort und Datum im Kopf, Betreff als Titel, Gruß und Unterschrift am Ende. Mindestprofil für Büroprogramme.',
    language: 'de',
    css: css('brief', `h1 { font-size: 1.2em; margin-top: 2em; }
p.hp-kopf + p.hp-kopf { margin-top: 1em; }
p.hp-schluss { margin-top: 0.25em; margin-bottom: 0; }
`),
    officeMin: true,
    fields: [
      { key: 'absender', label: 'Absender', required: true, kind: 'lines' },
      { key: 'empfaenger', label: 'Empfänger', required: true, kind: 'lines' },
      { key: 'ort', label: 'Ort', required: true },
      { key: 'datum', label: 'Datum', required: true, kind: 'date' },
      { key: 'betreff', label: 'Betreff', required: true },
      { key: 'gruss', label: 'Grußformel' },
      { key: 'unterschrift', label: 'Unterschrift (Name)' },
    ],
    titleField: 'betreff',
    head: ['{{absender}}', '{{empfaenger}}', '{{ort}}, {{datum}}'],
    foot: ['{{gruss}}', '{{unterschrift}}'],
    skeleton: `---
absender: |
  Büro Beispiel
  Dorfstraße 1
  6020 Innsbruck
empfaenger: |
  Frau Maria Beispiel
  Hauptplatz 3
  6020 Innsbruck
ort: Innsbruck
datum: {{heute}}
betreff: Betreff des Briefs
kennung: {{id}}
gruss: Mit freundlichen Grüßen
unterschrift: Name
sprache: de-AT
---

Sehr geehrte Frau Beispiel,

Text des Briefs.
`,
  },
  {
    name: 'angebot',
    label: 'Angebot',
    description: 'Angebot mit Kopf (Nummer, Datum, Anbieter, Kunde, Gültigkeit) und den Pflichtabschnitten Leistung, Positionen und Bedingungen. Mindestprofil für Büroprogramme.',
    language: 'de',
    css: css('angebot', `h1 { font-size: 1.5em; }
table { width: 100%; }
td:last-child, th:last-child { text-align: right; }
`),
    officeMin: true,
    fields: [
      { key: 'titel', label: 'Titel', required: true },
      { key: 'angebotsnummer', label: 'Angebotsnummer', required: true },
      { key: 'datum', label: 'Datum', required: true, kind: 'date' },
      { key: 'anbieter', label: 'Anbieter', required: true },
      { key: 'kunde', label: 'Kunde', required: true },
      { key: 'gueltig_bis', label: 'Gültig bis' },
    ],
    head: ['Angebot Nr. {{angebotsnummer}} vom {{datum}}', 'Anbieter: {{anbieter}}', 'Für: {{kunde}}', 'Gültig bis: {{gueltig_bis}}'],
    sections: ['Leistung', 'Positionen', 'Bedingungen'],
    skeleton: `---
titel: Angebot Titel
angebotsnummer: 2026-001
datum: {{heute}}
anbieter: Büro Beispiel
kunde: Name des Kunden
gueltig_bis: 30. November 2026
kennung: {{id}}
sprache: de-AT
---

# Angebot Titel

## Leistung {#leistung}

Was wir tun.

## Positionen {#positionen}

| Position | Menge | Betrag |
|----------|------:|-------:|
| Arbeit   | 1     | 100,00 EUR |

Table: Positionen

## Bedingungen {#bedingungen}

Zahlbar binnen 30 Tagen.
`,
  },
];

export function findTemplate(name: string): Template | undefined {
  return TEMPLATES.find((t) => t.name === name);
}

const NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Checks a template description from a file (`vorlage.json` plus stylesheet) and returns it as a
 * template. Throws with a German message naming the first problem.
 */
export function parseTemplate(json: unknown, css: string): Template {
  const fail = (m: string): never => {
    throw new Error(`Vorlage ungültig: ${m}`);
  };
  if (typeof json !== 'object' || json === null || Array.isArray(json)) fail('Wurzel muss ein JSON-Objekt sein');
  const o = json as Record<string, unknown>;
  const str = (k: string, required = true): string | undefined => {
    const v = o[k];
    if (v === undefined && !required) return undefined;
    if (typeof v !== 'string' || v.trim() === '') fail(`„${k}“ muss ein nicht leerer Text sein`);
    return v as string;
  };
  const strList = (k: string): string[] | undefined => {
    const v = o[k];
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) fail(`„${k}“ muss eine Liste von Texten sein`);
    return v as string[];
  };
  const name = str('name')!;
  if (!NAME.test(name)) fail(`„name“ muss dem Muster ${NAME.source} folgen`);
  if (/(^|[;{\s])(:root)\s*\{[^}]*--hp-/.test(css)) fail('das Stylesheet setzt Lesesystem-Variablen auf :root (HP-INH-004)');
  if (/@import|url\(\s*['"]?(https?:)?\/\//i.test(css)) fail('das Stylesheet lädt Dateien von außen (HP-CONT-010)');
  const fields: TemplateField[] = [];
  if (o.fields !== undefined) {
    if (!Array.isArray(o.fields)) fail('„fields“ muss eine Liste sein');
    for (const f of o.fields as unknown[]) {
      const x = f as Record<string, unknown>;
      if (typeof x?.key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(x.key)) fail('jedes Feld braucht „key“ nach ^[a-z][a-z0-9_]*$');
      if (x.kind !== undefined && !['text', 'lines', 'list', 'date'].includes(x.kind as string)) fail(`Feld ${String(x.key)}: „kind“ unbekannt`);
      const field: TemplateField = { key: x.key as string, label: typeof x.label === 'string' ? x.label : (x.key as string), required: x.required === true };
      fields.push(x.kind ? { ...field, kind: x.kind as NonNullable<TemplateField['kind']> } : field);
    }
  }
  const summary = o.summary as Record<string, unknown> | undefined;
  if (summary !== undefined && (typeof summary !== 'object' || typeof summary.title !== 'string')) fail('„summary“ braucht „title“');
  const head = strList('head');
  const foot = strList('foot');
  const sections = strList('sections');
  const titleField = str('titleField', false);
  return {
    name,
    label: str('label', false) ?? name,
    description: str('description', false) ?? '',
    language: str('language', false) ?? 'de',
    css,
    officeMin: o.officeMin === true,
    fields,
    ...(titleField ? { titleField } : {}),
    ...(head ? { head } : {}),
    ...(foot ? { foot } : {}),
    ...(sections ? { sections } : {}),
    ...(summary ? { summary: { title: summary.title as string, required: summary.required === true } } : {}),
    skeleton: str('skeleton', false) ?? '',
  };
}
