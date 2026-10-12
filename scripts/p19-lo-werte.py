"""
Gegenprobe P19: LibreOffice berechnet Tabellen neu und gibt jede Formelzelle mit exaktem Wert aus.

Aufruf mit dem Python, das LibreOffice mitbringt (pyuno):

    prototyp/tools/libreoffice/opt/libreoffice26.8/program/python scripts/p19-lo-werte.py OUT.json DATEI.fods [...]

Das Skript startet soffice ohne Oberfläche mit einer lokalen Pipe (kein Netzwerk, nur für die Dauer des
Laufs), lädt jede Datei, ruft calculateAll() auf (harte Neuberechnung aller Formeln, gespeicherte Werte
werden nicht übernommen) und schreibt je Formelzelle: Tabelle, Adresse, Formel, Ergebnisart, Wert als
repr() des binary64, Text und Fehlercode. Danach wird soffice beendet.
"""
import json
import os
import subprocess
import sys
import time

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.table.CellContentType import FORMULA

PROGRAM = os.path.dirname(os.path.realpath(sys.executable))
PROFILE = os.path.realpath(os.path.join(os.path.dirname(__file__), '..', 'prototyp', 'out', 'p19', 'lo-profile'))
PIPE = 'hpro_p19_%d' % os.getpid()

# Fehlercodes von LibreOffice (sc/inc/errorcodes.hxx) und ihre Namen in OpenFormula
ERRORS = {503: '#NUM!', 519: '#VALUE!', 524: '#REF!', 525: '#NAME?', 532: '#DIV/0!', 32767: '#N/A', 522: 'Err:522', 502: 'Err:502', 504: 'Err:504'}


def prop(name, value):
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def col_name(i):
    s = ''
    n = i + 1
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def main():
    out_file, files = sys.argv[1], sys.argv[2:]
    env = dict(os.environ, SAL_USE_VCLPLUGIN='svp')
    proc = subprocess.Popen([os.path.join(PROGRAM, 'soffice.bin'), '--headless', '--norestore', '--nologo', '--invisible',
                             '-env:UserInstallation=file://' + PROFILE, '--accept=pipe,name=%s;urp;' % PIPE],
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
    ctx = None
    for _ in range(120):
        try:
            ctx = resolver.resolve('uno:pipe,name=%s;urp;StarOffice.ComponentContext' % PIPE)
            break
        except Exception:
            time.sleep(0.5)
    if ctx is None:
        proc.kill()
        raise SystemExit('soffice nicht erreichbar')
    smgr = ctx.ServiceManager
    desktop = smgr.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    provider = smgr.createInstanceWithContext('com.sun.star.configuration.ConfigurationProvider', ctx)
    about = provider.createInstanceWithArguments('com.sun.star.configuration.ConfigurationAccess', (prop('nodepath', '/org.openoffice.Setup/Product'),))
    result = {'office': '%s %s' % (about.getByName('ooName'), about.getByName('ooSetupVersionAboutBox')), 'files': {}}
    try:
        for f in files:
            doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.realpath(f)), '_blank', 0, (prop('Hidden', True),))
            t0 = time.perf_counter()
            doc.calculateAll()
            ms = (time.perf_counter() - t0) * 1000
            cells = []
            sheets = doc.Sheets
            for si in range(sheets.Count):
                sheet = sheets.getByIndex(si)
                cursor = sheet.createCursor()
                cursor.gotoEndOfUsedArea(False)
                addr = cursor.RangeAddress
                for r in range(addr.EndRow + 1):
                    for c in range(addr.EndColumn + 1):
                        cell = sheet.getCellByPosition(c, r)
                        if cell.Type != FORMULA:
                            continue
                        err = cell.getError()
                        kind = cell.FormulaResultType2  # 1 VALUE, 2 STRING, 4 ERROR
                        entry = {'sheet': sheet.Name, 'address': '%s%d' % (col_name(c), r + 1), 'formula': cell.getFormula(),
                                 'kind': {1: 'value', 2: 'string', 4: 'error'}.get(kind, str(kind)), 'text': cell.getString()}
                        if err:
                            entry['error'] = err
                            entry['errorName'] = ERRORS.get(err, 'Err:%d' % err)
                        elif kind == 2:
                            entry['string'] = cell.getString()
                        else:
                            entry['value'] = repr(cell.getValue())
                        cells.append(entry)
            result['files'][os.path.basename(f)] = {'calculateAllMs': round(ms, 1), 'cells': cells}
            doc.close(True)
    finally:
        try:
            desktop.terminate()
        except Exception:
            pass
        try:
            proc.wait(timeout=30)
        except Exception:
            proc.kill()
    with open(out_file, 'w', encoding='utf-8') as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    print('%s: %d Dateien, %s' % (out_file, len(files), result['office']))


if __name__ == '__main__':
    main()
