# Deployment

| Part | Host | URL |
|---|---|---|
| Frontend (Next.js) | Vercel project `mira-assistant`, root `frontend/` | https://mira-assistant-taupe.vercel.app |
| Backend (FastAPI) | Render web service `mira-backend` (free, Frankfurt), root `backend/` | https://mira-backend-hd83.onrender.com |
| Database | Supabase cloud (eu-north-1) | — |

Both deploy from the **`dev`** branch (Render auto-deploys on push; Vercel builds `dev` as production
for now). Switch both to `main` once the user has reviewed and merged a release.

## Render
- Build: `pip install uv==0.13.6 && uv sync --frozen --no-dev`
- Start: `uv run --no-sync uvicorn mira_backend.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`
- Env: `GROQ_API_KEY`, `GROQ_MODELS`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DEEPGRAM_API_KEY`,
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `PYTHON_VERSION=3.12.8`, `FRONTEND_ORIGINS`.
  CORS also allows `https://mira*.vercel.app` (see `core/config.py`).
- Free tier sleeps after ~15 min idle: the first request after a pause takes ~30–50 s.

## Vercel
- Framework Next.js, root directory `frontend`.
- Env (public by design): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Database migrations
From `backend/`: `uv run python scripts/migrate.py` (idempotent; applies `supabase/migrations` and the seed).

## Resetting the demo

Visitors teach MIRA new preferences and memories. To restore the two demo drivers to their
seeded state: from `backend/`, `uv run python scripts/reset_demo.py`.
