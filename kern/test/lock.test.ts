// Package P17: locks, sealed sections, redaction and the signed frozen version (docs/10, promise 5).
//
// Acceptance criteria covered here:
//   1. the frozen version is signed, the signature is checked, a later change is detected
//   2. a locked (sealed) section cannot be read from the living document
//   3. redaction removes the data from the container and keeps a log
// The cross-check with an independent JWE implementation (jwcrypto) runs when
// prototyp/.venv has it; otherwise the test is skipped with the reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  SoftwareKeySigner,
  checkConformance,
  createContainer,
  createTestIdentity,
  lock,
  readContainer,
  readZip,
  validateContainer,
  writeZip,
  type Catalog,
  type DocumentInput,
} from '../src/index.js';
import { REPO_ROOT, nodeSri } from './helpers.js';

const EXAMPLE = resolve(REPO_ROOT, 'docs/spezifikation/beispiele/p17-sperren');
const TYPES: Record<string, string> = { xhtml: 'application/xhtml+xml', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', json: 'application/json' };
const T = 'content/index.xhtml#bewertung';
const PASSWORD = 'Bauamt-Beispielort-2026!';
/** Secret text of the sealed section; none of it may be found in the container. */
const SECRETS = ['3,1 Prozent unter den eigenen', 'Kalkulationsblatt K7', 'Vollwärmeschutz', 'Bieter B minus 11,8 Prozent', 'Preisprüfung'];
const PERSONAL = ['Max Mustermann', 'AT61 1904 3002 3457 3201', '+43 512 123456'];
const enc = new TextEncoder();
const dec = new TextDecoder();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}

