/**
 * Author path (S5): the common document model between a source format (Markdown, Word) and the
 * hpro writer. A reader turns its source into this model and records what it could not carry
 * over; the writer (`write.ts`) applies a template and produces the container input. Keeping the
 * model small is deliberate: it holds what the office minimum profile can express (part 0,
 * section 15) plus the two building blocks of nested information (`details`, overview).
 */

export type Inline =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'em' | 'strong' | 'sub' | 'sup'; readonly c: readonly Inline[] }
  /** Direct formatting or a style name without structure (HP-MIN-012). */
  | { readonly t: 'span'; readonly c: readonly Inline[]; readonly style?: string; readonly cls?: string }
  | { readonly t: 'code'; readonly v: string }
  | { readonly t: 'br' }
  /** External hyperlink, absolute URL. */
  | { readonly t: 'link'; readonly href: string; readonly c: readonly Inline[] }
  /**
   * Reference inside the document to a mark name or kennung; resolved by the writer. `page`: the
   * source showed a page number, the writer shows the target text instead (HP-MIN-009).
   */
  | { readonly t: 'ref'; readonly target: string; readonly c: readonly Inline[]; readonly page?: boolean }
  /** Footnote or endnote: reference at this place, text written by the writer (HP-MIN-008). */
  | { readonly t: 'note'; readonly kind: 'footnote' | 'endnote'; readonly name?: string; readonly label?: string; readonly blocks: readonly Block[] }
  /** Bookmark inside text (a target without its own block). */
  | { readonly t: 'mark'; readonly name: string };

export interface BlockCommon {
  /** Names under which other places refer to this block (bookmarks, explicit kennungen). */
  readonly marks?: readonly string[];
  /** Style name of the source (`data-hp-style`, HP-MIN-012). */
  readonly style?: string;
}

export interface Cell {
  readonly c: readonly Block[];
  readonly colspan?: number;
  readonly rowspan?: number;
  /** Header cell of its row (`th scope="row"`). */
  readonly rowHeader?: boolean;
}

export interface Image {
  readonly data: Uint8Array;
  readonly mediaType: string;
  /** Name in the source; basis of the file name and of messages. */
  readonly name: string;
}

export type Block =
  | (BlockCommon & { readonly t: 'heading'; readonly level: number; readonly c: readonly Inline[] })
  | (BlockCommon & { readonly t: 'p'; readonly c: readonly Inline[] })
  | (BlockCommon & { readonly t: 'quote'; readonly blocks: readonly Block[] })
  | (BlockCommon & { readonly t: 'pre'; readonly text: string; readonly lang?: string })
  | (BlockCommon & { readonly t: 'list'; readonly ordered: boolean; readonly start?: number; readonly items: ReadonlyArray<readonly Block[]> })
  | (BlockCommon & { readonly t: 'table'; readonly caption?: readonly Inline[]; readonly head: ReadonlyArray<readonly Cell[]>; readonly body: ReadonlyArray<readonly Cell[]> })
  | (BlockCommon & { readonly t: 'figure'; readonly image: Image; readonly alt: string | null; readonly decorative?: boolean; readonly caption?: readonly Inline[]; readonly width?: number; readonly height?: number })
  /** Collapsible section (HP-NEST-001). */
  | (BlockCommon & { readonly t: 'details'; readonly summary: readonly Inline[]; readonly blocks: readonly Block[] })
  /** Overview readable without expanding (HP-NEST-005): `section data-hp-role="summary"`. */
  | (BlockCommon & { readonly t: 'summary'; readonly title: string; readonly blocks: readonly Block[] })
  /** Visible placeholder for content that could not be carried over. */
  | (BlockCommon & { readonly t: 'gap'; readonly text: string });

/** What a source reader found about the document itself. */
export interface SourceMeta {
  readonly title?: string;
  readonly language?: string;
  /** `YYYY-MM-DDThh:mm:ssZ`. */
  readonly modified?: string;
  readonly id?: string;
  readonly creators?: readonly string[];
  readonly description?: string;
  /** Further fields for the template (front matter, document properties). */
  readonly fields?: Readonly<Record<string, string | readonly string[]>>;
}

/**
 * Category of a message. The first four are the categories the loss measurement reports
 * (S5, acceptance 3); the rest name other kinds of content.
 */
export type Category = 'abschnitt' | 'tabelle' | 'bild' | 'fussnote' | 'liste' | 'verweis' | 'text' | 'formel' | 'format' | 'metadaten' | 'kommentar' | 'feld' | 'objekt' | 'vorlage';

/**
 * `verlust`: content of the source is not in the document; `ersatz`: carried over in a weaker
 * form (text instead of structure, placeholder, assumed value); `hinweis`: nothing is lost, the
 * author should know (e.g. a derived kennung); `fehler`: the template's rules are not met.
 */
export type Severity = 'verlust' | 'ersatz' | 'hinweis' | 'fehler';

export interface Message {
  readonly code: string;
  readonly category: Category;
  readonly severity: Severity;
  readonly text: string;
  /** How often it happened (default 1). */
  readonly count?: number;
}

export interface AuthorSource {
  readonly meta: SourceMeta;
  readonly blocks: readonly Block[];
  /** Messages of the reader: everything it dropped, weakened or assumed. */
  readonly messages: readonly Message[];
  /** What the source contained, counted by the reader before conversion. */
  readonly inventory: Readonly<Record<string, number>>;
  /** Source format and file, for `manifest.json#source`. */
  readonly format: { readonly name: string; readonly mediaType: string; readonly tool: { readonly name: string; readonly version: string } };
  /**
   * The source has no title style: headings of outline level 1 are `h1` and open the sections
   * (part 0, table 15.2: „h<n+1>, wenn die Quelle eine Titelvorlage nutzt, sonst h<n>“); the
   * document name comes from the metadata.
   */
  readonly untitled?: boolean;
}

/** Collects messages, merging identical code + text into one entry with a count. */
export class Messages {
  private readonly list: Message[] = [];
  add(code: string, category: Category, severity: Severity, text: string): void {
    const same = this.list.findIndex((m) => m.code === code && m.text === text);
    if (same >= 0) {
      const m = this.list[same]!;
      this.list[same] = { ...m, count: (m.count ?? 1) + 1 };
    } else this.list.push({ code, category, severity, text });
  }
  get all(): readonly Message[] {
    return this.list;
  }
}

/** Plain text of inline content (for kennungen, alternative texts, messages). */
export function plain(c: readonly Inline[]): string {
  let s = '';
  for (const i of c) {
    if (i.t === 'text' || i.t === 'code') s += i.v;
    else if (i.t === 'br') s += ' ';
    else if (i.t === 'note' || i.t === 'mark') continue;
    else s += plain(i.c);
  }
  return s.replace(/\s+/g, ' ').trim();
}

export const text = (v: string): Inline => ({ t: 'text', v });
