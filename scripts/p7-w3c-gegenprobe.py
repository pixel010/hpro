#!/usr/bin/env python3
"""
Independent cross-check of hpro annotations against the W3C Web Annotation Data Model
(package P7). No code from kern/ is used.

1. The W3C test definitions of the Web Annotation Working Group (web-platform-tests,
   `annotation-model/`: JSON Schema draft-04 assertions and definitions) are run with
   python-jsonschema (with format checks, as ajv in the W3C runner) on every annotation file of the given containers and on every member of the
   given exported collections, the way their runner `scripts/JSONtest.js` does:
   `annotations/annotationMusts.test` (all MUSTs of the model) and, informatively, which optional
   features each annotation uses (`annotationOptionals.test` and selectors/styles from
   `specificResource/`). Collections additionally run `collections/collectionMusts.test`.
2. Every annotation is processed as JSON-LD with pyld (context `http://www.w3.org/ns/anno.jsonld`
   from a local copy, no network): expanded to RDF, then compacted again with the same context;
   it must come back unchanged (no member dropped as an undefined term), and `oa:hasSource`
   must be the address resolved against the container root.

hpro writes addresses relative to the container root (HP-RS-011; the same as EPUB Annotations 1.0,
WD 2026-09-20, 3.3.1: `"source": "OEBPS/text/chapter1.html"`). The W3C tests check `format: uri`
(an absolute IRI). Every annotation is therefore checked twice: as stored, and with `target` /
`target.source` resolved against the container root (`https://container.invalid/`), as a JSON-LD
processor with that base does. A failure that only occurs as stored is reported as "nur relative
IRI"; the result counts the failures of the resolved form.

usage: p7-w3c-gegenprobe.py <wpt annotation-model dir> <anno.jsonld> (<file.hpro>|<collection.jsonld>)...
exit 0 when every MUST passes and every round trip is exact, else 1.
"""
import copy
import json
import os
import sys
import zipfile

from jsonschema import Draft4Validator
from pyld import jsonld
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT4

BASE = 'https://wpt.invalid/annotation-model/'
# ajv (the W3C runner) checks `format` (date-time, uri); python-jsonschema only with a checker.
FORMATS = Draft4Validator.FORMAT_CHECKER
CONTAINER_ROOT = 'https://container.invalid/'


def load_tree(wpt):
    """Every JSON file of the test tree, registered under a flat virtual directory by its id."""
    registry = Registry()
    by_path = {}
    for sub in ('annotations', 'collections', 'definitions'):
        for dirpath, _, names in os.walk(os.path.join(wpt, sub)):
            for name in names:
                if not name.endswith('.json'):
                    continue
                full = os.path.join(dirpath, name)
                with open(full, encoding='utf-8') as f:
                    data = json.load(f)
                rel = os.path.relpath(full, wpt).replace(os.sep, '/')
                # Definitions keep their id (assertions refer to them as "annotations.json#…"); an
                # assertion gets a unique id in the same flat directory, so that its relative
                # references resolve there too (as ajv does in JSONtest.js).
                uri = BASE + (name if sub == 'definitions' else rel.replace('/', '__'))
                data = dict(data)
                data['id'] = uri
                by_path[rel] = data
                registry = registry.with_resource(uri, Resource.from_contents(data, default_specification=DRAFT4))
    return registry, by_path


def run(assertions, content, registry, by_path, level=1, compare='and', skip_types=()):
    """JSONtest.js runTests: returns (action, results, log)."""
    action = 'continue'
    results = []
    log = []
    for assertion in assertions:
        if isinstance(assertion, list):
            a, _, sub = run(assertion, content, registry, by_path, level + 1, 'and', skip_types)
            log += sub
            if a == 'abort':
                action = 'abort'
            continue
        if isinstance(assertion, dict) and 'compareWith' in assertion and isinstance(assertion.get('assertions'), list):
            _, child, sub = run(assertion['assertions'], content, registry, by_path, level + 1, assertion['compareWith'], skip_types)
            log += sub
            ok = any(child) if assertion['compareWith'] == 'or' else all(child)
            typ = assertion.get('assertionType', 'must').lower()
            log.append((typ, ok, assertion.get('title', 'comparison'), '' if ok else assertion.get('errorMessage', '')))
            results.append(ok)
            continue
        if action == 'abort':
            break
        schema = by_path.get(assertion) if isinstance(assertion, str) else assertion
        if schema is None:
            log.append(('must', False, f'unresolved {assertion}', 'assertion file missing'))
            results.append(False)
            continue
        typ = schema.get('assertionType', 'must').lower()
        if action != 'continue':
            continue
        # Through a reference, so that the schema's own id is the base of its relative references.
        validator = Draft4Validator({'$ref': schema['id']} if 'id' in schema else schema, registry=registry, format_checker=FORMATS)
        valid = validator.is_valid(content)
        expected = schema.get('expectedResult', 'valid')
        ok = (expected == 'valid' and valid) or (expected == 'invalid' and not valid)
        results.append(ok)
        if not ok:
            mapping = {'failAndContinue': 'continue', 'failAndSkip': 'skip', 'failAndAbort': 'abort', 'passAndContinue': 'continue', 'passAndSkip': 'skip', 'passAndAbort': 'abort'}
            action = mapping.get(schema.get('onUnexpectedResult', 'failAndContinue'), 'continue')
        if ok or typ not in skip_types:
            log.append((typ, ok, schema.get('title', assertion if isinstance(assertion, str) else 'inline'), '' if ok else schema.get('errorMessage', '')))
    return action, results, log


