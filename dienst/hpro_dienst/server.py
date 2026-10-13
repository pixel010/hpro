"""HTTP interface of the service (standard library only; started on demand, never as a daemon).

    python -m hpro_dienst serve [--host 127.0.0.1] [--port 8790]

Endpoints (request body = the file, options as query parameters, answers as JSON):

  GET  /v1/status                      engines, versions, languages, conformance levels
  POST /v1/export?conformance=PDF/A-2a,PDF/UA-1&pageSize=A4&embedContainer=0&rendition=<id>
                                       body: hpro container → {pdf (base64), checks, engine, …}
  POST /v1/import?ocr=auto&languages=de,en&fileName=x.pdf
                                       body: PDF → {blocks, warnings, engine, …}
  POST /v1/ocr/pdf?languages=de&mode=auto&dpi=300
                                       body: PDF → {pdf (base64, searchable), pages, …}
  POST /v1/ocr/image?languages=de      body: PNG/JPEG/TIFF → {text, lines, meanConfidence, engine}

The service keeps nothing: request bodies live in memory and temporary directories that are
removed after the answer. It binds to 127.0.0.1 by default; who exposes it further decides
about transport security and access control (docs/06, 1.1 rule 2: data leaves the device).
Requests are processed one at a time, the conversions use all the CPU they get.
"""

from __future__ import annotations

import base64
import json
import threading
import time
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from . import NAME, VERSION

MAX_BODY = 200 * 1024 * 1024
_WORK = threading.Lock()


def status() -> dict:
    from importlib.metadata import version as pv

    from . import export, ocr, verapdf

    out = {"name": NAME, "version": VERSION, "conformance": list(export.SUPPORTED), "pageSizes": list(export.PAGE)}
    engines = {"weasyprint": pv("weasyprint"), "docling": pv("docling")}
    try:
        engines["tesseract"] = ocr.version()
        out["ocrLanguages"] = ocr.supported_languages()
    except Exception as err:  # noqa: BLE001
        engines["tesseract"] = f"nicht verfügbar: {err}"
    try:
        engines["verapdf"] = verapdf.version()
    except Exception as err:  # noqa: BLE001
        engines["verapdf"] = f"nicht verfügbar: {err}"
    out["engines"] = engines
    return out


def _list(value: str | None) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def handle(path: str, query: dict[str, str], body: bytes) -> dict:
    from . import export, ocr, pdfimport

    if path == "/v1/export":
        result = export.export(
            body,
            _list(query.get("conformance")),
            page_size=query.get("pageSize", "A4"),
            embed_container=query.get("embedContainer") in ("1", "true"),
            rendition=query.get("rendition") or None,
            file_name=query.get("fileName", "dokument.hpro"),
        )
        return {"pdf": base64.b64encode(result.pdf).decode(), **result.to_json(with_report=query.get("reports") in ("1", "true"))}
    if path == "/v1/import":
        return pdfimport.import_pdf(body, query.get("fileName", "dokument.pdf"), query.get("ocr", "auto"), _list(query.get("languages")) or None, query.get("tables", "1") not in ("0", "false"))
    if path == "/v1/ocr/pdf":
        result = ocr.searchable_pdf(body, _list(query.get("languages")) or ["de"], query.get("mode", "auto"), int(query.get("dpi", "300")))
        return {"pdf": base64.b64encode(result.pdf).decode(), **result.to_json()}
    if path == "/v1/ocr/image":
        return ocr.recognize_image(body, _list(query.get("languages")) or ["de"], int(query["dpi"]) if query.get("dpi") else None)
    raise LookupError(path)


class Handler(BaseHTTPRequestHandler):
    server_version = f"{NAME}/{VERSION}"

    def _send(self, code: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # noqa: D102 - keep request bodies and names out of logs
        self.server.log.append(f"{time.strftime('%H:%M:%S')} {self.command} {urlsplit(self.path).path} {args[1] if len(args) > 1 else ''}")

    def do_GET(self):  # noqa: N802
        if urlsplit(self.path).path == "/v1/status":
            self._send(HTTPStatus.OK, status())
        else:
            self._send(HTTPStatus.NOT_FOUND, {"error": "unbekannter Pfad"})

    def do_POST(self):  # noqa: N802
        url = urlsplit(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            self._send(HTTPStatus.BAD_REQUEST, {"error": "leerer Inhalt"})
            return
        if length > MAX_BODY:
            self._send(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": f"größer als {MAX_BODY} Bytes"})
            return
        body = self.rfile.read(length)
        query = {k: v[-1] for k, v in parse_qs(url.query).items()}
        try:
            with _WORK:
                payload = handle(url.path, query, body)
            self._send(HTTPStatus.OK, payload)
        except LookupError:
            self._send(HTTPStatus.NOT_FOUND, {"error": "unbekannter Pfad"})
        except (ValueError, FileNotFoundError) as err:
            self._send(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": str(err), "type": type(err).__name__})
        except Exception as err:  # noqa: BLE001
            self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(err), "type": type(err).__name__, "trace": traceback.format_exc(limit=3)})


def serve(host: str = "127.0.0.1", port: int = 8790, ready=None) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), Handler)
    server.log = []
    if ready:
        ready(server)
    return server
