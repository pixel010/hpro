/**
 * `hpro lock …`: locks, sealed sections, redaction and the signed frozen version (package P17).
 *
 *   hpro lock status <file> [--rendition ID] [--trust cert.pem]...
 *       rules from manifest.json#access, sealed sections, whether a valid signature covers the rules
 *   hpro lock seal <in> <out> --target path#id --time ISO [--password-file F]... [--recipient cert.pem]... [--keep-heading]
 *       encrypt a section (JWE) for passwords and/or recipient certificates
 *   hpro lock open <file> --target path#id (--password-file F | --key key.pem --cert cert.pem) [--rendition ID]
 *       decrypt a sealed section and print its XHTML (nothing is written)
 *   hpro lock unseal <in> <out> --target path#id --time ISO (--password-file F | --key … --cert …)
 *       lift the seal permanently
 *   hpro lock redact <in> <out> --time ISO [--target path#id]... [--terms-file F] [--reason R] [--actor A] [--confirm-remove-signed]
 *       delete content with log data/redaction-log.json; terms one per line in a file (never on the command line)
 *   hpro lock search <file> --terms-file F
 *       full-text search over all entries (decoded) and the raw ZIP; exit 1 on any hit
 *   hpro lock freeze <in> <out> --id ID --time ISO --key key.pem --cert cert.pem [--chain ca.pem]...
 *       frozen version renditions/<ID>/ (profile signed), signature over exactly its files
 *   hpro lock frozen-check <file> --id ID [--trust cert.pem]... [--time ISO]
 *       hashes, signature, coverage; exit 0 only for "gültig signiert" (or "kryptografisch intakt" without --trust)
 *   hpro lock edit <in> <out> --target path#id --text-file F --time ISO [--replace-markup]
 *       replace the text of one element of the main version; refused for read-only and sealed targets (HP-LOCK-002)
 *   hpro lock view <file> --doc path --purpose print|export
 *       the document as it may be printed or exported (HP-LOCK-003/004)
 *
 * Passwords and terms are read from files, so they do not end up in shell histories or logs.
 * Exit codes: 0 ok, 1 refused or check failed (one line `ERROR [code]: …`), 2 usage or format
 * error, 3 redaction needs confirmation, 4 edit refused by a lock.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { SoftwareKeySigner, certificatesFromPem, lock, pkcs8FromPem, readContainer } from '../src/index.js';

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

interface Args {
  readonly positional: string[];
  readonly options: Map<string, string[]>;
  readonly flags: Set<string>;
}

const FLAGS = new Set(['--keep-heading', '--confirm-remove-signed', '--replace-markup']);

function parse(args: string[]): Args {
  const positional: string[] = [];
  const options = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (FLAGS.has(a)) flags.add(a);
    else if (a.startsWith('--')) {
      const v = args[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      (options.get(a) ?? options.set(a, []).get(a)!).push(v);
    } else positional.push(a);
  }
  return { positional, options, flags };
}

const one = (a: Args, name: string): string | undefined => a.options.get(name)?.at(-1);
const all = (a: Args, name: string): string[] => a.options.get(name) ?? [];

async function readSecret(file: string): Promise<string> {
  return (await readFile(file, 'utf8')).replace(/\r?\n$/, '');
}

async function opener(a: Args): Promise<lock.Opener> {
  const pw = one(a, '--password-file');
  if (pw) return { password: await readSecret(pw) };
  const key = one(a, '--key');
  const cert = one(a, '--cert');
  if (key && cert) return { pkcs8: pkcs8FromPem(await readFile(key, 'utf8')), certificate: certificatesFromPem(await readFile(cert, 'utf8'))[0]! };
  throw new Error('give --password-file or --key and --cert');
}

async function trust(a: Args): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const f of all(a, '--trust')) out.push(...certificatesFromPem(await readFile(f, 'utf8')));
  return out;
}

async function status(a: Args): Promise<number> {
  const [file] = a.positional;
  if (!file) return usage();
  const bytes = await readFile(file);
  const c = await readContainer(bytes);
  const rendition = one(a, '--rendition') ?? null;
  const prefix = rendition ? `renditions/${rendition}/` : '';
  const manifest = rendition ? JSON.parse(new TextDecoder().decode(c.files.get(`${prefix}manifest.json`))) : c.manifest;
  const access = lock.parseAccess(manifest);
  console.log(`file: ${file} (${bytes.length} bytes, sha256=${sha256(bytes)})`);
  console.log(`version: ${rendition ? `frozen ${rendition}` : 'main'}; profile ${String(manifest.conformsTo).split('/').pop()}`);
  console.log(`access rules (${access.length}):`);
  for (const e of access) console.log(`  ${e.target}  [${e.rules.join(', ')}]`);
  const problems = lock.checkTargets(access, c.files);
  for (const p of problems) console.log(`  PROBLEM ${p}`);
  const sealed = lock.sealedSections(manifest, c.files, prefix);
  console.log(`sealed sections (${sealed.length}):`);
  for (const s of sealed) {
    const jwe = lock.parseJwe(c.files.get(s.envelope)!);
    const h = lock.protectedHeader(jwe);
    console.log(`  ${s.target}  envelope ${s.envelope}  enc ${String(h.enc)}  recipients [${jwe.recipients.map((r) => String(r.header.alg)).join(', ')}]  hp-target ${String(h['hp-target'])}`);
  }
  const evidence = await lock.lockEvidence(bytes, rendition, { trustAnchors: await trust(a) });
  console.log(`locks covered by signature: ${evidence.status}${evidence.signatureIds.length ? ` (${evidence.signatureIds.join(', ')})` : ''}`);
  return problems.length === 0 ? 0 : 1;
}

async function seal(a: Args): Promise<number> {
  const [input, output] = a.positional;
  const target = one(a, '--target');
  const time = one(a, '--time');
  if (!input || !output || !target || !time) return usage();
  const recipients: lock.Recipient[] = [];
  for (const f of all(a, '--password-file')) recipients.push({ password: await readSecret(f) });
  for (const f of all(a, '--recipient')) recipients.push({ certificate: certificatesFromPem(await readFile(f, 'utf8'))[0]! });
  const t0 = performance.now();
  const r = await lock.sealSection(await readFile(input), { target, recipients, modified: time, keepHeading: a.flags.has('--keep-heading') });
  const ms = performance.now() - t0;
  await writeFile(output, r.bytes);
  const env = lock.parseJwe((await readContainer(r.bytes)).files.get(r.envelopePath)!);
  console.log(`${output}  ${r.bytes.length} bytes  sha256=${sha256(r.bytes)}`);
  console.log(`sealed: ${target} -> ${r.envelopePath} (JWE General JSON, enc ${String(lock.protectedHeader(env).enc)}, recipients [${env.recipients.map((x) => String(x.header.alg)).join(', ')}])`);
  console.log(`inlined and removed files: [${r.removedFiles.join(', ')}]; links/navigation entries rewritten: ${r.rewrittenLinks}`);
  console.log(`leak check: ${r.check.fragments} text fragments of the section searched in ${r.check.entries} entries and the raw ZIP: ${r.check.hits.length} hits`);
  console.log(`took ${ms.toFixed(0)} ms`);
  return 0;
}

async function open(a: Args): Promise<number> {
  const [file] = a.positional;
  const target = one(a, '--target');
  if (!file || !target) return usage();
  const r = await lock.openSealedSection(await readFile(file), target, await opener(a), one(a, '--rendition') ?? null);
  console.log(r.xhtml);
  return 0;
}

async function unseal(a: Args): Promise<number> {
  const [input, output] = a.positional;
  const target = one(a, '--target');
  const time = one(a, '--time');
  if (!input || !output || !target || !time) return usage();
  const out = await lock.unsealSection(await readFile(input), target, await opener(a), time);
  await writeFile(output, out);
  console.log(`${output}  ${out.length} bytes  sha256=${sha256(out)}; seal of ${target} lifted`);
  return 0;
}

async function terms(a: Args): Promise<string[]> {
  const out: string[] = [];
  for (const f of all(a, '--terms-file')) out.push(...(await readFile(f, 'utf8')).split(/\r?\n/).map((t) => t.trim()).filter(Boolean));
  return out;
}

async function redact(a: Args): Promise<number> {
  const [input, output] = a.positional;
  const time = one(a, '--time');
  if (!input || !output || !time) return usage();
  const t = await terms(a);
  try {
    const r = await lock.redactContainer(await readFile(input), {
      targets: all(a, '--target'),
      terms: t,
      at: time,
      ...(one(a, '--reason') ? { reason: one(a, '--reason')! } : {}),
      ...(one(a, '--actor') ? { actor: one(a, '--actor')! } : {}),
      removeSignedRenditions: a.flags.has('--confirm-remove-signed'),
    });
    await writeFile(output, r.bytes);
    console.log(`${output}  ${r.bytes.length} bytes  sha256=${sha256(r.bytes)}`);
    console.log(`targets: ${all(a, '--target').length}, terms: ${t.length} (not shown)`);
    console.log(`replacements per file: ${Object.entries(r.replacements).map(([f, n]) => `${f}=${n}`).join(', ')}`);
    console.log(`changed files: [${r.changedFiles.join(', ')}]`);
    console.log(`removed files: [${r.removedFiles.join(', ')}]`);
    console.log(`removed frozen versions: [${r.removedRenditions.map((x) => `${x.id}${x.signed ? ` signed by ${x.signatures.join(', ')}` : ''}`).join(', ')}]`);
    console.log(`main-version signatures no longer valid (kept, part 1 7.2): [${r.invalidatedSignatures.join(', ')}]`);
    console.log(`log entries added to ${lock.REDACTION_LOG}: ${r.entries.length}`);
    console.log(`verification on the written file: ${r.check.needles} search strings in ${r.check.entries} entries and the raw ZIP: ${r.check.hits} hits`);
    return 0;
  } catch (err) {
    if (err instanceof lock.RedactionNeedsConfirmation) {
      console.log(`WARNING: ${err.message}`);
      return 3;
    }
    throw err;
  }
}

async function search(a: Args): Promise<number> {
  const [file] = a.positional;
  if (!file) return usage();
  const t = await terms(a);
  const r = await lock.searchContainer(await readFile(file), t);
  console.log(`file: ${file}; ${t.length} search strings (not shown); ${r.entries} entries decoded (UTF-8, markup without tags, JSON strings) plus the raw ZIP (UTF-8, UTF-16LE/BE)`);
  for (const h of r.hits) console.log(`  HIT  string #${h.needle + 1}  in ${h.entry} (${h.reading})`);
  console.log(`hits: ${r.hits.length}`);
  return r.hits.length === 0 ? 0 : 1;
}

async function freeze(a: Args): Promise<number> {
  const [input, output] = a.positional;
  const id = one(a, '--id');
  const time = one(a, '--time');
  const key = one(a, '--key');
  const chain: Uint8Array[] = [];
  for (const f of [...all(a, '--cert'), ...all(a, '--chain')]) chain.push(...certificatesFromPem(await readFile(f, 'utf8')));
  if (!input || !output || !id || !time || !key || chain.length === 0) return usage();
  const signer = await SoftwareKeySigner.fromPkcs8(pkcs8FromPem(await readFile(key, 'utf8')), { certificateChain: chain });
  const r = await lock.freezeAndSign(await readFile(input), { id, createdAt: time, signer, signatureId: `sig-${id}` });
  await writeFile(output, r.bytes);
  console.log(`${output}  ${r.bytes.length} bytes  sha256=${sha256(r.bytes)}`);
  console.log(`frozen version renditions/${id}/ with ${r.files.length} files, signature ${r.signatureId} over exactly these files plus META-INF/container.xml`);
  return 0;
}

async function frozenCheck(a: Args): Promise<number> {
  const [file] = a.positional;
  const id = one(a, '--id');
  if (!file || !id) return usage();
  const anchors = await trust(a);
  const time = one(a, '--time');
  const bytes = await readFile(file);
  const r = await lock.checkFrozenVersion(bytes, id, { trustAnchors: anchors, ...(time ? { validationTime: time } : {}) });
  console.log(`file: ${file} (${bytes.length} bytes, sha256=${sha256(bytes)})`);
  console.log(`frozen version: renditions/${id}/ (${r.files.length} files)`);
  console.log(`version manifest hashes: ${r.integrity.ok ? 'all match' : 'MISMATCH'} (${r.integrity.resources.length} resources)`);
  for (const x of r.integrity.resources.filter((x) => x.status !== 'ok')) console.log(`  ${x.status}  ${x.path}`);
  for (const s of r.signatures) {
    console.log(`signature ${s.signatureId}: ${s.indication}${s.subIndication ? ' / ' + s.subIndication : ''}; signer ${s.signer ?? '?'}; time ${s.signingTime ?? '?'}`);
    console.log(`  coverage: missing [${s.missing.join(', ')}], outside the version [${s.outside.join(', ')}]`);
    if (s.changed.length) console.log(`  references with HASH_FAILURE: [${s.changed.join(', ')}]`);
  }
  console.log(`changed files: [${r.changed.join(', ')}]`);
  console.log(`verdict: ${r.verdict}`);
  const ok = r.verdict === 'gültig signiert' || (anchors.length === 0 && r.verdict === 'kryptografisch intakt, Vertrauen nicht geprüft');
  return ok ? 0 : 1;
}

async function edit(a: Args): Promise<number> {
  const [input, output] = a.positional;
  const target = one(a, '--target');
  const textFile = one(a, '--text-file');
  const time = one(a, '--time');
  if (!input || !output || !target || !textFile || !time) return usage();
  const before = await readFile(input);
  try {
    const out = await lock.editText(before, { target, text: (await readFile(textFile, 'utf8')).trim(), modified: time, replaceMarkup: a.flags.has('--replace-markup') });
    await writeFile(output, out);
    console.log(`${output}  ${out.length} bytes  sha256=${sha256(out)}; text of ${target} replaced`);
    return 0;
  } catch (err) {
    if (err instanceof lock.LockError) {
      console.log(`REFUSED [${err.code}]: ${err.message}`);
      console.log(`input unchanged: sha256=${sha256(before)}; nothing written to ${output}`);
      return 4;
    }
    throw err;
  }
}

async function view(a: Args): Promise<number> {
  const [file] = a.positional;
  const doc = one(a, '--doc');
  const purpose = one(a, '--purpose');
  if (!file || !doc || (purpose !== 'print' && purpose !== 'export')) return usage();
  const c = await readContainer(await readFile(file));
  const r = lock.outputViewBytes(c.files.get(doc)!, doc, lock.parseAccess(c.manifest), purpose);
  for (const o of r.omitted) console.error(`omitted ${o.target}: „${o.notice}“`);
  process.stdout.write(new TextDecoder().decode(r.bytes));
  return 0;
}

function usage(): number {
  console.error('usage: hpro lock status|seal|open|unseal|redact|search|freeze|frozen-check|edit|view … (see kern/bin/hpro-lock.ts)');
  return 2;
}

export async function lockCommand(argv: string[]): Promise<number> {
  try {
    return await dispatch(argv);
  } catch (err) {
    // Refusals of the core are results, not crashes: one line, exit 1.
    if (err instanceof lock.LockError || err instanceof lock.JweError) {
      console.error(`ERROR [${err.code}]: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

async function dispatch(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const a = parse(rest);
  switch (cmd) {
    case 'status':
      return status(a);
    case 'seal':
      return seal(a);
    case 'open':
      return open(a);
    case 'unseal':
      return unseal(a);
    case 'redact':
      return redact(a);
    case 'search':
      return search(a);
    case 'freeze':
      return freeze(a);
    case 'frozen-check':
      return frozenCheck(a);
    case 'edit':
      return edit(a);
    case 'view':
      return view(a);
    default:
      return usage();
  }
}