async function example(): Promise<Uint8Array> {
  const doc = JSON.parse(readFileSync(join(EXAMPLE, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const resources = walk(EXAMPLE)
    .map((f) => relative(EXAMPLE, f).split('\\').join('/'))
    .filter((p) => p !== 'dokument.json')
    .map((path) => ({ path, mediaType: TYPES[path.split('.').pop()!]!, data: readFileSync(join(EXAMPLE, path)) }));
  const created = await createContainer({ ...doc, resources });
  // The link text in #anlagen repeats a heading of the section; an author rewords it before sealing.
  return lock.editText(created.bytes, { target: 'content/index.xhtml#anlagen-hinweis', text: 'Ansprechperson und Bewertung stehen in den Abschnitten oben.', modified: '2026-10-12T08:30:00Z', replaceMarkup: true });
}

const identities = (async () => ({
  rsa: await createTestIdentity({ algorithm: 'RSA-3072', usage: 'encryption', commonName: 'Empfänger RSA (Test)' }),
  ec: await createTestIdentity({ algorithm: 'EC-P256', usage: 'encryption', commonName: 'Empfänger EC (Test)' }),
  other: await createTestIdentity({ algorithm: 'EC-P256', usage: 'encryption', commonName: 'Fremder (Test)' }),
  signer: await createTestIdentity({ algorithm: 'EC-P256', commonName: 'Bauamt (Testsignatur)', notBefore: new Date('2026-10-01T00:00:00Z') }),
}))();

async function sealed(): Promise<Uint8Array> {
  const id = await identities;
  const r = await lock.sealSection(await example(), {
    target: T,
    modified: '2026-10-12T09:00:00Z',
    recipients: [{ password: PASSWORD }, { certificate: id.rsa.certificate }, { certificate: id.ec.certificate }],
  });
  return r.bytes;
}
const sealedOnce = sealed();

async function frozen(): Promise<Uint8Array> {
  const id = await identities;
  const signer = await SoftwareKeySigner.fromPkcs8(id.signer.pkcs8, { certificateChain: [id.signer.certificate] });
  return (await lock.freezeAndSign(await sealedOnce, { id: 'nachweis-2026-10-12', createdAt: '2026-10-12T10:00:00Z', signer, signatureId: 'sig-nachweis' })).bytes;
}
const frozenOnce = frozen();

async function originalSection(): Promise<string> {
  const text = readFileSync(join(EXAMPLE, 'content/index.xhtml'), 'utf8');
  return text.slice(text.indexOf('<section id="bewertung">'), text.indexOf('<section id="kalkulation">'));
}
const textOf = (xml: string) => xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Rewrites one entry with a foreign tool's view: same names and order, new bytes (no hash update). */
async function patchEntry(bytes: Uint8Array, name: string, change: (s: string) => string): Promise<Uint8Array> {
  const entries = await readZip(bytes);
  return writeZip(
    entries.filter((e) => !e.name.endsWith('/')).map((e) => ({ name: e.name, data: e.name === name ? enc.encode(change(dec.decode(e.data))) : e.data, compression: e.name === 'mimetype' ? 'store' : 'auto' })),
    { modified: new Date('2026-10-12T13:00:00Z') },
  );
}

// --- JWE -------------------------------------------------------------------------------

test('JWE: A256GCM with password, RSA-OAEP-256 and ECDH-ES+A256KW recipients round-trips', async () => {
  const id = await identities;
  const plain = enc.encode('<p xmlns="http://www.w3.org/1999/xhtml">geheim</p>');
  const jwe = await lock.encryptJwe(plain, { cty: 'application/xhtml+xml', 'hp-target': 'a#b' }, [{ password: PASSWORD, iterations: 100_000 }, { certificate: id.rsa.certificate }, { certificate: id.ec.certificate }]);
  assert.deepEqual(jwe.recipients.map((r) => r.header.alg), ['PBES2-HS512+A256KW', 'RSA-OAEP-256', 'ECDH-ES+A256KW']);
  assert.equal(lock.protectedHeader(jwe).enc, 'A256GCM');
  for (const opener of [{ password: PASSWORD }, { pkcs8: id.rsa.pkcs8, certificate: id.rsa.certificate }, { pkcs8: id.ec.pkcs8, certificate: id.ec.certificate }]) {
    const r = await lock.decryptJwe(jwe, opener);
    assert.equal(dec.decode(r.plaintext), dec.decode(plain));
  }
});

test('JWE: wrong password, foreign key and every changed part are rejected', async () => {
  const id = await identities;
  const jwe = await lock.encryptJwe(enc.encode('x'), { 'hp-target': 'a#b' }, [{ password: PASSWORD, iterations: 100_000 }, { certificate: id.ec.certificate }]);
  await assert.rejects(lock.decryptJwe(jwe, { password: 'falsches-Kennwort-123' }), (e: unknown) => e instanceof lock.JweError && e.code === 'decrypt');
  await assert.rejects(lock.decryptJwe(jwe, { pkcs8: id.other.pkcs8, certificate: id.other.certificate }), (e: unknown) => e instanceof lock.JweError && e.code === 'no-recipient');
  // The protected header is authenticated: moving the envelope to another target fails.
  const header = lock.b64u(enc.encode(JSON.stringify({ ...lock.protectedHeader(jwe), 'hp-target': 'a#c' })));
  await assert.rejects(lock.decryptJwe({ ...jwe, protected: header }, { password: PASSWORD }), (e: unknown) => e instanceof lock.JweError && e.code === 'decrypt');
  const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  await assert.rejects(lock.decryptJwe({ ...jwe, ciphertext: flip(jwe.ciphertext) }, { password: PASSWORD }));
  await assert.rejects(lock.decryptJwe({ ...jwe, tag: flip(jwe.tag) }, { password: PASSWORD }));
  await assert.rejects(lock.decryptJwe({ ...jwe, iv: flip(jwe.iv) }, { password: PASSWORD }));
  // Limits: short passwords are refused when sealing, absurd iteration counts when opening.
  await assert.rejects(lock.encryptJwe(enc.encode('x'), {}, [{ password: 'kurz' }]), /at least 12/);
  const p2c = { ...jwe, recipients: [{ ...jwe.recipients[0]!, header: { ...jwe.recipients[0]!.header, p2c: 50_000_000 } }] };
  await assert.rejects(lock.decryptJwe(p2c, { password: PASSWORD }), (e: unknown) => e instanceof lock.JweError && e.code === 'limits');
});

test('JWE: a signing-only certificate is refused as recipient', async () => {
  const id = await identities;
  await assert.rejects(lock.encryptJwe(enc.encode('x'), {}, [{ certificate: id.signer.certificate }]), /not meant for encryption/);
});

const PYTHON = resolve(REPO_ROOT, 'prototyp/.venv/bin/python');
const hasJwcrypto = existsSync(PYTHON) && (await promisify(execFile)(PYTHON, ['-c', 'import jwcrypto']).then(() => true, () => false));
const skipJwcrypto = hasJwcrypto ? false : 'prototyp/.venv with jwcrypto missing (prototyp/.venv/bin/pip install jwcrypto)';

test('JWE interop: jwcrypto opens our envelope with each key, and we open an envelope made by jwcrypto', { skip: skipJwcrypto, timeout: 120_000 }, async () => {
  const id = await identities;
  const dir = await mkdtemp(join(tmpdir(), 'hpro-jwe-'));
  try {
    const plain = '<p xmlns="http://www.w3.org/1999/xhtml">Prüfung äöü €</p>';
    const jwe = await lock.encryptJwe(enc.encode(plain), { cty: 'application/xhtml+xml', 'hp-target': 'content/x.xhtml#y' }, [{ password: PASSWORD }, { certificate: id.rsa.certificate }, { certificate: id.ec.certificate }]);
    await writeFile(join(dir, 'ours.json'), JSON.stringify(jwe));
    const pem = (label: string, der: Uint8Array) => `-----BEGIN ${label}-----\n${Buffer.from(der).toString('base64').replace(/.{64}/g, '$&\n')}\n-----END ${label}-----\n`;
    await writeFile(join(dir, 'rsa.pem'), pem('PRIVATE KEY', id.rsa.pkcs8));
    await writeFile(join(dir, 'ec.pem'), pem('PRIVATE KEY', id.ec.pkcs8));
    await writeFile(join(dir, 'ec-cert.der'), id.ec.certificate);
    const script = `
import json, sys, hashlib, base64
import jwcrypto.jwa as jwa
from jwcrypto import jwe, jwk
from cryptography import x509
jwa.default_max_pbkdf2_iterations = 2000000
d = sys.argv[1]; pw = sys.argv[2]
raw = open(d + '/ours.json').read()
out = []
for key in [jwk.JWK.from_password(pw), jwk.JWK.from_pem(open(d + '/rsa.pem','rb').read()), jwk.JWK.from_pem(open(d + '/ec.pem','rb').read())]:
    t = jwe.JWE(); t.deserialize(raw, key=key); out.append(t.payload.decode('utf-8'))
cert = x509.load_der_x509_certificate(open(d + '/ec-cert.der','rb').read())
pub = jwk.JWK.from_pyca(cert.public_key())
thumb = base64.urlsafe_b64encode(hashlib.sha256(cert.public_bytes(encoding=__import__('cryptography.hazmat.primitives.serialization', fromlist=['Encoding']).Encoding.DER)).digest()).rstrip(b'=').decode()
theirs = jwe.JWE('von jwcrypto: Abschnitt ä'.encode('utf-8'), json.dumps({'enc': 'A256GCM', 'cty': 'application/xhtml+xml'}))
theirs.add_recipient(pub, json.dumps({'alg': 'ECDH-ES+A256KW', 'x5t#S256': thumb}))
theirs.add_recipient(jwk.JWK.from_password(pw), json.dumps({'alg': 'PBES2-HS512+A256KW', 'p2c': 210000}))
print(json.dumps({'opened': out, 'theirs': json.loads(theirs.serialize())}))
`;
    const { stdout } = await promisify(execFile)(PYTHON, ['-c', script, dir, PASSWORD], { timeout: 110_000 });
    const result = JSON.parse(stdout) as { opened: string[]; theirs: lock.JweGeneral };
    assert.deepEqual(result.opened, [plain, plain, plain]);
    for (const opener of [{ password: PASSWORD }, { pkcs8: id.ec.pkcs8, certificate: id.ec.certificate }]) {
      assert.equal(dec.decode((await lock.decryptJwe(result.theirs, opener)).plaintext), 'von jwcrypto: Abschnitt ä');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Locks in the manifest ---------------------------------------------------------------

test('createContainer writes access rules and refuses unresolvable targets and "sealed"', async () => {
  const c = await readContainer(await example());
  assert.deepEqual(lock.parseAccess(c.manifest), [
    { target: 'content/index.xhtml#angebote', rules: ['read-only'] },
    { target: 'content/index.xhtml#kalkulation', rules: ['no-print', 'no-export'] },
    { target: 'content/index.xhtml#intern', rules: ['hidden'] },
  ]);
  const doc = JSON.parse(readFileSync(join(EXAMPLE, 'dokument.json'), 'utf8')) as DocumentInput;
  const resources = [{ path: 'content/index.xhtml', mediaType: 'application/xhtml+xml', data: readFileSync(join(EXAMPLE, 'content/index.xhtml')) }];
  const base = { ...doc, resources, data: [], readingOrder: ['content/index.xhtml'] };
  await assert.rejects(createContainer({ ...base, access: [{ target: 'content/index.xhtml#gibt-es-nicht', rules: ['hidden'] }] }), /no element with id/);
  await assert.rejects(createContainer({ ...base, access: [{ target: 'content/index.xhtml#intern', rules: ['nicht-kopieren'] }] }), /not allowed/);
  await assert.rejects(createContainer({ ...base, access: [{ target: 'content/index.xhtml#intern', rules: ['sealed'] }] }), /sealSection/);
});

test('read-only: the editor refuses the change and the file stays byte-identical (HP-LOCK-002, HPL-LOCK-001)', async () => {
  const before = await example();
  await assert.rejects(lock.editText(before, { target: 'content/index.xhtml#angebotsliste', text: 'x', modified: '2026-10-12T09:30:00Z' }), (e: unknown) => e instanceof lock.LockError && e.code === 'read-only' && /angebote.*read-only/.test(e.message));
  const after = await lock.editText(before, { target: 'content/index.xhtml#ergebnis-text', text: 'Zuschlag an Bieter A empfohlen.', modified: '2026-10-12T09:30:00Z' });
  const c = await readContainer(after);
  assert.ok(c.integrity.ok);
  assert.match(dec.decode(c.files.get('content/index.xhtml')!), /Zuschlag an Bieter A empfohlen\./);
});

test('print and export leave out no-print / no-export / hidden with the notice (HP-LOCK-003, HP-LOCK-004)', async () => {
  const c = await readContainer(await example());
  const access = lock.parseAccess(c.manifest);
  const xhtml = c.files.get('content/index.xhtml')!;
  const print = lock.outputViewBytes(xhtml, 'content/index.xhtml', access, 'print');
  const printed = textOf(dec.decode(print.bytes));
  assert.ok(!printed.includes('Kostenkennwert 1.180'));
  assert.ok(!printed.includes('Rückfrage beim Gemeindevorstand'));
  assert.ok(printed.includes('Abschnitt kalkulation nicht zum Druck freigegeben'));
  assert.ok(printed.includes('Vergabevermerk'));
  const exported = textOf(dec.decode(lock.outputViewBytes(xhtml, 'content/index.xhtml', access, 'export').bytes));
  assert.ok(!exported.includes('Kostenkennwert 1.180'));
  assert.ok(exported.includes('Abschnitt kalkulation nicht zum Export freigegeben'));
  // hidden is not a confidentiality measure: the text is in the container (HP-LOCK-005).
  assert.ok(dec.decode(xhtml).includes('Rückfrage beim Gemeindevorstand'));
});

// --- Sealed sections (criterion 2) ---------------------------------------------------------

test('criterion 2: a sealed section is not readable from the living document', async () => {
  const bytes = await sealedOnce;
  const c = await readContainer(bytes);
  assert.ok(c.integrity.ok);
  // Every entry decoded (text, markup without tags, JSON) and the raw ZIP: no secret text.
  const search = await lock.searchContainer(bytes, SECRETS);
  assert.deepEqual(search.hits, [], `secret text found: ${JSON.stringify(search.hits)}`);
  // The chart was used only in the section: it travels inside the envelope, not as a file.
  assert.ok(!c.files.has('content/media/bewertung.svg'));
  const xhtml = dec.decode(c.files.get('content/index.xhtml')!);
  assert.match(xhtml, /<section id="bewertung" data-hp-sealed="\.\.\/data\/sealed\/index-bewertung\.json"><h2>Versiegelter Abschnitt<\/h2><p data-hp-role="sealed-notice">/);
  // Navigation: label replaced, entry into the section removed, no empty list left.
  const nav = dec.decode(c.files.get('content/nav.xhtml')!);
  assert.ok(nav.includes('>Versiegelter Abschnitt</a>') && !nav.includes('preispruefung') && !/<ol>\s*<\/ol>/.test(nav));
  assert.deepEqual(lock.parseAccess(c.manifest).find((a) => a.target === T), { target: T, rules: ['sealed'] });
  const env = lock.parseJwe(c.files.get('data/sealed/index-bewertung.json')!);
  assert.equal(lock.protectedHeader(env)['hp-target'], T);
  assert.equal(c.manifest.resources.find((r) => r.url === 'data/sealed/index-bewertung.json')?.type, 'application/jose+json');
  // Without a key there is no way in; a wrong key fails.
  await assert.rejects(lock.openSealedSection(bytes, T, { password: 'falsches-Kennwort-123' }), (e: unknown) => e instanceof lock.JweError && e.code === 'decrypt');
  const id = await identities;
  await assert.rejects(lock.openSealedSection(bytes, T, { pkcs8: id.other.pkcs8, certificate: id.other.certificate }), (e: unknown) => e instanceof lock.JweError && e.code === 'no-recipient');
});

test('sealed section: every recipient opens the original content, media inlined', async () => {
  const bytes = await sealedOnce;
  const id = await identities;
  const want = textOf(await originalSection());
  for (const opener of [{ password: PASSWORD }, { pkcs8: id.rsa.pkcs8, certificate: id.rsa.certificate }, { pkcs8: id.ec.pkcs8, certificate: id.ec.certificate }]) {
    const { xhtml } = await lock.openSealedSection(bytes, T, opener);
    assert.equal(textOf(xhtml), want);
    assert.match(xhtml, /src="data:image\/svg\+xml;base64,/);
  }
});

test('sealing fails when text of the section would stay elsewhere (leak check)', async () => {
  const doc = JSON.parse(readFileSync(join(EXAMPLE, 'dokument.json'), 'utf8')) as Omit<DocumentInput, 'resources'>;
  const resources = walk(EXAMPLE)
    .map((f) => relative(EXAMPLE, f).split('\\').join('/'))
    .filter((p) => p !== 'dokument.json')
    .map((path) => ({ path, mediaType: TYPES[path.split('.').pop()!]!, data: readFileSync(join(EXAMPLE, path)) }));
  const raw = (await createContainer({ ...doc, resources })).bytes; // link text "Preisprüfung" still outside
  await assert.rejects(lock.sealSection(raw, { target: T, modified: '2026-10-12T09:00:00Z', recipients: [{ password: PASSWORD }] }), (e: unknown) => e instanceof lock.LockError && e.code === 'leak' && /Preisprüfung/.test(e.message));
  // A frozen version made before sealing keeps the plain text: sealing refuses as well.
  const id = await identities;
  const signer = await SoftwareKeySigner.fromPkcs8(id.signer.pkcs8, { certificateChain: [id.signer.certificate] });
  const early = await lock.freezeAndSign(await example(), { id: 'frueh', createdAt: '2026-10-12T08:45:00Z', signer });
  await assert.rejects(lock.sealSection(early.bytes, { target: T, modified: '2026-10-12T09:00:00Z', recipients: [{ password: PASSWORD }] }), (e: unknown) => e instanceof lock.LockError && e.code === 'leak' && /renditions\/frueh\//.test(e.message));
});

test('editing inside a sealed section is refused; unsealing restores the text', async () => {
  const bytes = await sealedOnce;
  await assert.rejects(lock.editText(bytes, { target: T, text: 'x', modified: '2026-10-12T09:30:00Z' }), (e: unknown) => e instanceof lock.LockError && e.code === 'sealed');
  const open = await lock.unsealSection(bytes, T, { password: PASSWORD }, '2026-10-12T09:40:00Z');
  const c = await readContainer(open);
  assert.ok(c.integrity.ok);
  assert.ok(!c.files.has('data/sealed/index-bewertung.json'));
  assert.ok(!lock.parseAccess(c.manifest).some((a) => a.rules.includes('sealed')));
  assert.ok(textOf(dec.decode(c.files.get('content/index.xhtml')!)).includes(textOf(await originalSection())));
});

// --- Frozen version (criterion 1) ----------------------------------------------------------

test('criterion 1: the frozen version is signed and checked; the living version stays editable', async () => {
  const id = await identities;
  const bytes = await frozenOnce;
  const trust = { trustAnchors: [id.signer.certificate] };
  const check = await lock.checkFrozenVersion(bytes, 'nachweis-2026-10-12', trust);
  assert.equal(check.verdict, 'gültig signiert');
  assert.equal(check.signatures.length, 1);
  assert.deepEqual([check.signatures[0]!.missing, check.signatures[0]!.outside], [[], []]);
  // Locks are copied into the frozen version and covered by its signature (HP-LOCK-006).
  assert.equal((await lock.lockEvidence(bytes, 'nachweis-2026-10-12', trust)).status, 'nachweisbar');
  assert.equal((await lock.lockEvidence(bytes, null, trust)).status, 'Sperre nicht signiert');
  // The frozen version keeps the seal: same envelope, opened inside the rendition.
  const { xhtml } = await lock.openSealedSection(bytes, T, { password: PASSWORD }, 'nachweis-2026-10-12');
  assert.equal(textOf(xhtml), textOf(await originalSection()));
  // HP-PROF-009: editing the living version leaves the signature of the frozen one valid.
  const edited = await lock.editText(bytes, { target: 'content/index.xhtml#ergebnis-text', text: 'Zuschlag an Bieter A empfohlen.', modified: '2026-10-12T11:00:00Z' });
  assert.equal((await lock.checkFrozenVersion(edited, 'nachweis-2026-10-12', trust)).verdict, 'gültig signiert');
  await assert.rejects(lock.editText(edited, { target: 'renditions/nachweis-2026-10-12/content/index.xhtml#ergebnis-text', text: 'x', modified: '2026-10-12T11:00:00Z' }), /eingefrorene Fassung/);
});

test('criterion 1: a later change to the frozen version is detected as manipulation', async () => {
  const id = await identities;
  const trust = { trustAnchors: [id.signer.certificate] };
  const bytes = await frozenOnce;
  const file = 'renditions/nachweis-2026-10-12/content/index.xhtml';
  const tampered = await patchEntry(bytes, file, (s) => s.replace('433.900,00 €', '413.900,00 €'));
  const r1 = await lock.checkFrozenVersion(tampered, 'nachweis-2026-10-12', trust);
  assert.equal(r1.verdict, 'verändert nach der Signatur');
  assert.deepEqual(r1.changed, [file]);
  assert.equal(r1.signatures[0]!.indication, 'TOTAL_FAILED');
  assert.equal(r1.signatures[0]!.subIndication, 'HASH_FAILURE');
  // A careful forger also fixes the hash in the version manifest: the signature still fails.
  const entries = await readZip(tampered);
  const newHash = nodeSri(entries.find((e) => e.name === file)!.data);
  const forged = await patchEntry(tampered, 'renditions/nachweis-2026-10-12/manifest.json', (s) => {
    const m = JSON.parse(s) as { resources: Array<{ url: string; integrity: string }> };
    for (const r of m.resources) if (r.url === file) r.integrity = newHash;
    return JSON.stringify(m, null, 2) + '\n';
  });
  const r2 = await lock.checkFrozenVersion(forged, 'nachweis-2026-10-12', trust);
  assert.ok(r2.integrity.ok, 'the forged version manifest matches the changed file');
  assert.equal(r2.verdict, 'verändert nach der Signatur');
  assert.deepEqual([...r2.signatures[0]!.changed].sort(), [file, 'renditions/nachweis-2026-10-12/manifest.json'].sort());
  // Swapping the envelope of the frozen version is caught by the signature as well.
  const env = 'renditions/nachweis-2026-10-12/data/sealed/index-bewertung.json';
  const swapped = await patchEntry(bytes, env, (s) => s.replace(/"iv": "[^"]+"/, '"iv": "AAAAAAAAAAAAAAAA"'));
  assert.equal((await lock.checkFrozenVersion(swapped, 'nachweis-2026-10-12', trust)).verdict, 'verändert nach der Signatur');
  // The core's validator reports the same as DSS does in docs/belege/P17 (TOTAL_FAILED / HASH_FAILURE).
  const report = await validateContainer(tampered, trust);
  assert.equal(report.signatures[0]!.subIndication, 'HASH_FAILURE');
});

// --- Redaction (criterion 3) ----------------------------------------------------------------

test('criterion 3: redaction asks before removing a signed frozen version (part 1, 7.4)', async () => {
  const bytes = await frozenOnce;
  await assert.rejects(
    lock.redactContainer(bytes, { targets: ['content/index.xhtml#kontakt'], terms: PERSONAL, at: '2026-10-12T12:00:00Z' }),
    (e: unknown) => e instanceof lock.RedactionNeedsConfirmation && e.renditions.join() === 'nachweis-2026-10-12',
  );
});

test('criterion 3: redaction removes the data from the container and keeps a log', async () => {
  const bytes = await frozenOnce;
  const before = await lock.searchContainer(bytes, PERSONAL);
  assert.ok(before.hits.length >= 10, 'the personal data is in text, JSON, image metadata and the frozen version');
  assert.ok(before.hits.some((h) => h.entry === 'content/media/kontoblatt.png'), 'IBAN in the PNG text chunk');
  const r = await lock.redactContainer(bytes, {
    targets: ['content/index.xhtml#kontakt'],
    terms: PERSONAL,
    at: '2026-10-12T12:00:00Z',
    reason: 'Personenbezogene Daten',
    actor: 'Bauamt Beispielort',
    removeSignedRenditions: true,
  });
  const after = await lock.searchContainer(r.bytes, [...PERSONAL, 'Bauleiter, Telefon', 'Unterschrift von Max']);
  assert.deepEqual(after.hits, []);
  assert.equal(r.check.hits, 0);
  const c = await readContainer(r.bytes);
  assert.ok(c.integrity.ok);
  for (const gone of ['content/media/unterschrift.svg', 'content/media/kontoblatt.png', 'META-INF/signatures.xml']) assert.ok(!c.files.has(gone), `${gone} removed`);
  assert.ok(![...c.files.keys()].some((p) => p.startsWith('renditions/')));
  assert.deepEqual(r.removedRenditions, [{ id: 'nachweis-2026-10-12', signed: true, signatures: ['sig-nachweis'] }]);
  // Placeholder at the address; JSON values blacked out; the seal of #bewertung is untouched.
  const xhtml = dec.decode(c.files.get('content/index.xhtml')!);
  assert.match(xhtml, /<section id="kontakt"><span data-hp-redacted="" role="img" aria-label="geschwärzt"\/?>(<\/span>)?<\/section>/);
  assert.deepEqual(JSON.parse(dec.decode(c.files.get('data/kontakt.json')!)), { bestbieter: 'Bau Beispiel GmbH', ansprechperson: '[geschwärzt]', telefon: '[geschwärzt]', iban: '[geschwärzt]' });
  assert.ok(xhtml.includes('data-hp-sealed='));
  // Log: one entry per address plus the removed frozen version; every entry names the check.
  const log = JSON.parse(dec.decode(c.files.get('data/redaction-log.json')!)) as lock.RedactionLogEntry[];
  assert.deepEqual(log.map((e) => e.target), ['content/index.xhtml#anlagen', 'content/index.xhtml#kontakt', 'content/nav.xhtml#toc', 'renditions/nachweis-2026-10-12/']);
  for (const e of log) {
    assert.equal(e.at, '2026-10-12T12:00:00Z');
    assert.equal(e.actor, 'Bauamt Beispielort');
    assert.equal(e.check?.hits, 0);
  }
  assert.ok(log[1]!.files!.includes('data/kontakt.json') && log[1]!.files!.includes('content/media/kontoblatt.png'));
  assert.ok(!JSON.stringify(log).includes('Mustermann'), 'the log does not repeat the redacted content');
  // History notes name no content either.
  assert.ok(!JSON.stringify(c.manifest).includes('Mustermann'));
});

test('criterion 3: the conformance checker finds no redacted term and accepts log and placeholders', async () => {
  const bytes = await frozenOnce;
  const r = await lock.redactContainer(bytes, { targets: ['content/index.xhtml#kontakt'], terms: PERSONAL, at: '2026-10-12T12:00:00Z', removeSignedRenditions: true });
  const catalog = JSON.parse(readFileSync(resolve(REPO_ROOT, 'docs/spezifikation/01-regelkatalog.json'), 'utf8')) as Catalog;
  const report = await checkConformance(r.bytes, catalog, { fileName: 'redigiert.hpro', redactedTerms: PERSONAL });
  const lockFindings = report.results.filter((f) => /^HPR-LOCK-00[2-5]$/.test(f.rule));
  assert.deepEqual(lockFindings.map((f) => `${f.rule}: ${f.message}`), []);
  assert.ok(!report.notChecked.some((n) => n.rule === 'HPR-LOCK-005'), 'HPR-LOCK-005 ran with the terms');
});

test('redaction twice appends to the log', async () => {
  const bytes = await sealedOnce;
  const first = await lock.redactContainer(bytes, { terms: ['Max Mustermann'], at: '2026-10-12T12:00:00Z' });
  const second = await lock.redactContainer(first.bytes, { terms: ['+43 512 123456'], at: '2026-10-12T12:05:00Z' });
  const log = JSON.parse(dec.decode((await readContainer(second.bytes)).files.get('data/redaction-log.json')!)) as lock.RedactionLogEntry[];
  assert.ok(log.length >= 2);
  assert.deepEqual([...new Set(log.map((e) => e.at))], ['2026-10-12T12:00:00Z', '2026-10-12T12:05:00Z']);
});
