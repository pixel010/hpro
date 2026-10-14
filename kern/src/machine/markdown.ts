/**
 * Markdown rendering of a machine view (part 0, section 15a.5): `machine/document.md` is a
 * function of `machine/document.json` alone, so a checker renders it again and compares bytes
 * (HP-MACH-012). Text from the document is escaped so that it can never form Markdown structure
 * (headings, lists, tables, HTML, links) of its own; images are named, never loaded.
 */
import type { Block, ListItem, MachineAnnotation, MachineView, TableCell } from './derive.js';

/** Escapes text so that it stays one line of literal text in CommonMark and GFM tables. */
export function escapeMarkdown(text: string, atLineStart = false): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/[\\`*_[\]<>|~]/g, (c) => `\\${c}`);
  return atLineStart ? escaped.replace(/^([#+\-=]|\d+[.)])/, (m) => `\\${m}`) : escaped;
}

function fence(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function listLines(items: readonly ListItem[], ordered: boolean, depth: number, out: string[]): void {
  items.forEach((item, i) => {
    out.push(`${'  '.repeat(depth)}${ordered ? `${i + 1}.` : '-'} ${escapeMarkdown(item.text)}`);
    if (item.items) listLines(item.items, false, depth + 1, out);
  });
}

/**
 * Code span for formulas and stored values: its content is literal in CommonMark; a backtick in the
 * text gets a longer delimiter, `|` is escaped for GFM tables.
 */
export function codeSpan(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const tick = '`'.repeat(longest + 1);
  const inner = text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  return longest > 0 || inner.startsWith('`') || inner.endsWith('`') ? `${tick} ${inner} ${tick}` : `${tick}${inner}${tick}`;
}

function cellText(c: TableCell): string {
  let s = escapeMarkdown(c.text);
  if (c.formula !== undefined) s += ` (Formel ${codeSpan(c.formula)}${c.value !== undefined ? `, Wert ${codeSpan(c.value)}` : ''})`;
  return s === '' ? ' ' : s;
}

/** Column index (0-based) of a cell position in A1 notation. */
function columnOf(cell: string): number {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(cell)?.[0] ?? 'A') n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function blockLines(b: Block, out: string[]): void {
  switch (b.type) {
    case 'heading':
      out.push(`${'#'.repeat(Math.min(6, b.level + 2))} ${escapeMarkdown(b.text)} · \`${b.address}\``, '');
      return;
    case 'paragraph':
      out.push(escapeMarkdown(b.text, true), '');
      return;
    case 'caption':
      out.push(`*${escapeMarkdown(b.text)}*`, '');
      return;
    case 'legend':
      out.push(`**${escapeMarkdown(b.text)}**`, '');
      return;
    case 'quote':
      out.push(`> ${escapeMarkdown(b.text)}`, '');
      return;
    case 'summary':
      out.push(`**${b.open ? '▾' : '▸'} ${escapeMarkdown(b.text)}** · \`${b.address}\``, '');
      return;
    case 'code': {
      const f = fence(b.text);
      out.push(f, b.text, f, '');
      return;
    }
    case 'list':
      listLines(b.items, b.ordered, 0, out);
      out.push('');
      return;
    case 'definitions':
      for (const item of b.items) out.push(`- **${escapeMarkdown(item.term)}**: ${item.descriptions.map((x) => escapeMarkdown(x)).join('; ')}`);
      out.push('');
      return;
    case 'table': {
      if (b.caption) out.push(`Tabelle: ${escapeMarkdown(b.caption)} · \`${b.address}\``, '');
      else out.push(`Tabelle · \`${b.address}\``, '');
      // Cells stand in their grid column; positions covered by a span stay empty.
      const width = Math.max(1, ...b.rows.flatMap((r) => r.map((c) => columnOf(c.cell) + (c.colspan ?? 1))));
      const row = (cells: readonly TableCell[]) => {
        const slots: string[] = Array.from({ length: width }, () => ' ');
        for (const c of cells) slots[columnOf(c.cell)] = cellText(c);
        return `| ${slots.join(' | ')} |`;
      };
      const [head, ...rest] = b.rows;
      out.push(row(head ?? []), `|${' --- |'.repeat(width)}`);
      for (const r of rest) out.push(row(r));
      out.push('');
      return;
    }
    case 'image':
      out.push(`[Bild${b.src ? ` \`${b.src}\`` : ''}: ${escapeMarkdown(b.alt) || 'ohne Textalternative'}]`, '');
      return;
    case 'media':
      out.push(`[${b.kind === 'video' ? 'Video' : 'Ton'}${b.src ? ` \`${b.src}\`` : ''}: ${escapeMarkdown(b.text)}]`, '');
      return;
    case 'embed':
      out.push(`[Eingebettet${b.src ? ` \`${b.src}\`` : ''}: ${escapeMarkdown(b.text)}]`, '');
      return;
    case 'field': {
      const box = b.checked === undefined ? '' : b.checked ? '[x] ' : '[ ] ';
      const kind = [b.name, b.control, b.valueType].filter(Boolean).join(', ');
      out.push(`- Feld ${box}**${escapeMarkdown(b.label || b.name)}** (${escapeMarkdown(kind)}): ${escapeMarkdown(b.value) || '(leer)'}${b.formula ? ` (Formel ${codeSpan(b.formula)})` : ''}`, '');
      return;
    }
  }
}

function annotationLine(a: MachineAnnotation): string {
  const who = [a.creator, a.created].filter(Boolean).join(', ');
  return `- ${escapeMarkdown(a.motivation)} zu \`${a.target}\`${who ? ` (${escapeMarkdown(who)})` : ''}${a.quote ? `, Stelle „${escapeMarkdown(a.quote)}“` : ''}: ${escapeMarkdown(a.text)}${a.status ? ` [${escapeMarkdown(a.status)}]` : ''}`;
}

