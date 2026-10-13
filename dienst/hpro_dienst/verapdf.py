"""PDF/A and PDF/UA checks with veraPDF (GPLv3+/MPLv2+), the open validator of the PDF Association.

No generator guarantees conformance (HP-PRINT-012), so every claimed level is checked here and
the result is passed on unchanged: a level without a passed check must not be claimed.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree

from .config import tools

#: hpro conformance names (kern/src/adapters/pdf.ts, PdfConformance) → veraPDF flavours.
FLAVOURS = {
    "PDF/A-2a": "2a",
    "PDF/A-2b": "2b",
    "PDF/A-2u": "2u",
    "PDF/A-3a": "3a",
    "PDF/A-3b": "3b",
    "PDF/A-3u": "3u",
    "PDF/UA-1": "ua1",
    "PDF/UA-2": "ua2",
}


@dataclass
class Check:
    conformance: str
    passed: bool
    checker: str
    profile: str = ""
    passed_rules: int = 0
    failed_rules: int = 0
    failed_checks: int = 0
    failures: list[str] = field(default_factory=list)
    report_xml: bytes = b""

    def to_json(self, with_report: bool = False) -> dict:
        out = {
            "conformance": self.conformance,
            "passed": self.passed,
            "checker": self.checker,
            "profile": self.profile,
            "passedRules": self.passed_rules,
            "failedRules": self.failed_rules,
            "failedChecks": self.failed_checks,
            "failures": self.failures,
        }
        if with_report:
            out["report"] = self.report_xml.decode("utf-8", "replace")
        return out


def version() -> str:
    t = tools()
    out = subprocess.run([str(t.verapdf), "--version"], capture_output=True, text=True, env=t.verapdf_env(), timeout=300)
    match = re.search(r"veraPDF (\S+)", out.stdout)
    return match.group(1) if match else "unbekannt"


def check(pdf: bytes, conformance: str) -> Check:
    """Runs veraPDF with the flavour of `conformance` and parses its XML report."""
    if conformance not in FLAVOURS:
        raise ValueError(f"keine veraPDF-Prüfung für {conformance}")
    t = tools()
    if not t.verapdf.exists():
        raise FileNotFoundError(f"veraPDF fehlt: {t.verapdf}")
    with tempfile.TemporaryDirectory(prefix="hpro-verapdf-") as tmp:
        path = Path(tmp) / "export.pdf"
        path.write_bytes(pdf)
        run = subprocess.run(
            [str(t.verapdf), "--flavour", FLAVOURS[conformance], "--format", "xml", "--maxfailuresdisplayed", "3", str(path)],
            capture_output=True,
            env=t.verapdf_env(),
            timeout=1800,
        )
    xml = run.stdout
    checker = f"veraPDF {version_from_report(xml)}"
    try:
        root = etree.fromstring(xml, parser=etree.XMLParser(resolve_entities=False, no_network=True))
    except etree.XMLSyntaxError as err:
        return Check(conformance, False, checker, failures=[f"veraPDF lieferte keinen Bericht (Exit {run.returncode}): {err}; {run.stderr.decode(errors='replace')[:500]}"])
    report = root.find(".//validationReport")
    if report is None:
        return Check(conformance, False, checker, failures=[f"veraPDF ohne validationReport (Exit {run.returncode})"], report_xml=xml)
    details = report.find("details")
    failures = []
    for rule in report.iter("rule"):
        if rule.get("status") != "failed":
            continue
        desc = (rule.findtext("description") or "").strip()
        failures.append(f"{rule.get('specification')} § {rule.get('clause')}-{rule.get('testNumber')} ({rule.get('failedChecks')}×): {desc}")
    return Check(
        conformance=conformance,
        passed=report.get("isCompliant") == "true",
        checker=checker,
        profile=report.get("profileName", ""),
        passed_rules=int(details.get("passedRules", 0)) if details is not None else 0,
        failed_rules=int(details.get("failedRules", 0)) if details is not None else 0,
        failed_checks=int(details.get("failedChecks", 0)) if details is not None else 0,
        failures=failures,
        report_xml=xml,
    )


def version_from_report(xml: bytes) -> str:
    match = re.search(rb'<releaseDetails id="core" version="([^"]+)"', xml)
    return match.group(1).decode() if match else "unbekannt"
