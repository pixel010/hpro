#!/usr/bin/env bash
# Container-Experiment Phase 2: EPUB (OCF) und ASiC-E in EINER Datei?
# Erzeugt alle Varianten unter ergebnisse/container/ und schreibt die wörtlichen Ausgaben
# aller Prüfwerkzeuge nach ergebnisse/NN-*.txt. Voraussetzung: ./setup-tools.sh
set -uo pipefail
cd "$(dirname "$0")"

C=ergebnisse/container
mkdir -p "$C" out/keys out/tmp
rm -f "$C"/* ergebnisse/*.txt

JAVA=tools/jdk-21.0.12.1+1/bin/java
export QT_QPA_PLATFORM=offscreen

# --- Werkzeug-Kurzformen (so erscheinen sie in den Protokollen) ---------------------------------
epubcheck()   { "$JAVA" -jar tools/epubcheck-5.4.0/epubcheck.jar "$@"; }
# epubcheck verweigert Dateien ohne Endung .epub ("Mode required for non-epub files"); epubcheck_kopie prüft
# dieselben Bytes unter einem .epub-Namen.
epubcheck_kopie(){ local k; k="out/tmp/$(basename "$1").epub"; cp "$1" "$k"
                   echo "(Kopie: $k, $(cmp -s "$1" "$k" && echo byte-identisch))"; epubcheck "$k"; }
dss()         { "$JAVA" -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -cp "dss/target/classes:dss/target/lib/*" example.hpro.HproDss "$@"; }
dss_validate(){ dss validate "$1" "$C/signer.pem" "${@:2}"; }
dss_sign()    { dss sign "$1" "$2" "$3" out/keys/signer.p12 test "${@:4}"; }
dss_sign_dir(){ dss sign-files "$1" "$2" "$3" out/keys/signer.p12 test "${@:4}"; }
# calibre: stderr verworfen, weil ebook-meta beim Rendern des Titelbilds ohne Qt-GUI-Bibliotheken
# einen Traceback ausgibt, der mit dem Container nichts zu tun hat (siehe docs/05).
calibre_meta(){ tools/calibre/ebook-meta "$1" 2>/dev/null | grep -E '^(Title|Languages)'; }
calibre_text(){ local t; t="out/tmp/$(basename "$1").txt"; rm -f "$t"
                cp "$1" "out/tmp/$(basename "$1").epub"
                tools/calibre/ebook-convert "out/tmp/$(basename "$1").epub" "$t" >/dev/null 2>&1 \
                  && { echo "ebook-convert: OK"; grep -E 'Prüfdokument|EUR' "$t" | head -3; } \
                  || echo "ebook-convert: FEHLGESCHLAGEN"; }
reader()      { .venv/bin/python reader_check.py "$1"; }
listing()     { python3 - "$1" <<'EOF'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
for i in z.infolist():
    print(f"{i.filename:45s} {'stored' if i.compress_type == 0 else 'deflated'}")
print("mimetype =", z.read("mimetype").decode() if "mimetype" in z.namelist() else "(fehlt)")
EOF
}
zipedit()     { python3 zipedit.py "$@"; }
unpack()      { rm -rf "$2"; python3 -c "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);[z.extract(n,sys.argv[2]) for n in z.namelist() if n!='mimetype']" "$1" "$2"; echo "entpackt (ohne mimetype): $1 -> $2"; }

run() { echo "\$ $*"; "$@" 2>&1; echo "[Exit-Code $?]"; echo; }
log() { exec > "ergebnisse/$1.txt"; echo "# $2"; echo "# Lauf: $(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo; }

# Testschlüssel (selbstsigniert, nicht qualifiziert). Privater Schlüssel bleibt in out/ (nicht im Repo).
if [ ! -f out/keys/signer.p12 ]; then
  openssl req -x509 -newkey rsa:3072 -nodes -keyout out/keys/signer.key -out out/keys/signer.pem -days 3650 \
    -subj "/C=AT/O=hpro Prototyp/CN=Testunterzeichner hpro" \
    -addext "keyUsage=critical,digitalSignature,nonRepudiation" -addext "basicConstraints=critical,CA:FALSE" 2>/dev/null
  openssl pkcs12 -export -inkey out/keys/signer.key -in out/keys/signer.pem -out out/keys/signer.p12 -passout pass:test -name signer
fi
cp out/keys/signer.pem "$C/signer.pem"

# Validierungsrichtlinien, abgeleitet aus der DSS-Standardrichtlinie:
#  hpro   = akzeptiert zusätzlich application/epub+zip als mimetype (Vorschlag eigene hpro-Richtlinie)
#  streng = abweichender mimetype ist FEHLER statt WARNUNG (Annahme für einen strengeren Prüfdienst)
python3 - <<'PY'
import zipfile
s = zipfile.ZipFile("dss/target/lib/dss-policy-jaxb-6.5.jar").read("policy/constraint.xml").decode()
alt = '<AcceptableMimeTypeFileContent Level="WARN">'
assert alt in s
open("out/policy-hpro.xml", "w").write(s.replace(alt, alt + "<Id>application/epub+zip</Id>"))
open("out/policy-streng.xml", "w").write(s.replace(alt, '<AcceptableMimeTypeFileContent Level="FAIL">'))
PY

exec 3>&1
# ------------------------------------------------------------------------------------------------
log 00-werkzeuge "Werkzeugversionen"
run "$JAVA" -version
run epubcheck --version
run tools/calibre/ebook-meta --version
run .venv/bin/python -c "import importlib.metadata as m; print('EbookLib', m.version('EbookLib'))"
run ls dss/target/lib/dss-asic-xades-6.5.jar dss/target/lib/dss-validation-6.5.jar
run openssl x509 -in "$C/signer.pem" -noout -subject -dates -ext keyUsage

log 01-basis "V0: unsignierter Basis-Container (mimetype application/epub+zip)"
run python3 build_container.py "$C/basis.epub" --manifest-out "$C/basis.manifest.json"
run python3 build_container.py out/tmp/basis-2.epub
run cmp "$C/basis.epub" out/tmp/basis-2.epub
run listing "$C/basis.epub"
run epubcheck "$C/basis.epub"
run dss_validate "$C/basis.epub"
run calibre_meta "$C/basis.epub"
run calibre_text "$C/basis.epub"
run reader "$C/basis.epub"

log 02-umschlag "V1: DSS signiert die EPUB-Datei als Ganzes (Standardverhalten)"
run dss_sign "$C/basis.epub" "$C/umschlag.asice" xades
run listing "$C/umschlag.asice"
run epubcheck "$C/umschlag.asice"
run epubcheck_kopie "$C/umschlag.asice"
run dss_validate "$C/umschlag.asice"

log 03-dss-mimeparam "V2a: DSS soll mimetype application/epub+zip selbst setzen (ASiCParameters.setMimeType)"
run unpack "$C/basis.epub" out/tmp/inhalt
run dss_sign_dir out/tmp/inhalt "$C/dss-mimeparam.asice" xades application/epub+zip
run listing "$C/dss-mimeparam.asice"
run epubcheck "$C/dss-mimeparam.asice"
run epubcheck_kopie "$C/dss-mimeparam.asice"
run dss_validate "$C/dss-mimeparam.asice"

log 04-asice-xades "V2: DSS baut ASiC-E/XAdES aus den entpackten EPUB-Dateien (mimetype asic-e)"
run dss_sign_dir out/tmp/inhalt "$C/asice-xades.asice" xades
run listing "$C/asice-xades.asice"
run epubcheck "$C/asice-xades.asice"
run epubcheck_kopie "$C/asice-xades.asice"
run dss_validate "$C/asice-xades.asice"
run calibre_text "$C/asice-xades.asice"
run reader "$C/asice-xades.asice"

log 05-hybrid "V3 (Kandidat): V2 mit mimetype application/epub+zip (mimetype ist nicht signiert)"
run zipedit set-mimetype "$C/asice-xades.asice" "$C/hybrid.epub" application/epub+zip
run listing "$C/hybrid.epub"
run epubcheck "$C/hybrid.epub"
run dss_validate "$C/hybrid.epub"
run dss_validate "$C/hybrid.epub" out/policy-hpro.xml
run dss_validate "$C/hybrid.epub" out/policy-streng.xml
run calibre_meta "$C/hybrid.epub"
run calibre_text "$C/hybrid.epub"
run reader "$C/hybrid.epub"

log 06-signatures-xml "V4/V5: Signaturdatei unter dem EPUB-Namen META-INF/signatures.xml"
run zipedit rename "$C/hybrid.epub" "$C/hybrid-sigxml-asicroot.epub" META-INF/signatures001.xml META-INF/signatures.xml
run epubcheck "$C/hybrid-sigxml-asicroot.epub"
run dss_validate "$C/hybrid-sigxml-asicroot.epub"
run zipedit ocf-root "$C/hybrid.epub" "$C/hybrid-sigxml-ocfroot.epub" META-INF/signatures001.xml META-INF/signatures.xml
run python3 -c "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read('META-INF/signatures.xml')[:260].decode())" "$C/hybrid-sigxml-ocfroot.epub"
run epubcheck "$C/hybrid-sigxml-ocfroot.epub"
run dss_validate "$C/hybrid-sigxml-ocfroot.epub"
run calibre_text "$C/hybrid-sigxml-ocfroot.epub"
run reader "$C/hybrid-sigxml-ocfroot.epub"

log 07-cades "V6: ASiC-E mit CAdES (META-INF/*.p7s + ASiCManifest)"
run dss_sign_dir out/tmp/inhalt "$C/asice-cades.asice" cades
run listing "$C/asice-cades.asice"
run epubcheck_kopie "$C/asice-cades.asice"
run dss_validate "$C/asice-cades.asice"
run zipedit set-mimetype "$C/asice-cades.asice" "$C/hybrid-cades.epub" application/epub+zip
run epubcheck "$C/hybrid-cades.epub"
run dss_validate "$C/hybrid-cades.epub"
run reader "$C/hybrid-cades.epub"

log 08-endung-mimetype "V7: Dateiendung (.epub/.hpro/.asice) und eigener mimetype"
cp "$C/hybrid.epub" "$C/hybrid.hpro"; cp "$C/hybrid.epub" "$C/hybrid.asice"
for f in hybrid.hpro hybrid.asice; do
  run epubcheck "$C/$f"
  run epubcheck_kopie "$C/$f"
  run dss_validate "$C/$f"
done
run zipedit set-mimetype "$C/hybrid.epub" "$C/hybrid-eigenmime.hpro" application/vnd.hpro+zip
run epubcheck_kopie "$C/hybrid-eigenmime.hpro"
run dss_validate "$C/hybrid-eigenmime.hpro"
run reader "$C/hybrid-eigenmime.hpro"

log 09-manipulation "V8: Inhalt nach dem Signieren geändert (1.200,00 -> 9.200,00)"
run zipedit replace "$C/hybrid.epub" "$C/hybrid-manipuliert.epub" content/index.xhtml "1.200,00 EUR</strong>" "9.200,00 EUR</strong>"
run epubcheck "$C/hybrid-manipuliert.epub"
run dss_validate "$C/hybrid-manipuliert.epub"
run calibre_text "$C/hybrid-manipuliert.epub"

log 10-nachtrag "V9: Datei nach dem Signieren ergänzt (Kommentar unter annotations/)"
run zipedit add "$C/hybrid.epub" "$C/hybrid-kommentar.epub" annotations/annotations.jsonld '{"@context":"http://www.w3.org/ns/anno.jsonld","type":"Annotation","body":{"type":"TextualBody","value":"Bitte Menge prüfen"},"target":{"source":"content/index.xhtml","selector":{"type":"TextQuoteSelector","exact":"12 Stück"}}}'
run epubcheck "$C/hybrid-kommentar.epub"
run dss_validate "$C/hybrid-kommentar.epub"

log 11-zweite-signatur "V10: zweite Signatur auf den Hybrid-Container (Gegenzeichnung), direkt und über den asic-e-Umweg"
run dss_sign "$C/hybrid.epub" "$C/hybrid-2sig-direkt.epub" xades
run listing "$C/hybrid-2sig-direkt.epub"
run epubcheck "$C/hybrid-2sig-direkt.epub"
run dss_validate "$C/hybrid-2sig-direkt.epub"
run calibre_text "$C/hybrid-2sig-direkt.epub"
run dss_sign "$C/asice-xades.asice" out/tmp/asice-2sig.asice xades
run listing out/tmp/asice-2sig.asice
run zipedit set-mimetype out/tmp/asice-2sig.asice "$C/hybrid-2sig.epub" application/epub+zip
run epubcheck "$C/hybrid-2sig.epub"
run dss_validate "$C/hybrid-2sig.epub"
run reader "$C/hybrid-2sig.epub"

log 12-zielformat "V11 (Zielformat): beide Signaturen in EINER META-INF/signatures.xml mit OCF-Wurzel"
run zipedit merge-ocf "$C/hybrid-2sig-direkt.epub" "$C/zielformat-2sig.epub"
run listing "$C/zielformat-2sig.epub"
run epubcheck "$C/zielformat-2sig.epub"
run dss_validate "$C/zielformat-2sig.epub"
run dss_validate "$C/zielformat-2sig.epub" out/policy-hpro.xml
run calibre_meta "$C/zielformat-2sig.epub"
run calibre_text "$C/zielformat-2sig.epub"
run reader "$C/zielformat-2sig.epub"

exec 1>&3
echo "Fertig. Protokolle:"; ls ergebnisse/*.txt
