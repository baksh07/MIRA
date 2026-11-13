"""The language model chain: Groq models first (each has its own free quota),
OpenAI last. Any error, including a 429 rate limit, moves straight on to the
next model; nothing retries, so a limit costs milliseconds, not a timeout."""

import logging
from collections.abc import Sequence

from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI

from mira_backend.core.config import Settings

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def chat_models(settings: Settings) -> list[tuple[str, BaseChatModel]]:
    models: list[tuple[str, BaseChatModel]] = []
    if settings.groq_api_key:
        for name in settings.groq_model_list:
            models.append(
                (
                    f"groq:{name}",
                    ChatOpenAI(
                        model=name, api_key=settings.groq_api_key, base_url=GROQ_BASE_URL,
                        max_retries=0, timeout=20, temperature=0.3,
                    ),
                )
            )
    if settings.openai_api_key:
        models.append(
            (f"openai:{settings.openai_model}", ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key, max_retries=0, timeout=40))
        )
    return models


class ModelChain:
    """Calls each model in turn until one answers; remembers which one did."""

    def __init__(self, models: Sequence[tuple[str, BaseChatModel]], tools: Sequence[BaseTool]) -> None:
        if not models:
            raise RuntimeError("No language model configured (set GROQ_API_KEY and/or OPENAI_API_KEY)")
        self._bound: list[tuple[str, Runnable]] = [(name, model.bind_tools(list(tools))) for name, model in models]
        self.used: str | None = None

    async def ainvoke(self, messages: list) -> object:
        errors: list[str] = []
        for name, model in self._bound:
            try:
                result = await model.ainvoke(messages)
                self.used = name
                return result
            except Exception as error:  # noqa: BLE001 - any provider failure falls through to the next model
                logger.warning("model %s failed (%s), trying the next one", name, type(error).__name__)
                errors.append(f"{name}: {type(error).__name__}")
        raise RuntimeError("All language models failed: " + "; ".join(errors))
