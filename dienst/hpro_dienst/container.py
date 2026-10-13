"""Reading an hpro container (OCF/EPUB ZIP with manifest.json) for export.

Only what the export needs: entries, manifest, reading order, locks. The authoritative checks
(hash manifest, signatures) stay in the core (@hpro/kern); the service reports integrity but
does not decide about trust.
"""

from __future__ import annotations

import hashlib
import base64
import io
import json
import posixpath
import zipfile
from dataclasses import dataclass, field

MAX_ENTRIES = 5000
MAX_TOTAL_BYTES = 512 * 1024 * 1024
EPUB_MIMETYPE = b"application/epub+zip"


class ContainerError(ValueError):
    """The input is not a readable hpro container."""


@dataclass
class Container:
    files: dict[str, bytes]
    manifest: dict
    integrity_failures: list[str] = field(default_factory=list)

    @classmethod
    def from_bytes(cls, data: bytes) -> "Container":
        try:
            archive = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as err:
            raise ContainerError(f"kein ZIP-Container: {err}") from err
        infos = archive.infolist()
        if len(infos) > MAX_ENTRIES:
            raise ContainerError(f"zu viele Einträge ({len(infos)} > {MAX_ENTRIES})")
        if sum(i.file_size for i in infos) > MAX_TOTAL_BYTES:
            raise ContainerError("entpackt größer als 512 MiB")
        files: dict[str, bytes] = {}
        for info in infos:
            name = info.filename
            if name.endswith("/"):
                continue
            if name.startswith("/") or ".." in name.split("/"):
                raise ContainerError(f"unzulässiger Pfad im Container: {name!r}")
            files[name] = archive.read(info)
        if files.get("mimetype", b"").strip() != EPUB_MIMETYPE:
            raise ContainerError("mimetype ist nicht application/epub+zip")
        if "manifest.json" not in files:
            raise ContainerError("manifest.json fehlt")
        try:
            manifest = json.loads(files["manifest.json"].decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as err:
            raise ContainerError(f"manifest.json nicht lesbar: {err}") from err
        container = cls(files=files, manifest=manifest)
        container.integrity_failures = container._check_integrity(manifest)
        return container

    def _check_integrity(self, manifest: dict) -> list[str]:
        failures = []
        for res in manifest.get("resources", []):
            url, integrity = res.get("url"), res.get("integrity", "")
            data = self.files.get(url)
            if data is None:
                failures.append(f"{url}: fehlt")
                continue
            if integrity.startswith("sha256-"):
                actual = "sha256-" + base64.b64encode(hashlib.sha256(data).digest()).decode()
                if actual != integrity:
                    failures.append(f"{url}: Hash stimmt nicht")
        return failures

    # ------------------------------------------------------------------ versions

    def version_manifest(self, rendition: str | None) -> dict:
        """Manifest of the main version or of a frozen rendition (HP-PROF-006)."""
        if rendition is None:
            return self.manifest
        for entry in self.manifest.get("renditions", []):
            if entry.get("id") == rendition:
                url = entry.get("url", "")
                if url not in self.files:
                    raise ContainerError(f"Fassungsmanifest {url} fehlt")
                manifest = json.loads(self.files[url].decode("utf-8"))
                self.integrity_failures = self._check_integrity(manifest)
                return manifest
        raise ContainerError(f"keine Fassung mit id {rendition!r} im Manifest")

    def reading_order(self, rendition: str | None = None) -> list[str]:
        order = [item["url"] for item in self.version_manifest(rendition).get("readingOrder", [])]
        missing = [p for p in order if p not in self.files]
        if not order or missing:
            raise ContainerError(f"Lesereihenfolge leer oder unvollständig: {missing}")
        return order

    def access(self, rendition: str | None = None) -> list[dict]:
        return list(self.version_manifest(rendition).get("access", []))

    def media_type(self, path: str) -> str | None:
        for manifest in [self.manifest, *[self._rendition_manifest(r) for r in self.manifest.get("renditions", [])]]:
            for res in manifest.get("resources", []):
                if res.get("url") == path:
                    return res.get("type")
        return None

    def _rendition_manifest(self, entry: dict) -> dict:
        try:
            return json.loads(self.files[entry["url"]].decode("utf-8"))
        except (KeyError, ValueError):
            return {}


def resolve(base_path: str, href: str) -> str:
    """Resolves a relative reference against the container path of the referring file."""
    target = href.split("#", 1)[0].split("?", 1)[0]
    if not target:
        return base_path
    return posixpath.normpath(posixpath.join(posixpath.dirname(base_path), target))
