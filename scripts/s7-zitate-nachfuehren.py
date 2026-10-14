#!/usr/bin/env python3
"""Carry changed output lines from regenerated S7 evidence into the quoted blocks of Teil 4 and 5.

After scripts/belege-s7.sh has rewritten docs/belege/S7/NN-*.txt, hashes, sizes and namespace URIs in
the outputs can differ from the version the handbooks quote. This script compares each evidence file
with its committed version (git show REV:path), pairs replaced lines one to one where a diff hunk has
the same number of old and new lines, and replaces exactly those lines inside the fenced blocks marked
`beleg:<file>` of both handbooks. Anything it cannot pair is listed and left for manual editing;
scripts/check-handbuch.mjs remains the judge.

Usage: python3 scripts/s7-zitate-nachfuehren.py [REV]   (default REV: HEAD)
"""
import difflib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BELEGE = ROOT / "docs/belege/S7"
DOCS = [ROOT / "docs/spezifikation/04-umsetzer-handbuch.md", ROOT / "docs/spezifikation/05-autorenleitfaden.md"]
REV = sys.argv[1] if len(sys.argv) > 1 else "HEAD"


def old_version(path: Path) -> list[str] | None:
    rel = path.relative_to(ROOT).as_posix()
    r = subprocess.run(["git", "show", f"{REV}:{rel}"], cwd=ROOT, capture_output=True)
    return r.stdout.decode("utf-8").splitlines() if r.returncode == 0 else None


def mapping_for(name: str) -> tuple[dict[str, str], list[str]]:
    path = BELEGE / name
    old = old_version(path)
    new = path.read_text(encoding="utf-8").splitlines()
    if old is None:
        return {}, []
    pairs: dict[str, str] = {}
    unpaired: list[str] = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, old, new, autojunk=False).get_opcodes():
        if tag == "replace" and i2 - i1 == j2 - j1:
            for a, b in zip(old[i1:i2], new[j1:j2]):
                if pairs.get(a, b) != b:
                    unpaired.append(f"ambiguous: {a}")
                pairs[a] = b
        elif tag in ("replace", "delete"):
            unpaired.extend(old[i1:i2])
    return pairs, unpaired


def main() -> int:
    maps: dict[str, tuple[dict[str, str], list[str]]] = {}
    total = 0
    for doc in DOCS:
        lines = doc.read_text(encoding="utf-8").split("\n")
        beleg = None
        changed = 0
        for n, line in enumerate(lines):
            m = re.match(r"^```\S*\s+beleg:(\S+)", line)
            if m:
                beleg = m.group(1)
                if beleg not in maps:
                    maps[beleg] = mapping_for(beleg)
                continue
            if line.startswith("```"):
                beleg = None
                continue
            if beleg is None:
                continue
            pairs, unpaired = maps[beleg]
            if line in pairs and pairs[line] != line:
                lines[n] = pairs[line]
                changed += 1
            elif line in unpaired:
                print(f"{doc.name}:{n + 1}: not paired ({beleg}): {line[:100]}")
        doc.write_text("\n".join(lines), encoding="utf-8")
        print(f"{doc.name}: {changed} lines updated")
        total += changed
    return 0


if __name__ == "__main__":
    sys.exit(main())
