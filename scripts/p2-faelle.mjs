#!/usr/bin/env node
// Erzeugt die abgeleiteten Prüffälle für P2 (Manipulationen an signierten Containern)
// und schreibt die Fallliste docs/belege/P2/faelle.json.
//
// Aufruf: node scripts/p2-faelle.mjs   (nach `npm run build:test -w kern` und dem
// Schlüsselteil von scripts/belege-p2.sh, der die DSS-signierten Fälle N* erzeugt)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readZip, writeZip } from '../kern/build/src/index.js';

const ROOT = resolve(import.meta.dirname, '..');
const PC = 'prototyp/ergebnisse/container';
const OUT = 'docs/belege/P2/faelle';
const SIGNER = `${PC}/signer.pem`;
const FREMD = `${OUT}/fremd.pem`;

const enc = new TextEncoder();
const dec = new TextDecoder();

async function load(path) {
  return readZip(await readFile(resolve(ROOT, path)));
}

/** Writes entries back in their original order; mimetype stored, everything else deflated. */
async function save(entries, path) {
  const bytes = await writeZip(
    entries.map((e) => ({ name: e.name, data: e.data, compression: e.name === 'mimetype' ? 'store' : 'deflate' })),
    { modified: new Date('2026-10-11T00:00:00Z') },
  );
  await writeFile(resolve(ROOT, path), bytes);
}

function replaceText(entries, name, from, to) {
  const e = entries.find((x) => x.name === name);
  if (!e) throw new Error(`${name} fehlt`);
  const text = dec.decode(e.data);
  if (!text.includes(from)) throw new Error(`"${from}" nicht in ${name}`);
  return entries.map((x) => (x === e ? { ...x, data: enc.encode(text.replace(from, to)) } : x));
}

/** Changes one base64 character inside the first element `tag` (stays valid base64). */
function flipBase64(entries, name, tag, index = 40) {
  const e = entries.find((x) => x.name === name);
  const text = dec.decode(e.data);
  const start = text.indexOf(`<${tag}`);
  const pos = text.indexOf('>', start) + 1 + index;
  const c = text[pos];
  const flipped = c === 'A' ? 'B' : 'A';
  const data = enc.encode(text.slice(0, pos) + flipped + text.slice(pos + 1));
  return entries.map((x) => (x === e ? { ...x, data } : x));
}

const without = (entries, name) => entries.filter((e) => e.name !== name);

await mkdir(resolve(ROOT, OUT), { recursive: true });
const faelle = [];
const fall = (f) => faelle.push({ policy: 'dss-default', trust: SIGNER, ...f });

// --- A: die Container aus prototyp/ergebnisse/container/ unverändert (DSS-Standardrichtlinie)
const prototyp = [
  ['basis.epub', 'V0 unsigniert'],
  ['umschlag.asice', 'V1 EPUB als Ganzes signiert (Umschlag)'],
  ['dss-mimeparam.asice', 'V2a DSS mit setMimeType'],
  ['asice-xades.asice', 'V2 ASiC-E/XAdES aus den EPUB-Dateien'],
  ['hybrid.epub', 'V3 Hybrid, mimetype epub'],
  ['hybrid-sigxml-asicroot.epub', 'V4 signatures.xml mit ASiC-Wurzel'],
  ['hybrid-sigxml-ocfroot.epub', 'V5 signatures.xml mit OCF-Wurzel'],
  ['asice-cades.asice', 'V6 ASiC-E/CAdES'],
  ['hybrid-cades.epub', 'V6 CAdES, mimetype epub'],
  ['hybrid.hpro', 'V7 Endung .hpro'],
  ['hybrid.asice', 'V7 Endung .asice'],
  ['hybrid-eigenmime.hpro', 'V7 eigener mimetype'],
  ['hybrid-manipuliert.epub', 'V8 Inhalt nach Signatur geändert'],
  ['hybrid-kommentar.epub', 'V9 Datei nach Signatur ergänzt'],
  ['hybrid-2sig-direkt.epub', 'V10 zweite Signatur (DSS direkt)'],
  ['hybrid-2sig.epub', 'V10 zweite Signatur über ASiC-Umweg'],
  ['zielformat-2sig.epub', 'V11 Zielformat, 2 Signaturen in einer signatures.xml'],
];
for (const [file, titel] of prototyp) fall({ id: `A-${file}`, gruppe: 'A', titel, container: `${PC}/${file}` });

