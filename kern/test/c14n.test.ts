import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { C14N, canonicalize } from '../src/index.js';
import { REPO_ROOT } from './helpers.js';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

function byId(xml: string, id: string) {
  const doc = parse(xml);
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) if (all.item(i)!.getAttribute('Id') === id) return all.item(i)!;
  throw new Error(`no element with Id ${id}`);
}

// Hand-checked against the rules of Exclusive XML Canonicalization 1.0, sections 3 and 4.
test('exclusive c14n: only visibly used namespaces, sorted attributes, escaping', () => {
  const xml =
    '<r xmlns="urn:d" xmlns:a="urn:a" xmlns:unused="urn:u"><a:e Id="t" z="1" a:y="2" b="&quot;&lt;&#9;&#10;">x &amp; &gt; y<!--c--><f xmlns=""/><a:g/></a:e></r>';
  assert.equal(
    canonicalize(byId(xml, 't'), C14N.exclusive),
    '<a:e xmlns:a="urn:a" Id="t" b="&quot;&lt;&#x9;&#xA;" z="1" a:y="2">x &amp; &gt; y<f></f><a:g></a:g></a:e>',
  );
  assert.equal(
    canonicalize(byId(xml, 't'), C14N.exclusiveWithComments),
    '<a:e xmlns:a="urn:a" Id="t" b="&quot;&lt;&#x9;&#xA;" z="1" a:y="2">x &amp; &gt; y<!--c--><f></f><a:g></a:g></a:e>',
  );
  // InclusiveNamespaces PrefixList pulls an in-scope but unused prefix in.
  assert.match(canonicalize(byId(xml, 't'), C14N.exclusive, { inclusivePrefixes: ['unused'] }), /^<a:e xmlns:a="urn:a" xmlns:unused="urn:u" Id/);
});

test('exclusive c14n: default namespace is undeclared when a rendered ancestor set it', () => {
  const xml = '<r xmlns="urn:d"><s Id="t"><u xmlns=""><v xmlns="urn:d"/></u></s></r>';
  assert.equal(canonicalize(byId(xml, 't'), C14N.exclusive), '<s xmlns="urn:d" Id="t"><u xmlns=""><v xmlns="urn:d"></v></u></s>');
});

test('inclusive c14n 1.0 renders every in-scope namespace and inherits xml:lang at the apex', () => {
  const xml = '<r xmlns="urn:d" xmlns:a="urn:a" xml:lang="de"><s Id="t"><a:u/></s></r>';
  assert.equal(canonicalize(byId(xml, 't'), C14N.inclusive10), '<s xmlns="urn:d" xmlns:a="urn:a" Id="t" xml:lang="de"><a:u></a:u></s>');
});

// Cross-check with libxml2 (lxml from prototyp/.venv), an independent implementation.
const PY = resolve(REPO_ROOT, 'prototyp/.venv/bin/python');
const lxmlAvailable = existsSync(PY) && (() => {
  try {
    execFileSync(PY, ['-c', 'import lxml.etree'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const SAMPLES = [
  '<r xmlns="urn:d" xmlns:a="urn:a" xmlns:b="urn:b"><a:e Id="t" b:x="1" y="2" a:z="3">t<b:f a:q="&amp;&lt;"/><g xmlns=""><h xmlns="urn:d2"/></g><!--k--><?pi data?></a:e></r>',
  '<x:root xmlns:x="urn:x" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo Id="t"><ds:Ref URI="a b" Type="&#13;&#9;"/>\n  <x:k>&lt;&gt;&amp;"\'</x:k>\r\n</ds:SignedInfo></x:root>',
  // Ancestor xml:* attributes are left out here: lxml canonicalizes the subtree as if it were a
  // document of its own, while C14N 1.0 (2.4) lets the apex inherit them. That rule is covered
  // by the hand-checked test above.
  '<doc xmlns:p="urn:p"><p:a Id="t" xml:lang="de" xml:space="preserve"><b p:c="v"/><![CDATA[<cdata & >]]></p:a></doc>',
];

test('c14n matches libxml2 (lxml) on sample documents', { skip: lxmlAvailable ? false : 'prototyp/.venv with lxml not available (prototyp/setup-tools.sh)' }, () => {
  const script = `
import sys, json, lxml.etree as E
out = []
for xml in json.loads(sys.stdin.read()):
    root = E.fromstring(xml.encode())
    el = root.xpath('//*[@Id="t"]')[0]
    r = {}
    for name, ex, wc in [('exc', True, False), ('excwc', True, True), ('inc', False, False), ('incwc', False, True)]:
        r[name] = E.tostring(el, method='c14n', exclusive=ex, with_comments=wc).decode()
    out.append(r)
print(json.dumps(out))
`;
  const expected = JSON.parse(execFileSync(PY, ['-c', script], { input: JSON.stringify(SAMPLES) }).toString()) as Record<string, string>[];
  SAMPLES.forEach((xml, i) => {
    const el = byId(xml, 't');
    assert.equal(canonicalize(el, C14N.exclusive), expected[i]!['exc'], `exclusive, sample ${i}`);
    assert.equal(canonicalize(el, C14N.exclusiveWithComments), expected[i]!['excwc'], `exclusive with comments, sample ${i}`);
    assert.equal(canonicalize(el, C14N.inclusive10), expected[i]!['inc'], `inclusive, sample ${i}`);
    assert.equal(canonicalize(el, C14N.inclusive10WithComments), expected[i]!['incwc'], `inclusive with comments, sample ${i}`);
  });
});
