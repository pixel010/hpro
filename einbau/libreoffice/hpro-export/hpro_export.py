"""hpro export for LibreOffice (S8): File > "Als hpro exportieren…" for text documents and spreadsheets.

The extension does not convert anything itself. It stores a copy of the current document as ODF
(writer8 / calc8), calls the stable command line of hpro and shows what happened:

    hpro create <copy.odt|copy.ods> <target.hpro> --id <hpro:id> --json <report>
    hpro check <target.hpro> --format json

The command comes from the environment variable HPRO_CLI (e.g. "node /path/to/hpro.js") or from
`hpro` on the PATH (npm install -g @hpro/kern). The document keeps its identity across exports: on
the first export the extension adds the custom property "hpro:id" (urn:uuid:…) to the document
(File > Properties > Custom Properties), every later export uses it (HP-META-001).

Menu: service:org.hpro.export.ExportJob?export (file dialog, message box).
Without dialogs (automation, tests): service:org.hpro.export.ExportJob?export-to:<file URL of the
target>; the result is written next to the target as <target>.export.json.
"""
import datetime
import json
import os
import shlex
import shutil
import subprocess
import tempfile
import uuid

import uno
import unohelper
from com.sun.star.beans import PropertyValue
from com.sun.star.beans.PropertyAttribute import REMOVEABLE
from com.sun.star.task import XJobExecutor

IMPLEMENTATION = "org.hpro.export.ExportJob"
ID_PROPERTY = "hpro:id"
TIMEOUT_S = 600


def _prop(name, value):
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def hpro_command():
    """The hpro command line as argument list."""
    configured = os.environ.get("HPRO_CLI")
    if configured:
        return shlex.split(configured)
    found = shutil.which("hpro")
    if found:
        return [found]
    raise RuntimeError("hpro-Kommandozeile nicht gefunden: 'npm install -g @hpro/kern' ausführen oder HPRO_CLI setzen.")


def document_id(doc):
    """The hpro:id of the document; created (and kept in the document) on the first export."""
    udp = doc.DocumentProperties.UserDefinedProperties
    if udp.getPropertySetInfo().hasPropertyByName(ID_PROPERTY):
        value = str(udp.getPropertyValue(ID_PROPERTY)).strip()
        if value:
            return value, False
    value = "urn:uuid:%s" % uuid.uuid4()
    udp.addProperty(ID_PROPERTY, REMOVEABLE, value)
    return value, True


def _base_name(doc, ext):
    location = doc.getLocation() if doc.hasLocation() else ""
    if location:
        name = os.path.splitext(os.path.basename(uno.fileUrlToSystemPath(location)))[0]
    else:
        name = doc.DocumentProperties.Title or "dokument"
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in name).strip("._") or "dokument"
    return safe + ext


