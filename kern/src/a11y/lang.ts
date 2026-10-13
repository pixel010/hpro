/**
 * Language of the document and of its parts (WCAG 2.2 success criteria 3.1.1 and 3.1.2,
 * HP-INH-002): well-formedness of BCP 47 tags, proposals for common wrong spellings, and a small
 * stop-word test that finds passages in another language than the one declared around them.
 * The test only knows German, English, French, Italian and Spanish; other languages are not
 * judged (no finding, no false alarm).
 */

/** Well-formed language tag after RFC 5646, section 2.1 (grandfathered tags aside). */
const BCP47 =
  /^(?:(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?(?:-(?:[a-z\d]{5,8}|\d[a-z\d]{3}))*(?:-[\da-wy-z](?:-[a-z\d]{2,8})+)*(?:-x(?:-[a-z\d]{1,8})+)?|x(?:-[a-z\d]{1,8})+)$/i;

/** ISO 639-1 two-letter codes (all 183 that the IANA registry lists as languages). */
const ISO639_1 = new Set(
  ('aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ' +
    'ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my ' +
    'na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ' +
    'ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu').split(' '),
);

/** Why a language tag is not usable, or undefined when it is. */
export function langProblem(tag: string | null): string | undefined {
  if (tag === null) return 'fehlt';
  if (tag.trim() === '') return 'ist leer';
  if (!BCP47.test(tag)) return `„${tag}“ ist kein Sprachkennzeichen nach BCP 47`;
  const primary = tag.split('-')[0]!.toLowerCase();
  if (primary.length === 2 && !ISO639_1.has(primary)) return `„${primary}“ ist kein Sprachcode nach ISO 639-1`;
  if (primary.length >= 5) return `„${primary}“ ist kein registrierter Sprachcode (Sprachname statt Kürzel?)`;
  return undefined;
}

const NAMES: Record<string, string> = {
  deutsch: 'de', german: 'de', germany: 'de', ger: 'de', englisch: 'en', english: 'en', eng: 'en', englisch_us: 'en-US', französisch: 'fr', franzoesisch: 'fr',
  french: 'fr', francais: 'fr', français: 'fr', italienisch: 'it', italian: 'it', italiano: 'it', spanisch: 'es', spanish: 'es', espanol: 'es', español: 'es',
};

/** A usable tag for a broken one (`de_AT` → `de-AT`, `English` → `en`), or undefined. */
export function suggestLang(tag: string | null): string | undefined {
  if (tag === null) return undefined;
  const t = tag.trim();
  const named = NAMES[t.toLowerCase()];
  if (named) return named;
  const parts = t.replace(/_/g, '-').split('-').filter(Boolean);
  if (parts.length === 0) return undefined;
  const fixed = parts.map((p, i) => (i === 0 ? p.toLowerCase() : p.length === 2 ? p.toUpperCase() : p.length === 4 ? p[0]!.toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase())).join('-');
  return langProblem(fixed) === undefined ? fixed : undefined;
}

/** Display names of the languages the passage test knows. */
export const LANGUAGE_NAMES: Record<string, string> = { de: 'Deutsch', en: 'Englisch', fr: 'Französisch', it: 'Italienisch', es: 'Spanisch' };

const STOP_RAW: Record<string, string> = {
  de: 'der die das und ist nicht ein eine einer einen mit von zu den dem des auf für im sich auch als wird werden sind bei nach aus oder wenn wie über noch nur kann muss dass wir ihr sie',
  en: 'the and is are of to that it with for as was on be by this which or from at not have has will can should must been their they these would there we you',
  fr: 'le les et est des une du dans que qui pour pas sur avec ce sont il elle au aux ne nous vous mais ou être cette ces par',
  it: 'il lo gli è di che una per non sono con del della nel alla come anche più questo questa ma',
  es: 'el los las y de que en una por con para no se del al lo como más pero sus este esta son',
};

/** Stop words that belong to exactly one of the five languages. */
const STOP: Record<string, Set<string>> = (() => {
  const count = new Map<string, number>();
  for (const words of Object.values(STOP_RAW)) for (const w of new Set(words.split(' '))) count.set(w, (count.get(w) ?? 0) + 1);
  return Object.fromEntries(Object.entries(STOP_RAW).map(([l, words]) => [l, new Set(words.split(' ').filter((w) => count.get(w) === 1))]));
})();

/**
 * The language a passage is evidently written in, when it differs from `declared` (primary
 * subtag); undefined when the passage is short, ambiguous or in the declared language.
 */
export function foreignLanguage(text: string, declared: string): string | undefined {
  const primary = declared.split('-')[0]!.toLowerCase();
  if (!(primary in STOP)) return undefined;
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length < 6) return undefined;
  const scores = Object.entries(STOP)
    .map(([lang, set]) => ({ lang, n: words.filter((w) => set.has(w)).length }))
    .sort((a, b) => b.n - a.n);
  const best = scores[0]!;
  const second = scores[1]!;
  const own = scores.find((s) => s.lang === primary)!.n;
  if (best.lang === primary) return undefined;
  if (best.n < Math.max(3, 0.2 * words.length)) return undefined;
  if (best.n < 2 * second.n || own * 3 > best.n) return undefined;
  return best.lang;
}
