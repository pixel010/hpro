#!/usr/bin/env python3
"""Create the test variants (b)-(e) of the Prüfstein from out/pruefstein.hpro.

Usage:  python3 varianten.py [<source.hpro>] [<out-dir>]

  (c) out/variante-c-veraendert.hpro   content/index.xhtml rewritten with a changed word
  (d) out/variante-d-ergaenzt.hpro     extra file annotations/notiz.json added
  (e) out/variante-e-traversal.hpro    extra entry named ../x (must be rejected)
  (x) out/variante-x-kopie.bin         byte-identical copy with a foreign extension (HP-CONT-013)

Standard library only; the ZIP is rewritten entry by entry so that `mimetype` stays
the first, stored entry (a foreign ZIP tool would do the same when editing in place).
"""

import os
import shutil
import sys
import zipfile


def rewrite(src, dst, replace=None, extra=None):
    """Copy src to dst entry by entry; replace[name] -> new bytes; extra = [(name, bytes)]."""
    replace = replace or {}
    extra = extra or []
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", allowZip64=False) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename in replace:
                data = replace[info.filename]
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            zi.create_system = info.create_system
            zout.writestr(zi, data)
        for name, data in extra:
            zi = zipfile.ZipInfo(name, date_time=(2026, 10, 11, 12, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(zi, data)


def main(argv):
    src = argv[1] if len(argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "pruefstein.hpro")
    out = argv[2] if len(argv) > 2 else os.path.dirname(src)
    os.makedirs(out, exist_ok=True)

    with zipfile.ZipFile(src) as z:
        index = z.read("content/index.xhtml")
    changed = index.replace("3 480,00".encode("utf-8"), "8 430,00".encode("utf-8"), 1)
    if changed == index:
        changed = index.replace(b"</h1>", b" (ge\xc3\xa4ndert)</h1>", 1)
    assert changed != index

    c = os.path.join(out, "variante-c-veraendert.hpro")
    rewrite(src, c, replace={"content/index.xhtml": changed})

    d = os.path.join(out, "variante-d-ergaenzt.hpro")
    note = (b'{"@context": "http://www.w3.org/ns/anno.jsonld", "type": "Annotation", '
            b'"body": "Nachtr\xc3\xa4glich erg\xc3\xa4nzte Notiz", '
            b'"target": {"source": "content/index.xhtml#messwerte"}}\n')
    rewrite(src, d, extra=[("annotations/notiz.json", note)])

    e = os.path.join(out, "variante-e-traversal.hpro")
    rewrite(src, e, extra=[("../x", b"traversal\n")])

    x = os.path.join(out, "variante-x-kopie.bin")
    shutil.copyfile(src, x)

    for p in (c, d, e, x):
        print(p)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
