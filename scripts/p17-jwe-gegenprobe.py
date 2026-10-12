#!/usr/bin/env python3
"""Gegenprobe P17: jwcrypto (unabhängige JWE-Implementierung) öffnet den Umschlag eines
versiegelten Abschnitts aus einem hpro-Container.

  prototyp/.venv/bin/python scripts/p17-jwe-gegenprobe.py <container> <umschlag-pfad> \
      --password-file F --key rsa-key.pem --key ec-key.pem

Ausgegeben werden Kopfzeile, Empfänger, Länge und SHA-256 des Klartexts je Schlüssel (nicht der
Klartext). Exit 0, wenn alle Schlüssel denselben Klartext liefern und ein falsches Kennwort
abgewiesen wird.
"""
import argparse, base64, hashlib, json, sys, zipfile
import jwcrypto, jwcrypto.jwa as jwa
from jwcrypto import jwe, jwk
from importlib.metadata import version

jwa.default_max_pbkdf2_iterations = 2_000_000  # hpro nutzt 600 000 (jwcrypto-Vorgabe: siehe unten)

ap = argparse.ArgumentParser()
ap.add_argument('container'); ap.add_argument('envelope')
ap.add_argument('--password-file'); ap.add_argument('--key', action='append', default=[])
a = ap.parse_args()
print(f"jwcrypto {version('jwcrypto')}, cryptography {version('cryptography')}")
raw = zipfile.ZipFile(a.container).read(a.envelope).decode('utf-8')
env = json.loads(raw)
hdr = json.loads(base64.urlsafe_b64decode(env['protected'] + '=' * (-len(env['protected']) % 4)))
print('protected header:', json.dumps(hdr, ensure_ascii=False))
print('recipients:', [r['header']['alg'] for r in env['recipients']])
digests = []
keys = []
if a.password_file:
    keys.append(('Kennwort', jwk.JWK.from_password(open(a.password_file, encoding='utf-8').read().rstrip('\n'))))
for k in a.key:
    keys.append((k.split('/')[-1], jwk.JWK.from_pem(open(k, 'rb').read())))
ok = True
for name, key in keys:
    t = jwe.JWE()
    try:
        t.deserialize(raw, key=key)
        d = hashlib.sha256(t.payload).hexdigest()
        digests.append(d)
        print(f'{name}: geöffnet, {len(t.payload)} Bytes, sha256={d}')
    except Exception as e:  # noqa: BLE001
        ok = False
        print(f'{name}: FEHLER {type(e).__name__}: {e}')
t = jwe.JWE()
try:
    t.deserialize(raw, key=jwk.JWK.from_password('falsches-Kennwort-123'))
    ok = False
    print('falsches Kennwort: GEÖFFNET (Fehler)')
except Exception as e:  # noqa: BLE001
    print(f'falsches Kennwort: abgewiesen ({type(e).__name__})')
same = len(set(digests)) == 1 and len(digests) == len(keys)
print('alle Schlüssel liefern denselben Klartext:', 'ja' if same else 'NEIN')
sys.exit(0 if ok and same else 1)
