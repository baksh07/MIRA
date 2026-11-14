"""Wake word: MIRA answers when addressed by name.

Speech-to-text often hears "Mira" as a similar word, so a few close variants
count too. After MIRA has spoken, a short follow-up window lets the driver
answer her without repeating the name, which keeps the conversation natural.
"""

import re

FOLLOW_UP_SECONDS = 12.0

_WAKE = re.compile(r"\b(?:(?:hey|hi|ok|okay|hello)[,\s]+)?(?:mira|meera|myra|mirah|miira|mera|mirror|maira|mayra|mirra|amira|miera|mirage)\b[,.!?\s]*", re.IGNORECASE)


def split_wake(text: str) -> tuple[bool, str]:
    """Returns (addressed, request): whether MIRA was named, and the words after her name.

    "Hey Mira, I'm cold" → (True, "I'm cold"); "Mira?" → (True, "");
    "turn it up" → (False, "turn it up").
    """
    match = _WAKE.search(text)
    if not match:
        return False, text.strip()
    before = text[: match.start()].strip(" ,.")
    after = text[match.end() :].strip()
    return True, after or before


# One-word answers that are real replies, not noise.
_SHORT_REPLIES = {"yes", "yeah", "yep", "no", "nope", "ok", "okay", "sure", "stop", "wait", "thanks", "please", "cancel"}


def is_speech(text: str) -> bool:
    """Strict check that a transcript is the driver talking, not noise.

    Background noise and coughs usually come through as nothing, one stray word
    or filler ("uh", "hmm"); two or more words, a known short reply, or MIRA's
    name count as speech.
    """
    words = [w for w in "".join(c if c.isalpha() or c.isspace() or c == "'" else " " for c in text.lower()).split()]
    words = [w for w in words if w not in {"uh", "um", "hmm", "mm", "ah", "oh", "er", "huh"}]
    if len(words) >= 2:
        return True
    return bool(words) and (words[0] in _SHORT_REPLIES or split_wake(words[0])[0])


# Words that mean the driver hasn't finished their thought yet.
_CONTINUES = {
    "and", "but", "or", "so", "because", "like", "when", "if", "then", "with", "to", "the", "a", "my",
    "i", "i'm", "um", "uh", "also", "maybe", "which", "that", "for", "of", "at", "in",
}


def turn_gap(text: str) -> float:
    """How long to wait for more speech before answering (smart end-of-turn).

    A finished sentence gets a fast answer; a thought that trails off (comma,
    connective word, no punctuation) gets time to continue.
    """
    stripped = text.strip()
    if not stripped:
        return 0.8
    last = stripped.rstrip(".,!?;:").split()[-1].lower() if stripped.rstrip(".,!?;:").split() else ""
    if stripped[-1] in ",;:-" or last in _CONTINUES:
        return 1.8
    if stripped[-1] in ".?!":
        return 0.35
    return 0.8