// --- R: Richtlinien wie in docs/05 (V3, V11)
fall({ id: 'R1-hybrid-hpro-richtlinie', gruppe: 'R', titel: 'V3 mit hpro-Richtlinie (epub erlaubt)', container: `${PC}/hybrid.epub`, policy: 'hpro' });
fall({ id: 'R2-hybrid-strenge-richtlinie', gruppe: 'R', titel: 'V3 mit strenger Richtlinie (mimetype = FAIL)', container: `${PC}/hybrid.epub`, policy: 'strict' });
fall({ id: 'R3-zielformat-hpro-richtlinie', gruppe: 'R', titel: 'V11 mit hpro-Richtlinie', container: `${PC}/zielformat-2sig.epub`, policy: 'hpro' });

// --- M: Manipulationen an signierten Containern
const ziel = await load(`${PC}/zielformat-2sig.epub`);
const hybrid = await load(`${PC}/hybrid.epub`);
const cades = await load(`${PC}/asice-cades.asice`);
const SIGXML = 'META-INF/signatures.xml';
const SIG001 = 'META-INF/signatures001.xml';

const m = async (id, titel, entries, extra = {}) => {
  const path = `${OUT}/${id}.epub`;
  await save(entries, path);
  fall({ id, gruppe: 'M', titel, container: path, ...extra });
};

await m('M01-inhalt-geaendert', 'Zielformat: Betrag in content/index.xhtml geändert (1.200,00 → 9.200,00 EUR)',
  replaceText(ziel, 'content/index.xhtml', '1.200,00 EUR', '9.200,00 EUR'));
await m('M02-container-xml-geaendert', 'Zielformat: META-INF/container.xml geändert (nur Signatur 1 deckt sie ab)',
  replaceText(ziel, 'META-INF/container.xml', '<rootfiles>', '<rootfiles> '));
await m('M03-datei-entfernt', 'Zielformat: signierte Datei content/styles/document.css entfernt',
  without(ziel, 'content/styles/document.css'));
await m('M04-signaturwert-geaendert', 'V3: ein Zeichen im ds:SignatureValue geändert',
  flipBase64(hybrid, SIG001, 'ds:SignatureValue'));
await m('M05-signierzeit-geaendert', 'V3: xades:SigningTime geändert (SignedProperties)',
  replaceText(hybrid, SIG001, '<xades:SigningTime>2026-10-11T10:30:27Z', '<xades:SigningTime>2025-01-01T00:00:00Z'));
await m('M06-digestwert-in-signedinfo', 'V3: DigestValue der Referenz auf content/index.xhtml in SignedInfo geändert',
  replaceText(hybrid, SIG001, 'PSvL5/xvjRPOIwTmfzNAYNUjxpndJb', 'QSvL5/xvjRPOIwTmfzNAYNUjxpndJb'));
await m('M07-fremder-vertrauensanker', 'V3 unverändert, aber anderes Zertifikat als Vertrauensanker', hybrid, { trust: FREMD });
await m('M08-fremder-anker-und-manipuliert', 'V8 (manipuliert) mit fremdem Vertrauensanker', await load(`${PC}/hybrid-manipuliert.epub`), { trust: FREMD });
await m('M09-namensraum-und-leerraum', 'Zielformat: zusätzlicher Namensraum am Wurzelelement, Zeilenumbrüche zwischen den Signaturen',
  replaceText(
    replaceText(ziel, SIGXML, '<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container">', '<signatures xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:x="urn:example:rauschen">\n  '),
    SIGXML, '</ds:Signature><ds:Signature', '</ds:Signature>\n  <ds:Signature'));
