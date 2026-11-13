"""Wake word: MIRA answers when addressed by name.

Speech-to-text often hears "Mira" as a similar word, so a few close variants
count too. After MIRA has spoken, a short follow-up window lets the driver
answer her without repeating the name, which keeps the conversation natural.
"""

import re

FOLLOW_UP_SECONDS = 8.0

_WAKE = re.compile(r"\b(?:(?:hey|hi|ok|okay|hello)[,\s]+)?(?:mira|meera|myra|mirah|miira|mera|mirror)\b[,.!?\s]*", re.IGNORECASE)


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
