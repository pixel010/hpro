"""Quality measures for text recognition against a known ground truth.

- CER (character error rate) = Levenshtein distance of the character sequences / length of the
  reference, after normalising whitespace (one space between words, no line structure) and NFC.
- WER (word error rate) = Levenshtein distance of the word sequences / number of reference words.
- Search hit rate = share of distinct reference words with at least four letters that a plain
  text search finds in the recognised text (what "durchsuchbar" means for a user).

Lower CER/WER is better; 0 is a perfect transcription. Reading order counts: a correct line in
the wrong place costs edits.
"""

from __future__ import annotations

import re
import unicodedata


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.replace("­", "").replace("ﬁ", "fi").replace("ﬂ", "fl")
    return re.sub(r"\s+", " ", text).strip()


def levenshtein(a, b) -> int:
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


def cer(reference: str, hypothesis: str) -> float:
    ref, hyp = normalise(reference), normalise(hypothesis)
    return levenshtein(ref, hyp) / max(1, len(ref))


def wer(reference: str, hypothesis: str) -> float:
    ref, hyp = normalise(reference).split(" "), normalise(hypothesis).split(" ")
    return levenshtein(ref, hyp) / max(1, len(ref))


def search_words(reference: str) -> list[str]:
    words = re.findall(r"[A-Za-zÄÖÜäöüß]{4,}", normalise(reference))
    return sorted(set(words))


def search_hit_rate(reference: str, searchable_text: str) -> tuple[float, list[str]]:
    """Share of distinct words (≥ 4 letters) found by case-sensitive substring search; misses."""
    haystack = normalise(searchable_text)
    words = search_words(reference)
    misses = [w for w in words if w not in haystack]
    return (len(words) - len(misses)) / max(1, len(words)), misses