await m('M10-odf-manifest-entfernt', 'V3 ohne META-INF/manifest.xml (nicht signiert)', without(hybrid, 'META-INF/manifest.xml'));
await m('M11-cades-inhalt-geaendert', 'V6 CAdES: Betrag in content/index.xhtml geändert',
  replaceText(cades, 'content/index.xhtml', '1.200,00 EUR', '9.200,00 EUR'));
await m('M12-cades-asicmanifest-geaendert', 'V6 CAdES: Digest in ASiCManifest001.xml geändert (Manifest ist signiert)',
  replaceText(cades, 'META-INF/ASiCManifest001.xml', 'PSvL5/xvjRPOIwTmfzNAYNUjxpndJb', 'QSvL5/xvjRPOIwTmfzNAYNUjxpndJb'));
{
  const fremd = await readFile(resolve(ROOT, FREMD), 'utf8');
  const fremdB64 = fremd.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const e = hybrid.find((x) => x.name === SIG001);
  const text = dec.decode(e.data).replace(/<ds:X509Certificate>[^<]*<\/ds:X509Certificate>/, `<ds:X509Certificate>${fremdB64}</ds:X509Certificate>`);
  await m('M13-keyinfo-zertifikat-getauscht', 'V3: Zertifikat in ds:KeyInfo durch ein fremdes ersetzt (KeyInfo ist nicht signiert)',
    hybrid.map((x) => (x === e ? { ...x, data: enc.encode(text) } : x)));
}
await m('M14-signedinfo-leerraum', 'V3: Leerzeichen innerhalb von ds:SignedInfo eingefügt (kanonisch relevant)',
  replaceText(hybrid, SIG001, '<ds:SignedInfo><ds:CanonicalizationMethod', '<ds:SignedInfo> <ds:CanonicalizationMethod'));
await m('M15-signatur-dupliziert-id', 'Zielformat: zweite Signatur trägt dieselbe Id wie die erste',
  (() => {
    const e = ziel.find((x) => x.name === SIGXML);
    const text = dec.decode(e.data);
    const ids = [...text.matchAll(/<ds:Signature [^>]*Id="([^"]+)"/g)].map((x) => x[1]);
    return ziel.map((x) => (x === e ? { ...x, data: enc.encode(text.replaceAll(ids[1], ids[0])) } : x));
  })());

// --- N: neu mit DSS signierte Container (andere Schlüssel), erzeugt von scripts/belege-p2.sh
const N = [
  ['N1-ec-p256', 'ASiC-E/XAdES mit ECDSA P-256 (DSS 6.5 signiert), mimetype epub', 'ec-p256.pem'],
  ['N2-ca-kette', 'ASiC-E/XAdES, Unterzeichner von Test-CA ausgestellt, Vertrauensanker = CA', 'test-ca.pem'],
  ['N3-ca-kette-anker-ist-unterzeichner', 'wie N2, Vertrauensanker = Unterzeichnerzertifikat selbst', 'ca-unterzeichner.pem'],
];
for (const [id, titel, trust] of N) {
  const path = `${OUT}/${id}.epub`;
  if (!existsSync(resolve(ROOT, path))) throw new Error(`${path} fehlt (scripts/belege-p2.sh erzeugt ihn)`);
  fall({ id, gruppe: 'N', titel, container: path, trust: `${OUT}/${trust}` });
}
await m('N4-ec-p256-manipuliert', 'N1 mit geändertem Betrag', replaceText(await load(`${OUT}/N1-ec-p256.epub`), 'content/index.xhtml', '1.200,00 EUR', '9.200,00 EUR'), { trust: `${OUT}/ec-p256.pem` });

await writeFile(resolve(ROOT, 'docs/belege/P2/faelle.json'), JSON.stringify(faelle, null, 2) + '\n');
console.log(`${faelle.length} Fälle -> docs/belege/P2/faelle.json`);