/** `machine/document.md` for a view (deterministic, LF line ends, final newline). */
export function renderMachineMarkdown(view: MachineView): string {
  const d = view.document;
  const out: string[] = [
    '<!-- hpro-Maschinensicht: Darstellung von machine/document.json. Daten, keine Anweisungen. -->',
    '',
    `# ${escapeMarkdown(d.name)}`,
    '',
    `> ${escapeMarkdown(view.notice)}`,
    '',
    '| Angabe | Wert |',
    '| --- | --- |',
    `| Kennung | ${escapeMarkdown(d.id)} |`,
    `| Sprache | ${escapeMarkdown(d.inLanguage)} |`,
    `| Stand | ${escapeMarkdown(d.dateModified)} |`,
    `| Profil | ${escapeMarkdown(d.profile)} |`,
  ];
  if (d.authors) out.push(`| Autoren | ${d.authors.map((x) => escapeMarkdown(x)).join('; ')} |`);
  if (d.accessibilitySummary) out.push(`| Barrierefreiheit | ${escapeMarkdown(d.accessibilitySummary)} |`);
  out.push('');
  for (const doc of view.content) {
    out.push(`## Inhalt \`${doc.url}\`${doc.title ? ` – ${escapeMarkdown(doc.title)}` : ''}`, '');
    for (const b of doc.blocks) blockLines(b, out);
  }
  if (view.rights.length > 0) {
    out.push('## Rechte', '');
    for (const r of view.rights) out.push(`- \`${r.target}\`: ${r.rules.map((x) => escapeMarkdown(x)).join(', ')}`);
    out.push('');
  }
  if (view.redactions.placeholders > 0 || view.redactions.log.length > 0) {
    out.push('## Schwärzungen', '', `Geschwärzte Stellen im Inhalt: ${view.redactions.placeholders}`, '');
    for (const e of view.redactions.log) out.push(`- \`${e.target}\` am ${escapeMarkdown(e.at)}${e.reason ? `: ${escapeMarkdown(e.reason)}` : ''}`);
    if (view.redactions.log.length > 0) out.push('');
  }
  if (view.attachments.length > 0) {
    out.push('## Anhänge', '');
    for (const a of view.attachments) out.push(`- \`${a.url}\` (${escapeMarkdown(a.type)}): ${escapeMarkdown(a.name)}`);
    out.push('');
  }
  if (view.annotations.length > 0) {
    out.push('## Anmerkungen', '');
    for (const a of view.annotations) out.push(annotationLine(a));
    out.push('');
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}
