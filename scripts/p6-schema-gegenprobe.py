"""
Gegenprobe P6: Datenobjekte gegen das JSON-Schema mit einem unabhängigen Prüfer (python-jsonschema,
Draft 2020-12), ohne Code aus kern/.

    prototyp/.venv/bin/python scripts/p6-schema-gegenprobe.py SCHEMA.json DIR

DIR/faelle.txt nennt je Zeile "<name> gueltig|ungueltig"; geprüft wird DIR/<name>.json.
Exit 0, wenn jeder Fall wie erwartet beurteilt wird.
"""
import json
import os
import sys
from importlib.metadata import version

from jsonschema import Draft202012Validator


def main():
    schema_file, folder = sys.argv[1], sys.argv[2]
    with open(schema_file, encoding='utf-8') as fh:
        schema = json.load(fh)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    print('python-jsonschema %s, Draft 2020-12, Schema %s: Schema selbst gültig' % (version('jsonschema'), schema_file))
    wrong = 0
    with open(os.path.join(folder, 'faelle.txt'), encoding='utf-8') as fh:
        cases = [line.split() for line in fh if line.strip()]
    for name, expect in cases:
        with open(os.path.join(folder, name + '.json'), encoding='utf-8') as fh:
            data = json.load(fh)
        errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
        verdict = 'gueltig' if not errors else 'ungueltig'
        ok = verdict == expect
        wrong += 0 if ok else 1
        print('%-34s erwartet %-9s python-jsonschema: %-9s %s' % (name, expect, verdict, 'ok' if ok else 'FALSCH'))
        for e in errors[:2]:
            print('%36s/%s: %s' % ('', '/'.join(str(p) for p in e.absolute_path), e.message[:140]))
    print()
    print('%d Fälle, %d falsch beurteilt (python-jsonschema).' % (len(cases), wrong))
    sys.exit(0 if wrong == 0 else 1)


if __name__ == '__main__':
    main()