def run_test_file(path, content, registry, by_path):
    with open(path, encoding='utf-8') as f:
        test = json.load(f)
    _, _, log = run(test['assertions'], content, registry, by_path, skip_types=tuple(test.get('skipFailures', [])))
    return log


FEATURES = {
    'TextQuoteSelector': 'annotations/specificResource/4.2.4-textQuoteSelector.json',
    'prefix': 'annotations/specificResource/4.2.4-prefix.json',
    'suffix': 'annotations/specificResource/4.2.4-suffix.json',
    'TextPositionSelector': 'annotations/specificResource/4.2.5-textPositionSelector.json',
    'SvgSelector': 'annotations/specificResource/4.2.7-svgSelector.json',
    'styleClass': 'annotations/specificResource/4.4-styleClass.json',
    'stylesheet': 'annotations/4.4-annotationStylesheetImplemented.json',
    'creator': 'annotations/3.3.1-annotationCreatorImplemented.json',
    'created': 'annotations/3.3.1-annotationCreatedImplemented.json',
    'generator': 'annotations/3.3.1-annotationGeneratorImplemented.json',
    'motivation': 'annotations/3.3.5-annotationMotivationImplemented.json',
    'TextualBody': 'annotations/bodiesTargets/3.2.4-bodyETBTypeTextualBody.json',
    'body language': 'annotations/bodiesTargets/3.2.1-bodyLanguage.json',
}


def features(content, registry, by_path):
    out = []
    for name, rel in FEATURES.items():
        schema = by_path[rel]
        valid = Draft4Validator({'$ref': schema['id']}, registry=registry, format_checker=FORMATS).is_valid(content)
        expected = schema.get('expectedResult', 'valid')
        if (expected == 'valid') == valid:
            out.append(name)
    return out


def loader_for(context_file):
    with open(context_file, encoding='utf-8') as f:
        anno = json.load(f)

    def load(url, options=None):
        if url.rstrip('/') in ('http://www.w3.org/ns/anno.jsonld', 'https://www.w3.org/ns/anno.jsonld'):
            return {'contextUrl': None, 'documentUrl': url, 'document': anno}
        raise RuntimeError(f'no network: refusing to load {url}')

    return load


def absolutize(annotation):
    a = copy.deepcopy(annotation)
    rel = lambda v: isinstance(v, str) and ':' not in v.split('#')[0].split('/')[0]
    t = a.get('target')
    if rel(t):
        a['target'] = CONTAINER_ROOT + t
    elif isinstance(t, dict) and rel(t.get('source')):
        t['source'] = CONTAINER_ROOT + t['source']
    return a


def jsonld_check(annotation, loader):
    """Expansion, RDF and compaction round trip; returns (ok, triples, source, status_iri, detail)."""
    doc = copy.deepcopy(annotation)
    options = {'documentLoader': loader, 'base': CONTAINER_ROOT}
    expanded = jsonld.expand(doc, options)
    nquads = jsonld.to_rdf(doc, {**options, 'format': 'application/n-quads'})
    triples = len([l for l in nquads.splitlines() if l.strip()])
    node = expanded[0]
    target = node.get('http://www.w3.org/ns/oa#hasTarget', [{}])[0]
    source = (target.get('http://www.w3.org/ns/oa#hasSource', [{}])[0].get('@id') if '@id' not in target or len(target) > 1 else target.get('@id'))
    status = node.get('https://hpro.example/ns/v0#status', [{}])[0].get('@value')
    compacted = jsonld.compact(expanded, doc['@context'], options)
    # Compaction writes the relative source back as an absolute IRI under the base: undo for the comparison.
    def strip(v):
        if isinstance(v, dict):
            return {k: strip(x) for k, x in v.items()}
        if isinstance(v, list):
            return [strip(x) for x in v]
        if isinstance(v, str) and v.startswith(CONTAINER_ROOT):
            return v[len(CONTAINER_ROOT):]
        return v
    compacted = strip(compacted)
    ok = compacted == annotation
    detail = ''
    if not ok:
        detail = json.dumps({'original': annotation, 'roundtrip': compacted}, ensure_ascii=False)[:600]
    return ok, triples, source, status, detail