def export_document(doc, target):
    """Exports `doc` to the file `target`; returns a dict with exit codes, outputs and reports."""
    if doc.supportsService("com.sun.star.text.TextDocument"):
        filter_name, ext, kind = "writer8", ".odt", "Text"
    elif doc.supportsService("com.sun.star.sheet.SpreadsheetDocument"):
        filter_name, ext, kind = "calc8", ".ods", "Tabelle"
    else:
        raise RuntimeError("Nur Textdokumente (Writer) und Tabellen (Calc) lassen sich als hpro exportieren.")
    cmd = hpro_command()
    doc_id, created_id = document_id(doc)
    work = tempfile.mkdtemp(prefix="hpro-export-")
    try:
        source = os.path.join(work, _base_name(doc, ext))
        doc.storeToURL(uno.systemPathToFileUrl(source), (_prop("FilterName", filter_name),))
        report_file = os.path.join(work, "bericht.json")
        args = cmd + ["create", source, target, "--id", doc_id, "--json", report_file]
        # Time of the export in UTC: LibreOffice writes dc:date in local time without a zone.
        args += ["--modified", datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")]
        create = subprocess.run(args, capture_output=True, text=True, timeout=TIMEOUT_S)
        result = {
            "art": kind,
            "kennung": doc_id,
            "kennungNeu": created_id,
            "befehl": [os.path.basename(a) if i == 0 else a for i, a in enumerate(args)],
            "create": {"exit": create.returncode, "stdout": create.stdout, "stderr": create.stderr},
            "ziel": target,
        }
        if os.path.exists(report_file):
            with open(report_file, encoding="utf-8") as f:
                result["bericht"] = json.load(f)
        if create.returncode == 0:
            check = subprocess.run(cmd + ["check", target, "--format", "json"], capture_output=True, text=True, timeout=TIMEOUT_S)
            result["check"] = {"exit": check.returncode, "stderr": check.stderr}
            try:
                result["check"]["bericht"] = json.loads(check.stdout)
            except ValueError:
                result["check"]["stdout"] = check.stdout
        return result
    finally:
        shutil.rmtree(work, ignore_errors=True)


def summary(result):
    """Short German text for the message box."""
    lines = []
    if result["create"]["exit"] != 0:
        lines.append("Nicht exportiert (Rückgabe %d)." % result["create"]["exit"])
        lines.append((result["create"]["stderr"] or result["create"]["stdout"]).strip()[-800:])
        return "\n".join(lines)
    lines.append("Geschrieben: %s" % result["ziel"])
    report = result.get("bericht", {})
    counts = report.get("zusammenfassung")
    if counts:
        lines.append("Meldungen: %d Verlust, %d Ersatz, %d Hinweis" % (counts.get("verlust", 0), counts.get("ersatz", 0), counts.get("hinweis", 0)))
        for m in report.get("meldungen", [])[:8]:
            if m.get("severity") in ("verlust", "ersatz"):
                lines.append("  %s: %s" % (m["severity"].upper(), m["text"]))
    check = result.get("check", {})
    checked = check.get("bericht", {})
    verdicts = checked.get("levels", {}).get("verdict")
    findings = checked.get("summary")
    meaning = {0: "bestanden", 1: "NICHT bestanden", 2: "Prüfer lief nicht", 3: "keine Fehler; Regeln ohne Prüfmittel offen (unbestimmt)"}
    lines.append("Konformitätsprüfer: %s" % meaning.get(check.get("exit"), "Rückgabe %s" % check.get("exit")))
    if verdicts:
        lines.append("  Stufen: %s" % ", ".join("%s %s" % (k, v) for k, v in verdicts.items()))
    if findings:
        lines.append("  Befunde: %s" % ", ".join("%s %s" % (k, v) for k, v in findings.items()))
    if result.get("kennungNeu"):
        lines.append("Dem Dokument wurde die Eigenschaft hpro:id hinzugefügt (%s); bitte speichern." % result["kennung"])
    return "\n".join(lines)


class ExportJob(unohelper.Base, XJobExecutor):
    def __init__(self, ctx):
        self.ctx = ctx

    def _desktop(self):
        return self.ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", self.ctx)

    def _message(self, doc, title, text, error=False):
        from com.sun.star.awt.MessageBoxType import ERRORBOX, INFOBOX
        toolkit = self.ctx.ServiceManager.createInstanceWithContext("com.sun.star.awt.Toolkit", self.ctx)
        parent = doc.getCurrentController().getFrame().getContainerWindow() if doc else None
        box = toolkit.createMessageBox(parent, ERRORBOX if error else INFOBOX, 1, title, text)
        box.execute()

    def _ask_target(self, doc):
        picker = self.ctx.ServiceManager.createInstanceWithArgumentsAndContext("com.sun.star.ui.dialogs.FilePicker", (10,), self.ctx)
        picker.appendFilter("hpro-Dokument (*.hpro)", "*.hpro")
        picker.setTitle("Als hpro exportieren")
        picker.setDefaultName(os.path.splitext(_base_name(doc, ""))[0] + ".hpro")
        if picker.execute() != 1:
            return None
        return uno.fileUrlToSystemPath(picker.getSelectedFiles()[0])

    def trigger(self, args):
        doc = self._desktop().getCurrentComponent()
        if args.startswith("export-to:"):
            target = uno.fileUrlToSystemPath(args[len("export-to:"):])
            try:
                result = export_document(doc, target)
            except Exception as err:  # reported in the result file, never as a dialog
                result = {"fehler": "%s: %s" % (type(err).__name__, err)}
            with open(target + ".export.json", "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            return
        try:
            target = self._ask_target(doc)
            if not target:
                return
            result = export_document(doc, target)
            self._message(doc, "hpro-Export", summary(result), error=result["create"]["exit"] != 0)
        except Exception as err:
            self._message(doc, "hpro-Export", "%s: %s" % (type(err).__name__, err), error=True)


g_ImplementationHelper = unohelper.ImplementationHelper()
g_ImplementationHelper.addImplementation(ExportJob, IMPLEMENTATION, ("com.sun.star.task.Job",))
