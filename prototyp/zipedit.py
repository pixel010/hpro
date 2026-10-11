#!/usr/bin/env python3
"""Gezielte Änderungen an einem Container für die Kreuzfälle des Experiments.

Jede Operation liest IN und schreibt OUT neu. Die Datei "mimetype" bleibt erste
Datei und unkomprimiert; alle anderen Einträge behalten Reihenfolge und Inhalt,
außer dem, was die Operation ausdrücklich ändert.

    zipedit.py set-mimetype IN OUT MIME
    zipedit.py rename       IN OUT ALT NEU
    zipedit.py replace      IN OUT DATEI SUCHE ERSATZ
    zipedit.py add          IN OUT DATEI TEXT
    zipedit.py ocf-root     IN OUT ALT NEU   Signaturdatei ALT -> NEU, Wurzelelement
                                             asic:XAdESSignatures -> OCF <signatures>
    zipedit.py merge-ocf    IN OUT           alle *signatures*.xml -> eine META-INF/signatures.xml (OCF-Wurzel)
"""
import re
import sys
import zipfile

OCF_SIG_NS = "urn:oasis:names:tc:opendocument:xmlns:container"  # EPUB 3.3, signatures.xml


def rewrite(src, dst, transform, extra=None):
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
        for info in zin.infolist():
            name, data = transform(info.filename, zin.read(info.filename))
            if name is None:
                continue
            new = zipfile.ZipInfo(name, date_time=info.date_time)
            new.create_system = 3
            new.external_attr = 0o100644 << 16
            new.compress_type = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
            zout.writestr(new, data)
        for name, data in (extra or {}).items():
            new = zipfile.ZipInfo(name, date_time=(2026, 10, 11, 0, 0, 0))
            new.create_system = 3
            new.external_attr = 0o100644 << 16
            new.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(new, data)


def main(argv):
    op, src, dst, *rest = argv
    if op == "set-mimetype":
        mime = rest[0].encode("ascii")
        rewrite(src, dst, lambda n, d: (n, mime if n == "mimetype" else d))
    elif op == "rename":
        old, new = rest
        rewrite(src, dst, lambda n, d: (new if n == old else n, d))
    elif op == "replace":
        target, search, repl = rest
        def t(n, d):
            if n == target:
                if search.encode() not in d:
                    sys.exit(f"'{search}' nicht in {target} gefunden")
                d = d.replace(search.encode(), repl.encode())
            return n, d
        rewrite(src, dst, t)
    elif op == "add":
        name, text = rest
        rewrite(src, dst, lambda n, d: (n, d), extra={name: text.encode("utf-8")})
    elif op == "ocf-root":
        old, new = rest
        def t(n, d):
            if n != old:
                return n, d
            s = d.decode("utf-8")
            # Wurzelelement austauschen; Namensraumdeklaration für ds bleibt am ds:Signature-Element bzw. wird
            # an der neuen Wurzel wiederholt, damit das Dokument wohlgeformt bleibt.
            s, k1 = re.subn(r"<asic:XAdESSignatures\b([^>]*)>",
                            lambda m: f'<signatures xmlns="{OCF_SIG_NS}"'
                                      + re.sub(r'\s+xmlns:asic="[^"]*"', "", m.group(1)) + ">", s, count=1)
            s, k2 = re.subn(r"</asic:XAdESSignatures>\s*$", "</signatures>", s)
            if not (k1 and k2):
                sys.exit("Wurzelelement asic:XAdESSignatures nicht gefunden")
            return new, s.encode("utf-8")
        rewrite(src, dst, t)
    elif op == "merge-ocf":
        # alle META-INF/*signatures*.xml zu EINER META-INF/signatures.xml mit OCF-Wurzel zusammenführen
        # (EPUB 3.3: ein signatures-Element mit 1..n ds:Signature; EN 319 162-1 4.4.3.2 3c erlaubt diese Wurzel)
        with zipfile.ZipFile(src) as z:
            sig_files = sorted(n for n in z.namelist()
                               if n.startswith("META-INF/") and "signatures" in n.lower() and n.endswith(".xml"))
            parts = []
            for n in sig_files:
                s = z.read(n).decode("utf-8")
                parts += re.findall(r"<ds:Signature\b.*?</ds:Signature>", s, flags=re.S)
        merged = ('<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
                  f'<signatures xmlns="{OCF_SIG_NS}">' + "".join(parts) + "</signatures>").encode("utf-8")
        print(f"{len(parts)} ds:Signature aus {sig_files}")
        rewrite(src, dst, lambda n, d: (None, d) if n in sig_files else (n, d),
                extra={"META-INF/signatures.xml": merged})
    else:
        sys.exit(__doc__)
    print(f"{op}: {src} -> {dst}")


if __name__ == "__main__":
    main(sys.argv[1:])
