/**
 * Signature rules (part 1, sections 5.8 and 7): structure of `META-INF/signatures.xml`,
 * XAdES properties, algorithms, references, assignment of signatures to versions (7.1),
 * coverage, ODF manifest, timestamps and the validation verdict (7.5) using the core's own
 * XAdES validation (P2).
 */
import { base64Decode, parseCertificate, type Certificate } from '../x509.js';
import { parseSignatureFile, verifyXadesSignature } from '../xades.js';
import { RFC3339_UTC_RE, finding, isObject, isValidUtc, loc, typeOf, type Ctx, type Fassung, type Signature } from './context.js';
import { children, decodeUtf8, elements, localName, NS, parseXml, type XmlElement } from './markup.js';

const SIGNED_PROPERTIES_TYPE = 'http://uri.etsi.org/01903#SignedProperties';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const DIGESTS_OK = new Set(['http://www.w3.org/2001/04/xmlenc#sha256', 'http://www.w3.org/2001/04/xmldsig-more#sha384', 'http://www.w3.org/2001/04/xmlenc#sha512']);
const SIGNATURE_METHODS_OK: Record<string, 'RSA' | 'RSA-PSS' | 'EC'> = {
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256': 'RSA',
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha384': 'RSA',
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512': 'RSA',
  'http://www.w3.org/2007/05/xmldsig-more#sha256-rsa-MGF1': 'RSA-PSS',
  'http://www.w3.org/2007/05/xmldsig-more#sha384-rsa-MGF1': 'RSA-PSS',
  'http://www.w3.org/2007/05/xmldsig-more#sha512-rsa-MGF1': 'RSA-PSS',
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256': 'EC',
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384': 'EC',
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512': 'EC',
};
const CERT_DIGESTS: Record<string, 'SHA-256' | 'SHA-384' | 'SHA-512' | 'SHA-1'> = {
  'http://www.w3.org/2001/04/xmlenc#sha256': 'SHA-256',
  'http://www.w3.org/2001/04/xmldsig-more#sha384': 'SHA-384',
  'http://www.w3.org/2001/04/xmlenc#sha512': 'SHA-512',
  'http://www.w3.org/2000/09/xmldsig#sha1': 'SHA-1',
};
const SIG_FILE = /^META-INF\/signatures[^/]*\.xml$/;

const isDs = (e: XmlElement | undefined, name: string): boolean => !!e && e.namespaceURI === NS.ds && localName(e) === name;
const isXades = (e: XmlElement | undefined, name: string): boolean => !!e && (e.namespaceURI === NS.xades || e.namespaceURI === NS.xades141) && localName(e) === name;
const child = (e: XmlElement | undefined, test: (x: XmlElement) => boolean) => (e ? children(e).find(test) : undefined);
const find = (e: XmlElement, test: (x: XmlElement) => boolean) => elements(e).find(test);
const idOf = (e: XmlElement) => e.getAttribute('Id') ?? e.getAttribute('ID') ?? e.getAttribute('id') ?? '';

