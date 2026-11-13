import os

# Unit tests never touch the cloud: no database and no LLM/voice keys, so the
# in-memory repository and fakes are used. Real environment variables override
# backend/.env, and empty strings count as "not configured".
for name in ("DATABASE_URL", "GROQ_API_KEY", "OPENAI_API_KEY", "DEEPGRAM_API_KEY"):
    os.environ[name] = ""
