/**
 * Minimal PDF reader for the print tests (P18): page order, page size and named destinations
 * of a PDF written by Chromium (Skia). Skia writes a classic cross-reference table and plain
 * (uncompressed) dictionaries; object streams are rejected rather than guessed. Text extraction
 * is not done here — the evidence run uses pypdf and pdfium for that (scripts/p18-pdf-pruefung.py).
 */
export interface PdfPage {
  readonly ref: number;
  /** MediaBox width and height in points. */
  readonly width: number;
  readonly height: number;
}

export interface PdfInfo {
  readonly version: string;
  readonly pages: readonly PdfPage[];
  /** Named destination → 1-based page number. */
  readonly dests: Readonly<Record<string, number>>;
  readonly tagged: boolean;
  readonly outline: boolean;
  readonly title?: string;
  readonly lang?: string;
}

function decodeName(name: string): string {
  return name.replace(/#([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** Text string bytes (one char per byte): UTF-16BE with BOM, else PDFDocEncoding (taken as Latin-1). */
function decodeTextBytes(raw: string): string {
  if (raw.charCodeAt(0) === 0xfe && raw.charCodeAt(1) === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < raw.length; i += 2) out += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1));
    return out;
  }
  return raw;
}

/** Literal string `( … )` with escapes. */
function decodeLiteral(raw: string): string {
  const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
  return decodeTextBytes(raw.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, e: string) => map[e] ?? String.fromCharCode(parseInt(e, 8))));
}

export function readPdf(bytes: Uint8Array): PdfInfo {
  const text = Buffer.from(bytes).toString('latin1');
  const version = /^%PDF-(\d\.\d)/.exec(text)?.[1];
  if (!version) throw new Error('not a PDF');
  if (/\/Type\s*\/ObjStm/.test(text)) throw new Error('object streams are not supported by this reader');
  const startxref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  if (!startxref) throw new Error('startxref missing');
  const offsets = new Map<number, number>();
  let pos = Number(startxref[1]);
  if (!text.startsWith('xref', pos)) throw new Error('classic xref table expected');
  pos += 4;
  const xref = /\s*(\d+)\s+(\d+)\s*/y;
  for (;;) {
    xref.lastIndex = pos;
    const head = xref.exec(text);
    if (!head) break;
    const first = Number(head[1]);
    const count = Number(head[2]);
    pos = xref.lastIndex;
    for (let i = 0; i < count; i++) {
      const entry = text.slice(pos, pos + 20);
      const m = /^(\d{10}) (\d{5}) ([nf])/.exec(entry);
      if (!m) throw new Error(`bad xref entry at ${pos}`);
      if (m[3] === 'n') offsets.set(first + i, Number(m[1]));
      pos += 20;
    }
  }
  const trailer = text.slice(pos, text.indexOf('startxref', pos));
  const rootRef = Number(/\/Root\s+(\d+)\s+0\s+R/.exec(trailer)?.[1]);
  const infoRef = /\/Info\s+(\d+)\s+0\s+R/.exec(trailer)?.[1];

  const object = (n: number): string => {
    const at = offsets.get(n);
    if (at === undefined) throw new Error(`object ${n} missing`);
    const end = text.indexOf('endobj', at);
    const body = text.slice(at, end);
    const stream = body.indexOf('stream');
    return stream >= 0 ? body.slice(0, stream) : body;
  };

  const catalog = object(rootRef);
  const pagesRef = Number(/\/Pages\s+(\d+)\s+0\s+R/.exec(catalog)?.[1]);
  const pages: PdfPage[] = [];
  const walk = (ref: number, inherited: number[] | undefined) => {
    const dict = object(ref);
    const box = /\/MediaBox\s*\[\s*([-\d.\s]+)\]/.exec(dict)?.[1]?.trim().split(/\s+/).map(Number) ?? inherited;
    if (/\/Type\s*\/Pages\b/.test(dict)) {
      const kids = /\/Kids\s*\[([^\]]*)\]/.exec(dict)?.[1] ?? '';
      for (const k of kids.matchAll(/(\d+)\s+0\s+R/g)) walk(Number(k[1]), box);
    } else {
      if (!box) throw new Error(`page ${ref} without MediaBox`);
      pages.push({ ref, width: box[2]! - box[0]!, height: box[3]! - box[1]! });
    }
  };
  walk(pagesRef, undefined);
  const pageNo = new Map(pages.map((p, i) => [p.ref, i + 1]));

  const dests: Record<string, number> = {};
  const destsRef = /\/Dests\s+(\d+)\s+0\s+R/.exec(catalog)?.[1];
  if (destsRef) {
    const dict = object(Number(destsRef));
    for (const m of dict.matchAll(/\/([^\s/\[\]<>()]+)\s*\[\s*(\d+)\s+0\s+R/g)) {
      const n = pageNo.get(Number(m[2]));
      if (n) dests[decodeName(m[1]!)] = n;
    }
  }
  let title: string | undefined;
  if (infoRef) {
    const info = object(Number(infoRef));
    const literal = /\/Title\s*\(((?:\\.|[^\\)])*)\)/.exec(info)?.[1];
    const hex = /\/Title\s*<([0-9A-Fa-f\s]*)>/.exec(info)?.[1];
    if (literal !== undefined) title = decodeLiteral(literal);
    else if (hex !== undefined) title = decodeTextBytes(Buffer.from(hex.replace(/\s+/g, ''), 'hex').toString('latin1'));
  }
  const lang = /\/Lang\s*\(((?:\\.|[^\\)])*)\)/.exec(catalog)?.[1];
  return {
    version,
    pages,
    dests,
    tagged: /\/MarkInfo\s*<<[^>]*\/Marked\s+true/.test(catalog) && /\/StructTreeRoot\s+\d+\s+0\s+R/.test(catalog),
    outline: /\/Outlines\s+\d+\s+0\s+R/.test(catalog),
    ...(title !== undefined ? { title } : {}),
    ...(lang !== undefined ? { lang: decodeLiteral(lang) } : {}),
  };
}