def annotations_of(path):
    if zipfile.is_zipfile(path):
        z = zipfile.ZipFile(path)
        for name in sorted(z.namelist()):
            if name.startswith('annotations/') and name.endswith('.jsonld'):
                yield name, json.loads(z.read(name).decode('utf-8')), None
        return
    with open(path, encoding='utf-8') as f:
        coll = json.load(f)
    yield '(collection)', coll, 'collection'
    for item in coll['first']['items']:
        yield item['id'], {'@context': coll['@context'], **item}, None


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    wpt, context_file, files = sys.argv[1], sys.argv[2], sys.argv[3:]
    registry, by_path = load_tree(wpt)
    loader = loader_for(context_file)
    musts_test = os.path.join(wpt, 'annotations', 'annotationMusts.test')
    optionals_test = os.path.join(wpt, 'annotations', 'annotationOptionals.test')
    coll_test = os.path.join(wpt, 'collections', 'collectionMusts.test')
    with open(musts_test, encoding='utf-8') as f:
        n_musts = len(json.load(f)['assertions'])
    print(f'WPT annotation-model: {len(by_path)} JSON-Dateien geladen; annotationMusts.test mit {n_musts} Zusicherungen')
    total = failed = rt_failed = relative_total = 0
    for path in files:
        print(f'\n## {path}')
        for name, content, kind in annotations_of(path):
            if kind == 'collection':
                log = run_test_file(coll_test, content, registry, by_path)
                bad = [l for l in log if l[0] == 'must' and not l[1]]
                print(f'  Sammlung: collectionMusts {len([l for l in log if l[0] == "must" and l[1]])} bestanden, {len(bad)} nicht bestanden; total={content.get("total")}, Einträge={len(content["first"]["items"])}')
                for b in bad:
                    print(f'    MUST NICHT BESTANDEN: {b[2]} – {b[3]}')
                failed += len(bad)
                continue
            total += 1
            log_stored = run_test_file(musts_test, content, registry, by_path)
            stored_bad = {l[2] for l in log_stored if l[0] == 'must' and not l[1]}
            resolved = absolutize(content)
            log = run_test_file(musts_test, resolved, registry, by_path)
            bad = [l for l in log if l[0] == 'must' and not l[1]]
            passed = len([l for l in log if l[0] == 'must' and l[1]])
            only_relative = len(stored_bad - {b[2] for b in bad})
            opt = run_test_file(optionals_test, resolved, registry, by_path)
            opt_ok = len([l for l in opt if l[1]])
            ok, triples, source, status, detail = jsonld_check(content, loader)
            if not ok:
                rt_failed += 1
            failed += len(bad)
            relative_total += only_relative
            kind_label = content.get('motivation')
            print(f'  {name}: {kind_label}; MUST {passed}/{len(log_stored)} bestanden, {len(bad)} nicht bestanden (aufgelöste IRI); wie gespeichert {len(stored_bad)} nicht bestanden, davon nur relative IRI {only_relative}; optional erkannt {opt_ok}; Merkmale: {", ".join(features(resolved, registry, by_path))}')
            print(f'    JSON-LD: {triples} Tripel, Ziel={source}, hp:status={status}, Rundreise {"gleich" if ok else "ABWEICHEND"}')
            for b in bad:
                print(f'    MUST NICHT BESTANDEN: {b[2]} – {b[3]}')
            if detail:
                print(f'    {detail}')
    print(f'\nErgebnis: {total} Anmerkungen; MUST-Verstöße (IRI gegen die Container-Wurzel aufgelöst) {failed}; Verstöße nur wegen relativer IRI wie gespeichert {relative_total}; JSON-LD-Rundreisen abweichend {rt_failed}')
    return 0 if failed == 0 and rt_failed == 0 and total > 0 else 1


if __name__ == '__main__':
    sys.exit(main())