function decodeUri(uri: string): string | null {
  if (uri.startsWith('#') || uri === '') return null;
  try {
    return decodeURIComponent(uri.replace(/^\.\//, ''));
  } catch {
    return uri;
  }
}

/** Reads every `ds:Signature` of the signature files and assigns it to a version (7.1). Also HPR-SIG-001, -022, -003. */
export function collectSignatures(ctx: Ctx): void {
  const r = ctx.report;
  r.ran('HPR-SIG-001', 'HPR-SIG-003', 'HPR-SIG-022');
  for (const e of ctx.scan.entries) {
    if (/^META-INF\/[^/]*signature[^/]*\.p7s$/i.test(e.name) || /^META-INF\/ASiCManifest[^/]*\.xml$/.test(e.name)) r.finding('HPR-SIG-003', { pfad: e.name }, loc.entry(e.name));
  }
  const files = [...ctx.files.keys()].filter((p) => SIG_FILE.test(p)).sort((a, b) => (a === 'META-INF/signatures.xml' ? -1 : b === 'META-INF/signatures.xml' ? 1 : a.localeCompare(b)));
  for (const path of files) {
    const text = decodeUtf8(ctx.files.get(path)!);
    const parsed = text === undefined ? undefined : parseXml(text);
    if (path === 'META-INF/signatures.xml') {
      const add = (grund: string, line?: number) => r.finding('HPR-SIG-001', { grund }, loc.xml(path, line));
      if (!parsed?.doc) {
        add(text === undefined ? 'kein gültiges UTF-8' : `nicht wohlgeformt: ${parsed?.error?.message}`, parsed?.error?.line);
        continue;
      }
      const root = parsed.doc.documentElement!;
      if (localName(root) !== 'signatures' || root.namespaceURI !== NS.ocf) add(`Wurzel {${root.namespaceURI ?? ''}}${localName(root)}`);
      for (const c of children(root)) if (!isDs(c, 'Signature')) add(`unerwartetes Kind {${c.namespaceURI ?? ''}}${localName(c)}`);
    }
    if (!parsed?.doc) continue;
    const isNested = (e: XmlElement) => {
      for (let p = e.parentNode; p && p.nodeType === 1; p = p.parentNode) if (isDs(p as unknown as XmlElement, 'Signature')) return true;
      return false;
    };
    const sigs = elements(parsed.doc).filter((e) => isDs(e, 'Signature') && !isNested(e));
    if (path !== 'META-INF/signatures.xml' && sigs.length > 0) r.finding('HPR-SIG-022', { pfad: path }, loc.entry(path));
    for (const el of sigs) {
      const signedInfo = child(el, (x) => isDs(x, 'SignedInfo'));
      const references = (signedInfo ? children(signedInfo) : []).filter((x) => isDs(x, 'Reference')).map((ref) => {
        const uri = ref.getAttribute('URI') ?? '';
        return { uri, path: decodeUri(uri), type: ref.getAttribute('Type'), id: ref.getAttribute('Id') };
      });
      const signingTime = find(el, (x) => isXades(x, 'SigningTime'))?.textContent?.trim();
      const sig: Signature = { file: path, id: idOf(el) || `(${path} #${ctx.signatures.length + 1})`, element: el, references, fassung: null, mixed: false, ...(signingTime ? { signingTime } : {}) };
      const filePaths = references.map((x) => x.path).filter((p): p is string => p !== null && p !== 'META-INF/container.xml');
      const ids = new Set(filePaths.map((p) => (/^renditions\/([^/]+)\//.exec(p)?.[1] ?? null)));
      if (filePaths.length > 0 && ids.size === 1 && !ids.has(null)) sig.fassung = [...ids][0]!;
      else if ([...ids].some((i) => i !== null)) sig.mixed = true;
      ctx.signatures.push(sig);
    }
  }
  if (ctx.signatures.length > 0) r.claim('Signiert');
}

async function rsaBits(cert: Certificate): Promise<number | undefined> {
  try {
    const key = await crypto.subtle.importKey('spki', new Uint8Array(cert.spki), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
    return (key.algorithm as RsaHashedKeyAlgorithm).modulusLength;
  } catch {
    return undefined;
  }
}

function signingCertificate(sig: XmlElement): Certificate | undefined {
  const b64 = find(sig, (x) => isDs(x, 'X509Certificate'))?.textContent?.replace(/\s+/g, '');
  if (!b64) return undefined;
  try {
    return parseCertificate(base64Decode(b64));
  } catch {
    return undefined;
  }
}

/** Container-scope signature rules: SIG-002, -004, -006…012, -015…017, -021. */
export async function checkSignatures(ctx: Ctx, fassungen: readonly Fassung[]): Promise<void> {
  const r = ctx.report;
  r.ran('HPR-SIG-002', 'HPR-SIG-004', 'HPR-SIG-006', 'HPR-SIG-007', 'HPR-SIG-008', 'HPR-SIG-009', 'HPR-SIG-010', 'HPR-SIG-011', 'HPR-SIG-012', 'HPR-SIG-017', 'HPR-SIG-021');
  if (ctx.signatures.length === 0) {
    r.ran('HPR-SIG-015', 'HPR-SIG-016');
    return;
  }
  const byId = new Map(fassungen.map((f) => [f.id, f]));
  const typeFor = (path: string): string | undefined => {
    if (path === 'META-INF/container.xml') return 'text/xml';
    if (path === 'package.opf') return 'application/oebps-package+xml';
    if (path === 'manifest.json' || /^renditions\/[^/]+\/manifest\.json$/.test(path)) return 'application/json';
    const id = /^renditions\/([^/]+)\//.exec(path)?.[1] ?? null;
    const f = byId.get(id) ?? byId.get(null);
    return f ? (f.types.get(path) ?? typeOf(f, path)) : undefined;
  };

  for (const sig of ctx.signatures) {
    const el = sig.element;
    const at = (uri?: string) => loc.signature(sig.file, sig.id, uri);
    const signedInfo = child(el, (x) => isDs(x, 'SignedInfo'));

    // SIG-002 XAdES structure
    const sp = find(el, (x) => isXades(x, 'SignedProperties'));
    const qp = sp ? sp.parentNode : null;
    const inObject = !!qp && isXades(qp as unknown as XmlElement, 'QualifyingProperties') && isDs((qp as unknown as XmlElement).parentNode as unknown as XmlElement, 'Object');
    const spRef = sig.references.find((x) => x.type === SIGNED_PROPERTIES_TYPE);
    const spId = sp ? idOf(sp) : '';
    if (!sp || !inObject) r.finding('HPR-SIG-002', { signatur: sig.id, grund: 'ds:Object/xades:QualifyingProperties/xades:SignedProperties fehlt' }, at());
    else if (!spRef || spRef.uri !== `#${spId}`) r.finding('HPR-SIG-002', { signatur: sig.id, grund: 'SignedProperties nicht über eine ds:Reference vom Typ SignedProperties signiert' }, at());

    // SIG-004 exclusive canonicalisation
    const c14n = child(signedInfo, (x) => isDs(x, 'CanonicalizationMethod'))?.getAttribute('Algorithm') ?? '(fehlt)';
    if (c14n !== EXC_C14N) r.finding('HPR-SIG-004', { signatur: sig.id, wert: c14n }, at());
    const spRefEl = signedInfo ? children(signedInfo).find((x) => isDs(x, 'Reference') && x.getAttribute('Type') === SIGNED_PROPERTIES_TYPE) : undefined;
    if (spRefEl) {
      const transforms = elements(spRefEl).filter((x) => isDs(x, 'Transform')).map((x) => x.getAttribute('Algorithm') ?? '');
      if (!transforms.includes(EXC_C14N)) r.finding('HPR-SIG-004', { signatur: sig.id, wert: `SignedProperties-Transform ${transforms.join(', ') || '(keine)'}` }, at());
    }

    // SIG-006, -007 references
    for (const ref of sig.references) if (ref.path !== null && !ctx.entryByName.has(ref.path)) r.finding('HPR-SIG-006', { signatur: sig.id, uri: ref.uri }, at(ref.uri));
    if (!sig.references.some((x) => x.path === 'META-INF/container.xml')) r.finding('HPR-SIG-007', { signatur: sig.id }, at());

    // SIG-008 DataObjectFormat
    const formats = elements(el).filter((x) => isXades(x, 'DataObjectFormat'));
    for (const ref of sig.references) {
      if (ref.path === null || ref.type === SIGNED_PROPERTIES_TYPE) continue;
      const expected = typeFor(ref.path);
      const dof = ref.id ? formats.find((d) => d.getAttribute('ObjectReference') === `#${ref.id}`) : undefined;
      const mime = dof ? (child(dof, (x) => isXades(x, 'MimeType'))?.textContent?.trim() ?? '') : undefined;
      if (!dof) r.finding('HPR-SIG-008', { signatur: sig.id, uri: ref.uri, grund: ref.id ? 'kein DataObjectFormat' : 'keine Id an der Referenz, daher kein DataObjectFormat', erwartet: expected ?? '?' }, at(ref.uri));
      else if (expected && mime !== expected) r.finding('HPR-SIG-008', { signatur: sig.id, uri: ref.uri, grund: `MimeType „${mime}“`, erwartet: expected }, at(ref.uri));
    }

    // SIG-009 signing time and certificate
    const cert = signingCertificate(el);
    const certV2 = find(el, (x) => isXades(x, 'SigningCertificateV2'));
    if (!sig.signingTime) r.finding('HPR-SIG-009', { signatur: sig.id, grund: 'xades:SigningTime fehlt' }, at());
    else if (!isValidUtc(sig.signingTime, RFC3339_UTC_RE)) r.finding('HPR-SIG-009', { signatur: sig.id, grund: `SigningTime „${sig.signingTime}“ ist kein RFC-3339-Zeitpunkt in UTC` }, at());
    if (!certV2) r.finding('HPR-SIG-009', { signatur: sig.id, grund: 'xades:SigningCertificateV2 fehlt' }, at());
    if (!cert) r.finding('HPR-SIG-009', { signatur: sig.id, grund: 'ds:KeyInfo enthält kein lesbares Zertifikat' }, at());
    if (cert && certV2) {
      const digestEl = find(certV2, (x) => isXades(x, 'CertDigest'));
      const method = digestEl ? (find(digestEl, (x) => isDs(x, 'DigestMethod'))?.getAttribute('Algorithm') ?? '') : '';
      const value = digestEl ? (find(digestEl, (x) => isDs(x, 'DigestValue'))?.textContent?.replace(/\s+/g, '') ?? '') : '';
      const hash = CERT_DIGESTS[method];
      let match = false;
      if (hash) {
        const d = new Uint8Array(await crypto.subtle.digest(hash, new Uint8Array(cert.der)));
        let bin = '';
        for (const b of d) bin += String.fromCharCode(b);
        match = btoa(bin) === value;
      }
      if (!match) r.finding('HPR-SIG-009', { signatur: sig.id, grund: 'Digest in SigningCertificateV2 passt nicht zum Zertifikat in ds:KeyInfo' }, at());
      if (sig.signingTime && isValidUtc(sig.signingTime, RFC3339_UTC_RE)) {
        const t = new Date(sig.signingTime);
        if (t < cert.notBefore || t > cert.notAfter) r.finding('HPR-SIG-009', { signatur: sig.id, grund: `SigningTime ${sig.signingTime} liegt außerhalb der Gültigkeit des Zertifikats (${cert.notBefore.toISOString()} bis ${cert.notAfter.toISOString()})` }, at());
      }
    }

    // SIG-010 algorithms and keys
    const sm = child(signedInfo, (x) => isDs(x, 'SignatureMethod'))?.getAttribute('Algorithm') ?? '(fehlt)';
    const family = SIGNATURE_METHODS_OK[sm];
    if (!family) r.finding('HPR-SIG-010', { signatur: sig.id, wert: sm, grund: 'Signaturverfahren nicht zugelassen' }, at());
    for (const dm of elements(el).filter((x) => isDs(x, 'DigestMethod'))) {
      const a = dm.getAttribute('Algorithm') ?? '';
      if (!DIGESTS_OK.has(a)) r.finding('HPR-SIG-010', { signatur: sig.id, wert: a, grund: 'Hashverfahren nicht zugelassen (SHA-256/384/512)' }, at());
    }
    if (cert && family) {
      if (cert.keyAlgorithm.toUpperCase().includes('RSA')) {
        const bits = await rsaBits(cert);
        if (family === 'EC') r.finding('HPR-SIG-010', { signatur: sig.id, wert: sm, grund: 'ECDSA-Verfahren mit RSA-Schlüssel' }, at());
        else if (bits !== undefined && bits < 3072) r.finding('HPR-SIG-010', { signatur: sig.id, wert: `RSA ${bits} Bit`, grund: 'RSA-Schlüssel unter 3072 Bit' }, at());
      } else if (family !== 'EC') r.finding('HPR-SIG-010', { signatur: sig.id, wert: sm, grund: `RSA-Verfahren mit ${cert.keyAlgorithm}-Schlüssel` }, at());
      else if (cert.curve && !/P-?(256|384|521)|prime256v1|secp384r1|secp521r1/i.test(cert.curve)) r.finding('HPR-SIG-010', { signatur: sig.id, wert: `Kurve ${cert.curve}`, grund: 'nur P-256, P-384, P-521' }, at());
    }

    // SIG-012 timestamp
    if (!find(el, (x) => isXades(x, 'SignatureTimeStamp'))) r.finding('HPR-SIG-012', { signatur: sig.id, wert: levelOf(el) }, at());
  }

  // SIG-021 order within signatures.xml
  let latest: { time: number; id: string } | undefined;
  for (const sig of ctx.signatures.filter((s) => s.file === 'META-INF/signatures.xml')) {
    const t = sig.signingTime ? Date.parse(sig.signingTime) : NaN;
    if (Number.isNaN(t)) continue;
    if (latest && t < latest.time - 60_000) r.finding('HPR-SIG-021', { signatur: sig.id, wert: sig.signingTime! }, loc.signature(sig.file, sig.id));
    if (!latest || t > latest.time) latest = { time: t, id: sig.id };
  }

  // SIG-011 ODF manifest
  checkOdfManifest(ctx, typeFor);

  // SIG-017 unsigned files
  const signed = new Set(ctx.signatures.flatMap((s) => s.references.map((x) => x.path).filter((p): p is string => p !== null)));
  for (const e of ctx.scan.entries) {
    if (e.isDirectory || e.name === 'mimetype' || SIG_FILE.test(e.name) || e.name === 'META-INF/manifest.xml') continue;
    if (!signed.has(e.name)) r.finding('HPR-SIG-017', { pfad: e.name }, loc.entry(e.name));
  }

  // SIG-015/016 validation with the core (P2)
  r.ran('HPR-SIG-015', 'HPR-SIG-016');
  const anchors: Certificate[] = [];
  for (const der of ctx.options.trustAnchors ?? []) anchors.push(parseCertificate(der));
  const validationTime = ctx.options.validationTime ? new Date(ctx.options.validationTime) : new Date();
  const files = ctx.files as ReadonlyMap<string, Uint8Array>;
  for (const path of [...new Set(ctx.signatures.map((s) => s.file))]) {
    let parsed;
    try {
      parsed = parseSignatureFile(ctx.files.get(path)!);
    } catch (err) {
      for (const sig of ctx.signatures.filter((s) => s.file === path)) r.finding('HPR-SIG-015', { signatur: sig.id, indikation: 'TOTAL_FAILED / FORMAT_FAILURE', grund: `: ${(err as Error).message}` }, loc.signature(path, sig.id));
      continue;
    }
    for (const el of parsed.signatures) {
      const result = await verifyXadesSignature(el, { files, trustAnchors: anchors, validationTime });
      const id = result.signatureId;
      if (result.indication === 'TOTAL_FAILED') {
        const broken = result.references.filter((x) => x.status !== 'intact');
        const grund = broken.length ? `: nicht intakt: ${broken.map((x) => `${x.path ?? x.uri} (${x.status})`).join(', ')}` : result.log.errors.length ? `: ${result.log.errors[0]}` : '';
        r.finding('HPR-SIG-015', { signatur: id, indikation: `${result.indication} / ${result.subIndication ?? '?'}`, grund }, loc.signature(path, id, broken[0]?.uri));
      } else if (result.indication === 'INDETERMINATE') {
        r.finding('HPR-SIG-016', { signatur: id, indikation: `${result.indication} / ${result.subIndication ?? '?'}` }, loc.signature(path, id));
      }
    }
  }
}

function levelOf(sig: XmlElement): string {
  const has = (n: string) => !!find(sig, (x) => isXades(x, n));
  if (has('ArchiveTimeStamp')) return 'XAdES-BASELINE-LTA';
  if (has('CertificateValues') && has('RevocationValues') && has('SignatureTimeStamp')) return 'XAdES-BASELINE-LT';
  if (has('SignatureTimeStamp')) return 'XAdES-BASELINE-T';
  return 'XAdES-BASELINE-B';
}

function checkOdfManifest(ctx: Ctx, typeFor: (path: string) => string | undefined): void {
  const path = 'META-INF/manifest.xml';
  const add = (grund: string, line?: number) => ctx.report.finding('HPR-SIG-011', { grund }, loc.xml(path, line));
  const bytes = ctx.files.get(path);
  if (!bytes) return add('Datei fehlt in einem signierten Container');
  const text = decodeUtf8(bytes);
  const parsed = text === undefined ? undefined : parseXml(text);
  if (!parsed?.doc) return add(text === undefined ? 'kein gültiges UTF-8' : `nicht wohlgeformt: ${parsed?.error?.message}`, parsed?.error?.line);
  const root = parsed.doc.documentElement!;
  if (root.namespaceURI !== NS.odfManifest || localName(root) !== 'manifest') return add(`Wurzel {${root.namespaceURI ?? ''}}${localName(root)}`);
  const entries = new Map<string, string>();
  for (const e of elements(root).filter((x) => localName(x) === 'file-entry' && x.namespaceURI === NS.odfManifest)) {
    entries.set(e.getAttributeNS(NS.odfManifest, 'full-path') ?? e.getAttribute('manifest:full-path') ?? '', e.getAttributeNS(NS.odfManifest, 'media-type') ?? e.getAttribute('manifest:media-type') ?? '');
  }
  if (entries.get('/') !== 'application/epub+zip') add(`file-entry full-path="/" mit media-type application/epub+zip fehlt (gefunden: ${entries.get('/') ?? 'keiner'})`);
  const signed = new Set(ctx.signatures.flatMap((s) => s.references.map((x) => x.path).filter((p): p is string => p !== null)));
  for (const p of signed) {
    if (!ctx.entryByName.has(p)) continue;
    const t = entries.get(p);
    const expected = typeFor(p);
    if (t === undefined) add(`file-entry für signierte Datei ${p} fehlt`);
    else if (expected && t !== expected) add(`file-entry ${p} hat media-type „${t}“, erwartet ${expected}`);
  }
}

/** Version-scope signature rules: PROF-004, PROF-008, PROF-013, SIG-005, SIG-013, SIG-014, SIG-020. */
export async function checkSignedFassung(ctx: Ctx, f: Fassung): Promise<void> {
  const r = ctx.report;
  r.ran('HPR-PROF-004', 'HPR-PROF-008', 'HPR-PROF-013', 'HPR-SIG-005', 'HPR-SIG-013', 'HPR-SIG-014');
  const assigned = ctx.signatures.filter((s) => s.fassung === f.id);
  if ((f.profile === 'signed' || f.profile === 'archive') && assigned.length === 0) {
    r.claim('Signiert');
    finding(ctx, 'HPR-PROF-004', { fassung: f.id ?? 'Hauptfassung', profil: f.profile }, f.id ? loc.rendition(f.id) : loc.container(), f);
  }
  if (assigned.length > 0) {
    const covered = new Set(assigned.flatMap((s) => s.references.map((x) => x.path).filter((p): p is string => p !== null)));
    const files = [...f.paths, f.manifestPath].filter((p) => !p.slice(f.prefix.length).startsWith('annotations/'));
    for (const p of files) {
      if (!covered.has(p)) finding(ctx, 'HPR-SIG-005', { pfad: p, fassung: f.id ?? 'Hauptfassung' }, loc.signature(assigned[0]!.file, assigned[0]!.id, p), f);
    }
  }
  // PROF-013: rendition signatures reference exactly the rendition plus container.xml; mixed ones are always a finding
  if (f.id !== null) {
    const own = new Set([...f.paths, f.manifestPath]);
    for (const s of assigned) {
      for (const ref of s.references) {
        if (ref.path === null || ref.path === 'META-INF/container.xml') continue;
        if (!own.has(ref.path)) finding(ctx, 'HPR-PROF-013', { signatur: s.id, uri: ref.uri, grund: 'liegt außerhalb der Fassung', fassung: f.id }, loc.signature(s.file, s.id, ref.uri), f);
      }
      for (const p of own) if (!s.references.some((x) => x.path === p)) finding(ctx, 'HPR-PROF-013', { signatur: s.id, uri: p, grund: 'fehlt in der Signatur', fassung: f.id }, loc.signature(s.file, s.id, p), f);
      if (!s.references.some((x) => x.path === 'META-INF/container.xml')) finding(ctx, 'HPR-PROF-013', { signatur: s.id, uri: 'META-INF/container.xml', grund: 'fehlt in der Signatur', fassung: f.id }, loc.signature(s.file, s.id), f);
    }
  } else {
    for (const s of ctx.signatures.filter((x) => x.mixed)) {
      const foreign = s.references.find((x) => x.path?.startsWith('renditions/'));
      finding(ctx, 'HPR-PROF-013', { signatur: s.id, uri: foreign?.uri ?? '', grund: 'mischt Dateien der Hauptfassung und einer eingefrorenen Fassung', fassung: /^renditions\/([^/]+)\//.exec(foreign?.path ?? '')?.[1] ?? '?' }, loc.signature(s.file, s.id, foreign?.uri), f);
    }
  }
  if (f.profile === 'archive') {
    for (const s of assigned) {
      const has = (n: string) => !!find(s.element, (x) => isXades(x, n));
      const missing = ['CertificateValues', 'RevocationValues', 'SignatureTimeStamp'].filter((n) => !has(n));
      if (missing.length) {
        finding(ctx, 'HPR-SIG-013', { signatur: s.id, grund: `fehlt: ${missing.map((n) => `xades:${n}`).join(', ')}` }, loc.signature(s.file, s.id), f);
        finding(ctx, 'HPR-PROF-008', { signatur: s.id, wert: levelOf(s.element) }, loc.signature(s.file, s.id), f);
      }
      if (!has('ArchiveTimeStamp')) finding(ctx, 'HPR-SIG-014', { signatur: s.id, wert: levelOf(s.element) }, loc.signature(s.file, s.id), f);
    }
  }
  // SIG-020: reference rendition (PDF/A)
  const refPdfs = new Set<string>();
  if (f.id !== null && ctx.files.has(`${f.prefix}reference.pdf`)) refPdfs.add(`${f.prefix}reference.pdf`);
  for (const key of ['resources', 'attachments'] as const) {
    const v = f.manifest[key];
    if (Array.isArray(v)) for (const item of v) if (isObject(item) && item.role === 'reference-pdf' && typeof item.url === 'string') refPdfs.add(item.url);
  }
  if (refPdfs.size === 0) {
    r.ran('HPR-SIG-020');
    return;
  }
  for (const p of refPdfs) {
    const notSigned = assigned.filter((s) => !s.references.some((x) => x.path === p));
    if (!ctx.files.has(p)) finding(ctx, 'HPR-SIG-020', { pfad: p, grund: 'Datei fehlt' }, loc.entry(p), f);
    else if (assigned.length === 0 || notSigned.length > 0) finding(ctx, 'HPR-SIG-020', { pfad: p, grund: assigned.length === 0 ? 'keine Signatur der Fassung' : `nicht mitsigniert von ${notSigned.map((s) => s.id).join(', ')}` }, loc.entry(p), f);
    if (!ctx.files.has(p)) continue;
    if (!ctx.options.pdfaValidator) {
      r.notChecked('HPR-SIG-020', 'missing-means', 'kein PDF/A-Validator angebunden (z. B. veraPDF)');
      continue;
    }
    const res = await ctx.options.pdfaValidator(ctx.files.get(p)!, p);
    if (res.error) r.notChecked('HPR-SIG-020', 'tool-error', res.error);
    else {
      r.ran('HPR-SIG-020');
      if (!res.ok) finding(ctx, 'HPR-SIG-020', { pfad: p, grund: `kein gültiges PDF/A: ${res.detail}` }, loc.entry(p), f);
    }
  }
}
