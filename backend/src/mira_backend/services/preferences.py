"""Validation for stored vehicle preferences (shared by the agent and the API)."""

import re
from typing import Any

PREFERENCE_KEYS = ["temperature_c", "seat_heating", "fan_speed", "ambient_color", "ambient_brightness", "driving_mode", "music_volume"]
DRIVING_MODES = ("eco", "comfort", "sport", "sport_plus")


def validate_preference(key: str, value: Any) -> Any:
    """Returns the normalised value, or raises ValueError with a readable reason."""
    if key not in PREFERENCE_KEYS:
        raise ValueError(f"key must be one of {', '.join(PREFERENCE_KEYS)}")
    text = str(value).strip()
    try:
        if key == "temperature_c":
            parsed: Any = round(float(text) * 2) / 2
            ok = 16 <= parsed <= 30
        elif key in ("seat_heating", "fan_speed", "ambient_brightness", "music_volume"):
            parsed = int(float(text))
            ok = 0 <= parsed <= {"seat_heating": 3, "fan_speed": 7}.get(key, 100)
        elif key == "ambient_color":
            parsed, ok = text.upper(), bool(re.fullmatch(r"#[0-9A-Fa-f]{6}", text))
        else:
            parsed, ok = text, text in DRIVING_MODES
    except ValueError:
        ok = False
    if not ok:
        raise ValueError(f"{value!r} is not a valid {key}")
    return parsed
