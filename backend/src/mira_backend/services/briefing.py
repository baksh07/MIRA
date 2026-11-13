"""MIRA's spoken briefing when the driver starts talking to her.

Weather is real (Open-Meteo: free, no key, cached for ten minutes); traffic is
simulated from the local time of day so it matches the city the car drives in.
Every external call is best-effort: without weather the briefing still works.
"""

import logging
import time
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

logger = logging.getLogger(__name__)

CITY = "Munich"
LATITUDE, LONGITUDE = 48.137, 11.575
TIMEZONE = ZoneInfo("Europe/Berlin")
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
CACHE_SECONDS = 600

# WMO weather codes → words (https://open-meteo.com/en/docs)
_CONDITIONS = [
    ((0,), "clear skies"),
    ((1, 2), "a few clouds"),
    ((3,), "overcast"),
    ((45, 48), "fog"),
    ((51, 53, 55, 56, 57), "drizzle"),
    ((61, 63, 65, 66, 67, 80, 81, 82), "rain"),
    ((71, 73, 75, 77, 85, 86), "snow"),
    ((95, 96, 99), "thunderstorms"),
]


@dataclass(frozen=True)
class Weather:
    temperature_c: float
    condition: str


def describe_code(code: int) -> str:
    for codes, words in _CONDITIONS:
        if code in codes:
            return words
    return "mixed weather"


_cache: tuple[float, Weather] | None = None


async def current_weather() -> Weather | None:
    global _cache
    if _cache and time.monotonic() - _cache[0] < CACHE_SECONDS:
        return _cache[1]
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            response = await client.get(
                WEATHER_URL,
                params={"latitude": LATITUDE, "longitude": LONGITUDE, "current": "temperature_2m,weather_code"},
            )
            response.raise_for_status()
            now = response.json()["current"]
        weather = Weather(round(float(now["temperature_2m"])), describe_code(int(now["weather_code"])))
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as error:
        logger.info("weather unavailable: %s", type(error).__name__)
        return None
    _cache = (time.monotonic(), weather)
    return weather


def traffic(now: datetime) -> str:
    """Simulated traffic by time of day (weekday rush hours are busy)."""
    hour = now.hour + now.minute / 60
    weekday = now.weekday() < 5
    if weekday and (7 <= hour < 9.5 or 16 <= hour < 19):
        return "traffic is heavy with rush hour, so I'd allow a few extra minutes"
    if 9.5 <= hour < 16 or 19 <= hour < 22:
        return "traffic looks moderate"
    return "the roads are quiet, traffic is light"


def greeting_word(now: datetime) -> str:
    if 5 <= now.hour < 12:
        return "Good morning"
    if 12 <= now.hour < 18:
        return "Good afternoon"
    return "Good evening"


def briefing_text(name: str | None, now: datetime, weather: Weather | None) -> str:
    who = f", {name}" if name else ""
    parts = [f"{greeting_word(now)}{who}."]
    if weather:
        parts.append(f"It's {weather.temperature_c:.0f} degrees in {CITY} with {weather.condition}, and {traffic(now)}.")
    else:
        parts.append(f"In {CITY} {traffic(now)}.")
    parts.append("Just say MIRA whenever you need me.")
    return " ".join(parts)


async def briefing(name: str | None) -> str:
    return briefing_text(name, datetime.now(TIMEZONE), await current_weather())
