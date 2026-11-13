-- MIRA: driver profiles, preferences, memories and sessions.
--
-- Access model: Row Level Security is enabled on every table with NO policies
-- for the anon/authenticated roles, so the browser (publishable key) can read
-- or write nothing. Only the backend, connecting as the database owner or with
-- the secret key, reaches these tables, and it scopes every query to the
-- driver of the current session. One driver can never read another's data.

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,32}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  gender text not null check (gender in ('male', 'female')),
  avatar text not null default 'default',
  created_at timestamptz not null default now()
);

-- Structured, current vehicle preferences ("preference memory").
create table if not exists public.driver_preferences (
  driver_id uuid not null references public.drivers (id) on delete cascade,
  key text not null check (key in (
    'temperature_c', 'fan_speed', 'seat_heating', 'ambient_color',
    'ambient_brightness', 'driving_mode', 'music_volume'
  )),
  value jsonb not null,
  source text not null default 'seed' check (source in ('seed', 'agent', 'user')),
  updated_at timestamptz not null default now(),
  primary key (driver_id, key)
);

-- Free-text memories the agent decided were worth keeping.
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  category text not null check (category in ('profile', 'preference', 'episodic')),
  content text not null check (char_length(content) between 3 and 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists memories_driver_idx on public.memories (driver_id, created_at desc);

-- A visit: one browser session (its simulated car) driven by one driver.
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  summary text
);
create index if not exists sessions_driver_idx on public.sessions (driver_id, started_at desc);
create index if not exists sessions_vehicle_idx on public.sessions (vehicle_id, started_at desc);

-- The conversation of a session. Session context: it is NOT permanent memory.
create table if not exists public.session_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists session_messages_session_idx on public.session_messages (session_id, id);

alter table public.drivers enable row level security;
alter table public.driver_preferences enable row level security;
alter table public.memories enable row level security;
alter table public.sessions enable row level security;
alter table public.session_messages enable row level security;

-- Belt and braces: no table privileges for the browser-facing roles either.
revoke all on public.drivers, public.driver_preferences, public.memories,
  public.sessions, public.session_messages from anon, authenticated;
