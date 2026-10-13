"""Command line of the service.

  python -m hpro_dienst status
  python -m hpro_dienst serve [--host 127.0.0.1] [--port 8790]        (--port 0: free port)
  python -m hpro_dienst export <ein.hpro> <aus.pdf> [--conformance PDF/A-2a,PDF/UA-1] [--rendition ID]
                               [--page-size A4] [--embed-container] [--bericht bericht.json] [--html druck.html]
  python -m hpro_dienst import <ein.pdf> <aus.json> [--ocr auto|force|off] [--languages de,en]
  python -m hpro_dienst ocr <ein.pdf> <aus.pdf> [--languages de] [--mode auto|force] [--dpi 300] [--bericht b.json]

Exit codes: 0 done (export: every requested level passed veraPDF), 1 done with a failed
conformance check, 2 input or usage error.
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hpro_dienst")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    p = sub.add_parser("serve")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8790)
    p = sub.add_parser("export")
    p.add_argument("source")
    p.add_argument("target")
    p.add_argument("--conformance", default="PDF/A-2a,PDF/UA-1")
    p.add_argument("--rendition")
    p.add_argument("--page-size", default="A4")
    p.add_argument("--embed-container", action="store_true")
    p.add_argument("--bericht")
    p.add_argument("--html")
    p = sub.add_parser("import")
    p.add_argument("source")
    p.add_argument("target")
    p.add_argument("--ocr", default="auto")
    p.add_argument("--languages", default="")
    p = sub.add_parser("ocr")
    p.add_argument("source")
    p.add_argument("target")
    p.add_argument("--languages", default="de")
    p.add_argument("--mode", default="auto")
    p.add_argument("--dpi", type=int, default=300)
    p.add_argument("--bericht")
    args = parser.parse_args(argv)

    if args.command == "status":
        from .server import status

        print(json.dumps(status(), ensure_ascii=False, indent=2))
        return 0
    if args.command == "serve":
        from .server import serve

        server = serve(args.host, args.port)
        host, port = server.server_address[:2]
        print(f"hpro-dienst bereit auf http://{host}:{port}", flush=True)
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
            print("hpro-dienst beendet", flush=True)
        return 0

    source = Path(args.source).read_bytes()
    try:
        if args.command == "export":
            from . import export

            levels = [c.strip() for c in args.conformance.split(",") if c.strip()]
            result = export.export(source, levels, page_size=args.page_size, embed_container=args.embed_container, rendition=args.rendition, file_name=Path(args.source).name)
            Path(args.target).write_bytes(result.pdf)
            report = result.to_json()
            if args.bericht:
                Path(args.bericht).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
            if args.html:
                Path(args.html).write_text(result.html, "utf-8")
            print(f"{args.target}: {len(result.pdf)} Bytes, {result.pages} Seiten, WeasyPrint {result.engine['version']}, Variante {result.variant}")
            for c in result.checks:
                print(f"  {c.conformance}: {'bestanden' if c.passed else 'NICHT bestanden'} ({c.checker}, Regeln verletzt {c.failed_rules}, Prüfungen fehlgeschlagen {c.failed_checks})")
                for f in c.failures:
                    print(f"    {f}")
            for o in result.omitted:
                print(f"  ausgelassen: {o['target']} – {o['notice']}")
            for item in result.live:
                print(f"  lebendig: {item.kind} {item.address} ({'Standbild' if item.still else 'Beschreibung'})")
            for w in result.warnings:
                print(f"  Hinweis: {w}")
            return 0 if all(c.passed for c in result.checks) else 1
        if args.command == "import":
            from . import pdfimport

            result = pdfimport.import_pdf(source, Path(args.source).name, args.ocr, [x for x in args.languages.split(",") if x] or None)
            Path(args.target).write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", "utf-8")
            counts: dict[str, int] = {}
            for b in result["blocks"]:
                counts[b["type"]] = counts.get(b["type"], 0) + 1
            print(f"{args.target}: Docling {result['engine']['version']}, {result['pdf']['pages']} Seiten, {result['seconds']} s, Blöcke {counts}")
            for w in result["warnings"]:
                print(f"  Warnung {w['code']}: {w['message']}")
            return 0
        if args.command == "ocr":
            from . import ocr

            result = ocr.searchable_pdf(source, [x for x in args.languages.split(",") if x], args.mode, args.dpi)
            Path(args.target).write_bytes(result.pdf)
            report = result.to_json()
            if args.bericht:
                Path(args.bericht).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
            print(f"{args.target}: Tesseract {result.engine['version']} ({result.languages}), {report['ocrPages']} von {len(result.pages)} Seiten erkannt, {report['words']} Wörter, mittlere Konfidenz {report['meanConfidence']}")
            for page in result.pages:
                print(f"  Seite {page.page}: {page.reason}, {page.words} Wörter, Konfidenz {page.mean_confidence}, {page.seconds:.1f} s")
            return 0
    except (ValueError, FileNotFoundError) as err:
        print(f"hpro_dienst: {err}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    sys.exit(main())
