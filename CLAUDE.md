# MIRA — Memory-Informed Road Assistant

> **Project Engineering Handbook & AI Coding Instructions**

**Project:** MIRA (Memory-Informed Road Assistant)  
**Type:** Independent automotive AI portfolio project  
**Status:** Active Development  
**Repository:** https://github.com/baksh07/MIRA  
**Primary Branch:** `main`  
**Integration Branch:** `dev`  
**Current Feature Branch:** `feature/project-initialization`

---

# 1. Project Overview

## 1.1 What is MIRA?

MIRA (Memory-Informed Road Assistant) is an interactive, browser-based automotive voice assistant inspired by the BMW M4 experience.

The goal is to build a convincing virtual automotive environment where users can interact with a 3D vehicle, enter its virtual cockpit, communicate with an intelligent voice assistant, and experience personalized interactions powered by persistent driver memories.

MIRA should demonstrate how modern AI technologies can be combined to create an intelligent, context-aware automotive assistant.

It is an independent portfolio project, not official BMW software and not affiliated with, endorsed by, or sponsored by BMW AG.

All vehicle signals, vehicle operations, and driving interactions are simulated.

## 1.2 Core Vision

The application should feel like interacting with an intelligent vehicle rather than using a conventional chatbot.

A user should be able to:

1. Open MIRA in a browser.
2. Enter an immersive virtual garage.
3. View and interact with a detailed 3D automotive model.
4. Open vehicle doors and explore the vehicle.
5. Enter the virtual cockpit.
6. Select or identify a demo driver.
7. Communicate naturally with MIRA through voice.
8. Ask MIRA to modify simulated vehicle settings.
9. See those changes reflected in the virtual cockpit.
10. Have MIRA remember individual driver preferences.
11. Return later and experience personalized interactions.

## 1.3 Primary Product Goals

- Deliver an impressive 3D automotive experience.
- Demonstrate real-time voice AI integration.
- Demonstrate agent orchestration using LangGraph.
- Demonstrate persistent, user-specific AI memory.
- Demonstrate MCP-based tool integration.
- Implement clean separation between frontend, backend, agent, and vehicle simulation.
- Produce a polished and technically credible portfolio project.

---

# 2. Technology Stack

Use the following technology stack unless a change is discussed and approved.

## 2.1 Frontend

| Technology | Responsibility |
|---|---|
| Next.js | Application framework |
| React | Component architecture |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| Three.js | 3D rendering |
| React Three Fiber | React integration for Three.js |
| Drei | 3D helpers and utilities |
| Zustand | Frontend state management |

Additional frontend libraries may be introduced when justified.

Installed versions (verified 2026-11-12): Next.js 16.4.6 (Turbopack), React 19.3.0, Tailwind CSS 4.3.3 (via the `@tailwindcss/turbopack` loader in `next.config.ts`, no PostCSS config), TypeScript 5 strict, ESLint 9 flat config. This Next.js version differs from older training data — read `frontend/node_modules/next/dist/docs/` before using unfamiliar APIs (see `frontend/AGENTS.md`).

3D work: before writing any three.js / React Three Fiber / drei code, load the installed `threejs-*` skills (from CloudAI-X/threejs-skills) — at minimum `threejs-react-three-fiber`, `threejs-loaders` and `threejs-shaders`, plus others relevant to the task. They target three r186, R3F 9.8 and drei 10.7; pinned exactly as three 0.186.1, @react-three/fiber 9.8.2, @react-three/drei 10.7.9.

3D car model pipeline: the source download ("BMW M2 g87 [Free]" by Black Snow, CC BY 4.0) lives in `frontend/assets-src/m2-g87-source.glb` (git-ignored). `npm run build:model` (`frontend/scripts/build-car-model.mjs`, gltf-transform SDK) removes manufacturer branding, drops hidden drivetrain parts, converts textures to WebP and meshopt-compresses geometry into `frontend/public/models/coupe.glb` (~6 MB, ~251k triangles). Doors (`*_door_L/R`, `*_doorpanel_*`, `*_doorglass_*`), hood, trunk, the four wheels and the steering wheel stay separate nodes for Phase 3. Interior textures still contain small brand marks (dash screen, seat headrest, shifter, light internals) — clean them up when the cockpit is built. The attribution is required by the license and lives in the footer and README.

Frontend design tokens live in `frontend/src/app/globals.css` (`@theme`): `wall`, `floor`, `concrete`, `halogen`, `brushed`, `ambient`. `ambient` is the car's ambient-lighting colour and the only accent; it will later be driven by vehicle state. Typeface: Archivo (variable, `wdth` axis) — the MIRA wordmark uses `[font-stretch:125%]`.

## 2.2 Backend

| Technology | Responsibility |
|---|---|
| Python | Backend development |
| FastAPI | HTTP API and application backend |
| Pydantic | Validation and data models |
| WebSockets | Real-time communication where required |

Backend tooling: Python 3.12 managed with **uv** (`pyproject.toml` + `uv.lock`, no `requirements.txt`). Package `mira_backend` lives in `backend/src/`. Run `uv sync`, `uv run pytest`, `uv run uvicorn mira_backend.main:app --reload` from `backend/`.

## 2.3 Voice Infrastructure

| Technology | Responsibility |
|---|---|
| Pipecat | Real-time voice pipeline |
| Deepgram | Speech recognition |
| ElevenLabs | Speech generation |

Pipecat is responsible for audio processing and real-time voice transport.

LangGraph is responsible for agent reasoning and orchestration.

These responsibilities must remain separate.

## 2.4 AI Agent and Orchestration

| Technology | Responsibility |
|---|---|
| LangGraph | Agent orchestration and workflows |
| LangChain | Supporting AI integrations when useful |
| MCP | Standardized tool communication |
| FastMCP | Vehicle tool server implementation |

## 2.5 Database and Authentication

| Technology | Responsibility |
|---|---|
| Supabase | Managed backend services |
| PostgreSQL | Persistent relational storage |
| Supabase Auth | Authentication |
| pgvector | Optional semantic memory retrieval |

Start with structured PostgreSQL memories.

Introduce pgvector only when semantic retrieval provides a measurable benefit.

## 2.6 Development and Deployment

- Git and GitHub
- npm
- Python virtual environments
- Docker when needed
- Environment-based configuration
- Automated testing
- CI/CD when appropriate

---

# 3. High-Level System Architecture

The architecture must maintain clear ownership of responsibilities.

```text
                         USER
                          |
                          v
                 NEXT.JS FRONTEND
                          |
             +------------+------------+
             |                         |
             v                         v
        3D ENVIRONMENT             VOICE UI
             |                         |
             |                         v
             |                   PIPECAT
             |                         |
             |                  +------+------+
             |                  |             |
             |                  v             v
             |              DEEPGRAM      ELEVENLABS
             |                  |
             |                  v
             |             FASTAPI BACKEND
             |                  |
             |                  v
             |             LANGGRAPH
             |                  |
             |         +--------+--------+
             |         |                 |
             |         v                 v
             |     MEMORY SYSTEM     MCP CLIENT
             |         |                 |
             |         v                 v
             |      SUPABASE         FASTMCP SERVER
             |                           |
             |                           v
             |                   VEHICLE SIMULATOR
             |                           |
             |                           v
             +-------------------- AUTHORITATIVE
                                   VEHICLE STATE
```

This is a conceptual architecture. The exact communication mechanisms and execution flow must be implemented incrementally.

## 3.1 Architectural Ownership

### Frontend

Responsible for:

- Rendering the 3D vehicle.
- Displaying the garage and cockpit.
- Collecting user interactions.
- Displaying vehicle information.
- Displaying voice assistant status.
- Presenting simulated vehicle signals.
- Sending user requests to the backend.

The frontend must never directly mutate authoritative vehicle state.

### FastAPI Backend

Responsible for:

- API endpoints.
- Authentication integration.
- Session management.
- Backend coordination.
- Communication with agent services.
- Validating requests.
- Delivering updates to the frontend.

### Pipecat

Responsible for:

- Microphone input.
- Audio processing.
- Speech recognition integration.
- Voice pipeline management.
- Speech generation integration.
- Streaming voice responses.

Pipecat must not become the main business logic or agent orchestration layer.

### LangGraph

Responsible for:

- Understanding user requests.
- Managing agent workflows.
- Retrieving relevant memories.
- Deciding which tools to invoke.
- Managing contextual information.
- Handling multi-step interactions.
- Producing structured agent responses.

### MCP / FastMCP

Responsible for exposing simulated vehicle capabilities as tools.

Examples:

- Get vehicle status.
- Set cabin temperature.
- Activate seat heating.
- Change ambient lighting.
- Change driving mode.
- Retrieve fuel level.
- Retrieve estimated range.
- Control simulated music.
- Set navigation destination.

### Vehicle Simulator

The vehicle simulator is the authoritative source of virtual vehicle state.

It owns all simulated vehicle signals.

Neither the frontend nor LangGraph should independently maintain competing authoritative vehicle state.

### Supabase

Responsible for persistent user information:

- User profiles.
- Driver profiles.
- Preferences.
- Memories.
- Session history.
- Authentication-related data.
- Relevant application configuration.

---

# 4. Vehicle Simulation

MIRA will implement a simulated vehicle environment.

It does not communicate with an actual automobile.

## 4.1 Initial Vehicle Signals

The simulator should support:

| Category | Simulated signals |
|---|---|
| Climate | Cabin temperature |
| Fuel | Fuel level |
| Range | Estimated remaining range |
| Seating | Driver seat heating |
| Lighting | Ambient lighting color and brightness |
| Music | Playback state and volume |
| Navigation | Destination and route information |
| Driving | Driving mode |
| Windows | Window positions |
| Doors | Door open/closed state |

Additional signals can be introduced later.

## 4.2 Vehicle State Principles

The simulator must:

1. Own the authoritative state.
2. Validate all incoming commands.
3. Apply state changes centrally.
4. Return the updated state.
5. Support querying the current state.
6. Maintain consistent state across connected frontend clients where applicable.
7. Reject invalid operations.
8. Log important state changes.

Example conceptual vehicle state:

```json
{
  "climate": {
    "temperature": 22,
    "fan_speed": 3
  },
  "fuel": {
    "level": 65,
    "range_km": 420
  },
  "seat": {
    "driver_heating": 2
  },
  "ambient_lighting": {
    "color": "#0088FF",
    "brightness": 70
  },
  "driving_mode": "sport"
}
```

This is an illustrative schema, not a finalized implementation contract.

## 4.3 Important Rule

Every vehicle command must follow this conceptual flow:

```text
User request
    |
    v
LangGraph
    |
    v
MCP tool
    |
    v
Vehicle simulator
    |
    v
Validated state mutation
    |
    v
Updated vehicle state
    |
    v
Frontend synchronization
```

The frontend must not optimistically claim that a command succeeded before receiving confirmation from the backend.

---

# 5. Driver Identity and Profiles

MIRA should support multiple demo drivers.

Each driver must have an isolated profile and personal memory.

## 5.1 Driver Identification

The planned experience includes consent-based webcam face recognition.

Requirements:

- Face recognition must be opt-in.
- Explain why camera access is required.
- Process face recognition locally initially.
- Do not transmit raw webcam images to external services.
- Do not store biometric templates in the initial implementation.
- Provide a manual driver-selection fallback.
- Allow users to disable recognition.
- Avoid treating an uncertain recognition result as confirmed identity.

For the initial MVP, manual driver selection should be implemented first.

Face recognition can be introduced after the profile system works reliably.

## 5.2 Driver Profiles

Example profiles:

```text
Driver A
    preferred_temperature: 22°C
    preferred_driving_mode: comfort
    preferred_seat_heating: 1

Driver B
    preferred_temperature: 19°C
    preferred_driving_mode: sport
    preferred_seat_heating: 0
```

These are illustrative preferences.

Driver preferences must remain isolated.

One driver's memories must never be exposed to another driver.

---

# 6. Memory Architecture

Memory is one of MIRA's most important features.

The system should remember useful information about individual drivers and apply it appropriately in future interactions.

## 6.1 Memory Categories

Initially support:

### Profile Memory

Stable information about a driver.

Examples:

- Preferred name.
- Preferred language.
- Preferred units.

### Preference Memory

Vehicle-related preferences.

Examples:

- Preferred cabin temperature.
- Preferred ambient lighting.
- Preferred driving mode.
- Preferred music settings.

### Episodic Memory

Relevant previous interactions.

Examples:

- Previous climate adjustments.
- Recently used vehicle settings.
- Relevant previous requests.

### Session Context

Temporary information about the current interaction.

Examples:

- Current conversation.
- Current user request.
- Recent tool results.
- Current vehicle state snapshot.

Session context should not automatically become permanent memory.

## 6.2 Memory Lifecycle

```text
User interaction
       |
       v
Extract useful information
       |
       v
Evaluate memory candidate
       |
       v
Validate and normalize
       |
       v
Apply memory policy
       |
       v
Persist if appropriate
       |
       v
Retrieve in future sessions
```

Memory should be:

- Driver-specific.
- Structured where possible.
- Editable or deletable by the user.
- Relevant to the current task.
- Protected by access controls.

Do not save every conversation message as permanent memory.

## 6.3 Memory Retrieval

Start with PostgreSQL queries and structured metadata.

Introduce pgvector for semantic retrieval only when needed.

LangGraph should retrieve relevant memories before deciding whether a remembered preference applies.

Never assume that an old preference must override an explicit current instruction.

---

# 7. Frontend Experience and Design

The frontend should be immersive, minimal, modern, and automotive-focused.

## 7.1 Visual Direction

Design inspiration:

- BMW M4.
- Premium automotive showrooms.
- Modern digital cockpits.
- Minimalist luxury interfaces.
- Dark automotive environments.
- Subtle lighting and reflections.

Do not copy BMW's proprietary website, branding, or copyrighted assets.

Use appropriately licensed or original visual assets.

## 7.2 Virtual Garage

The virtual garage should provide:

- A detailed 3D vehicle model.
- Dark showroom environment.
- Ground reflections where feasible.
- Interactive camera controls.
- Smooth camera transitions.
- Responsive rendering.
- Vehicle interaction hotspots.

The experience should prioritize performance and visual quality.

## 7.3 Vehicle Interaction

Possible interactions:

- Open doors.
- Explore the exterior.
- Enter the vehicle.
- Transition into the cockpit.
- Interact with vehicle components.

The implementation must respect the actual capabilities of the selected 3D model.

## 7.4 Virtual Cockpit

The cockpit should contain:

- Dashboard.
- Instrument cluster.
- Temperature display.
- Fuel indicator.
- Range indicator.
- Seat heating indicators.
- Ambient lighting controls.
- Music information.
- Navigation information.
- Driving mode indicator.
- Voice assistant interface.

All displayed vehicle information must come from the backend vehicle state.

## 7.5 Custom Cursor

Implement a custom automotive-themed cursor.

A properly licensed BMW roundel asset may be used if its licensing permits the intended use.

Otherwise, create an original automotive-inspired cursor.

Never download or use unlicensed brand assets.

The cursor should:

- Have smooth movement.
- Respect interactive elements.
- Fall back to the normal cursor when necessary.
- Work on desktop devices.
- Avoid interfering with accessibility.

---

# 8. Repository Structure

Use a monorepo structure.

The intended structure is:

```text
MIRA/
│
├── frontend/
│   ├── public/
│   │   ├── models/
│   │   ├── textures/
│   │   ├── images/
│   │   └── audio/
│   │
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   │   ├── garage/
│   │   │   ├── vehicle/
│   │   │   ├── cockpit/
│   │   │   ├── dashboard/
│   │   │   └── assistant/
│   │   │
│   │   ├── features/
│   │   │   ├── driver/
│   │   │   ├── vehicle/
│   │   │   ├── voice/
│   │   │   └── memory/
│   │   │
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── stores/
│   │   ├── types/
│   │   └── styles/
│   │
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                  # uv project, src layout
│   ├── src/mira_backend/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── services/
│   │   └── main.py
│   │
│   ├── tests/
│   ├── pyproject.toml
│   ├── uv.lock
│   └── README.md
│
├── mcp-servers/
│   └── vehicle/
│       ├── tools/
│       ├── models/
│       ├── server.py
│       └── README.md
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── README.md
│
├── docs/
│   ├── architecture/
│   ├── decisions/
│   ├── api/
│   └── development/
│
├── tests/
│
├── .gitignore
├── .env.example
├── README.md
└── CLAUDE.md
```

This is the target structure, not a requirement to create all directories immediately.

Create directories only when implementation requires them.

---

# 9. Development Roadmap

Implement MIRA incrementally in the following phases.

## Phase 1 — Repository and Frontend Foundation

Goals:

- Initialize GitHub repository.
- Configure main, dev, and feature branches.
- Initialize Next.js.
- Configure TypeScript.
- Configure Tailwind CSS.
- Establish frontend conventions.
- Create initial application shell.
- Verify local development server.

Acceptance criteria:

- Next.js starts successfully.
- TypeScript compilation succeeds.
- ESLint succeeds.
- Application loads in the browser.
- Git structure is correct.

## Phase 2 — 3D Virtual Garage

Goals:

- Integrate Three.js.
- Integrate React Three Fiber.
- Integrate Drei.
- Import an appropriately licensed 3D vehicle model.
- Create showroom environment.
- Implement camera controls.
- Implement lighting and shadows.
- Add responsive layout.

Acceptance criteria:

- Vehicle renders correctly.
- Camera controls work.
- Application remains responsive.
- No major console errors.

## Phase 3 — Vehicle Interaction and Cockpit

Goals:

- Implement vehicle interaction points.
- Create door interaction where supported.
- Implement garage-to-cockpit transition.
- Build dashboard.
- Build instrument cluster.
- Build simulated vehicle displays.

Acceptance criteria:

- Users can explore the car.
- Cockpit transition works.
- Dashboard components render correctly.

## Phase 4 — Driver Profiles and Supabase

Goals:

- Configure Supabase.
- Create driver profiles.
- Implement authentication or demo-driver selection.
- Create preferences schema.
- Create session schema.
- Implement profile isolation.
- Add manual driver selection.

Acceptance criteria:

- Multiple demo drivers work.
- Preferences remain isolated.
- Sessions are persisted appropriately.
- Authorization is enforced.

## Phase 5 — Driver Recognition

Goals:

- Introduce consent-based webcam interaction.
- Evaluate local face recognition solutions.
- Implement enrollment flow.
- Implement confidence thresholds.
- Add manual fallback.
- Test uncertain recognition.

Acceptance criteria:

- Recognition is explicitly opt-in.
- Processing occurs locally initially.
- Manual fallback always works.
- No raw webcam data is sent to external services.

## Phase 6 — Vehicle Simulator and MCP

Goals:

- Build authoritative vehicle state.
- Define vehicle data models.
- Implement state validation.
- Build FastMCP server.
- Expose vehicle tools.
- Connect MCP client.
- Implement state synchronization.

Acceptance criteria:

- Vehicle tools work.
- Invalid commands are rejected.
- State changes are authoritative.
- Frontend reflects confirmed state updates.

## Phase 7 — Pipecat Voice Integration

Goals:

- Integrate Pipecat.
- Configure Deepgram.
- Configure ElevenLabs.
- Implement microphone capture.
- Implement speech recognition.
- Implement speech generation.
- Stream assistant responses.
- Handle interruptions and errors.

Acceptance criteria:

- User can speak to MIRA.
- MIRA understands requests.
- Responses are spoken naturally.
- Audio errors are handled gracefully.

## Phase 8 — LangGraph and Memory

Goals:

- Implement LangGraph agent.
- Define state schema.
- Implement intent processing.
- Integrate MCP tools.
- Implement memory retrieval.
- Implement memory extraction.
- Implement memory persistence.
- Implement driver-specific context.
- Implement memory policies.

Acceptance criteria:

- Agent can invoke vehicle tools.
- Agent retrieves relevant driver preferences.
- Driver memories remain isolated.
- Explicit user instructions take priority.
- Memory persistence works across sessions.

## Phase 9 — Integration and Quality

Goals:

- Integrate all subsystems.
- Test complete user journeys.
- Improve performance.
- Fix integration issues.
- Add error handling.
- Improve responsive design.
- Improve accessibility.
- Write documentation.

## Phase 10 — Deployment

Goals:

- Deploy frontend.
- Deploy backend.
- Configure Supabase production environment.
- Configure voice credentials securely.
- Configure CORS.
- Configure production URLs.
- Configure logging.
- Test complete deployed application.

Acceptance criteria:

- Public demonstration works.
- Secrets are protected.
- Voice interaction works.
- Vehicle simulation works.
- Driver personalization works.

---

# 10. Coding Standards

Claude Code must follow these conventions.

## 10.1 General Principles

- Write clean, readable, maintainable code.
- Prefer simple solutions over unnecessary abstractions.
- Use modular architecture.
- Avoid duplicated business logic.
- Use meaningful variable and function names.
- Keep functions focused.
- Add comments only when they provide meaningful context.
- Avoid speculative features.
- Avoid unnecessary dependencies.

## 10.2 TypeScript

- Use strict TypeScript.
- Avoid `any`.
- Define reusable interfaces and types.
- Use typed component properties.
- Separate API models from UI models.
- Avoid unnecessary type assertions.
- Keep components reasonably small.

## 10.3 React and Next.js

- Prefer Server Components by default.
- Use Client Components only when browser interaction or React client state is required.
- Avoid unnecessary client-side rendering.
- Keep 3D rendering isolated from unrelated application components.
- Use dynamic imports for heavy browser-only 3D modules when appropriate.
- Avoid unnecessary global state.

## 10.4 Python

- Use type hints.
- Use Pydantic for validation.
- Separate API routes, business logic, and data access.
- Use asynchronous operations where appropriate.
- Handle exceptions explicitly.
- Keep tool interfaces structured.

## 10.5 Testing

Every meaningful feature should include appropriate tests.

Frontend:

- Component tests where useful.
- Type checking.
- Linting.
- Browser-level testing for critical interactions.

Backend:

- Unit tests.
- API tests.
- Tool tests.
- State transition tests.

Agent:

- Tool selection tests.
- Memory retrieval tests.
- Memory isolation tests.
- Error handling tests.

### Frontend verification commands

Run from `frontend/`:

```bash
npx tsc --noEmit   # type check
npm run lint       # ESLint
npm run build      # production build
npm run dev        # dev server (http://localhost:3000)
```

### Backend verification commands

Run from `backend/`:

```bash
uv run pytest                                   # tests
uv run uvicorn mira_backend.main:app --reload   # API (http://127.0.0.1:8000)
```

---

# 11. Security and Privacy Requirements

Security is mandatory.

Never:

- Expose API keys in frontend code.
- Commit `.env` files.
- Store service-role credentials in browser-accessible code.
- Trust frontend-provided vehicle state.
- Allow one driver to access another driver's private memories.
- Send webcam images to external APIs without explicit authorization.
- Execute arbitrary code from user requests.
- Bypass authentication or authorization checks.

Always:

- Use environment variables.
- Validate backend inputs.
- Enforce authorization on the backend.
- Apply Supabase Row Level Security where appropriate.
- Keep secrets server-side.
- Validate MCP tool arguments.
- Log errors without exposing credentials.
- Protect personal data.
- Make camera permissions explicit.

Create `.env.example` containing placeholders only.

Example:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=

DATABASE_URL=
```

Only expose variables with the `NEXT_PUBLIC_` prefix when they are genuinely safe for browser access.

Never put private API keys behind a `NEXT_PUBLIC_` prefix.

Note: `frontend/.gitignore` ignores `.env*`, which would also ignore a `frontend/.env.example`. If one is added there, add a `!.env.example` exception.

---

# 12. Git Workflow

Use the following branch structure:

```text
main
  |
  └── dev
       |
       ├── feature/project-initialization
       ├── feature/3d-garage
       ├── feature/vehicle-interaction
       ├── feature/virtual-cockpit
       ├── feature/driver-profiles
       ├── feature/vehicle-simulator
       ├── feature/mcp-integration
       ├── feature/voice-pipeline
       └── feature/agent-memory
```

Rules:

1. Never implement experimental features directly on `main`.
2. Use feature branches for meaningful development tasks.
3. Merge completed features into `dev`.
4. Test integration on `dev`.
5. Merge stable releases into `main`.
6. Never force-push without explicit approval.
7. Never delete branches without explicit approval.
8. Never commit secrets.
9. Use meaningful commit messages.

Commit message examples:

```text
chore: initialize MIRA repository
feat: initialize Next.js frontend
feat: add virtual garage scene
feat: implement vehicle interaction
feat: add driver profiles
feat: implement vehicle MCP tools
feat: integrate Pipecat voice pipeline
feat: add LangGraph memory management
fix: resolve cockpit rendering issue
refactor: separate vehicle state management
docs: document system architecture
test: add vehicle simulator tests
```

Claude manages day-to-day git: pulling, creating feature branches, committing verified work, and pushing (always as `git push origin <branch>`).

Commits use the repository's configured git identity, so they are authored by the user. Commit messages and PR descriptions must not contain any Claude/Anthropic attribution (no `Co-Authored-By: Claude …` trailer, no "Generated with Claude Code" line). All work is credited to the user.

Claude still asks before force-pushing, deleting branches, rewriting history, or merging into `dev`/`main`.

---

# 13. Instructions for Claude Code

You are acting as a senior software engineer implementing MIRA.

Your responsibility is to help build a clean, reliable, maintainable application.

You must follow these instructions.

## 13.1 Before Starting Work

Always:

1. Inspect the existing repository.
2. Understand the current implementation.
3. Check the active Git branch.
4. Read relevant documentation.
5. Identify existing patterns.
6. Understand the requested feature.
7. Prepare an implementation plan for non-trivial tasks.

Never assume that a feature exists merely because it appears in this document.

Inspect the code before making changes.

## 13.2 Implementation Approach

Work incrementally.

For each feature:

1. Explain the proposed approach.
2. Identify the files that need modification.
3. Explain important architectural decisions.
4. Implement the smallest useful solution.
5. Run relevant tests.
6. Run linting and type checking where applicable.
7. Report changed files.
8. Report test results.
9. Identify known limitations.

Do not implement the entire project in one operation.

## 13.3 Permission Boundaries

Do not perform these actions without explicit user approval:

- Delete important files.
- Replace the entire application structure.
- Change the technology stack.
- Introduce major architectural changes.
- Install large numbers of unrelated dependencies.
- Execute destructive terminal commands.
- Modify Git history.
- Commit or push code.
- Merge branches.
- Modify production infrastructure.
- Change database schemas in production.

Review destructive or irreversible actions before execution.

## 13.4 Avoid Overengineering

MIRA is a portfolio MVP.

Prioritize:

- Working features.
- Clear architecture.
- Good user experience.
- Reliable integrations.
- Strong security.
- Maintainability.

Do not introduce microservices, message brokers, complex distributed systems, or unnecessary abstractions unless a concrete requirement justifies them.

Do not implement all roadmap phases simultaneously.

## 13.5 Documentation

Keep documentation updated when architecture or important implementation details change.

Document:

- Installation instructions.
- Environment variables.
- API contracts.
- Database schemas.
- Agent workflows.
- MCP tools.
- Important architectural decisions.
- Testing instructions.

## 13.6 Communication

When responding to the user:

- Explain what you changed.
- Explain why you changed it.
- Mention important trade-offs.
- List modified files.
- Report tests and their actual results.
- Mention anything that still needs manual verification.

Never claim a test passed if it was not executed successfully.

Never claim an integration works without testing it.

If requirements are ambiguous, ask before making significant architectural decisions.

---

# 14. Definition of Done

A feature is not complete merely because code has been generated.

A feature is considered complete when:

- Implementation is finished.
- Relevant tests pass.
- Type checking passes where applicable.
- Linting passes where applicable.
- No important console errors remain.
- Security requirements are satisfied.
- Documentation is updated when needed.
- User-facing behavior has been verified.

A working, tested feature is more valuable than a large amount of unfinished code.

---

# 15. Current Project Status

This section should be updated as development progresses.

## Completed

- GitHub repository created.
- Local Git repository initialized.
- Initial README created.
- Initial commit created.
- `main` branch pushed to GitHub.
- `dev` branch created and pushed.
- GitHub authentication switched to `baksh07`.
- `feature/project-initialization` created and pushed.
- Node.js v24.11.0 verified.
- npm v11.6.1 verified.
- Next.js project scaffolded in `frontend/` with `create-next-app` (2026-11-12).
- Verified 2026-11-12:
  - `npx tsc --noEmit` passes.
  - `npm run lint` passes.
  - `npm run build` succeeds (routes `/`, `/_not-found` prerendered static).
  - `next dev` serves `/` with HTTP 200.
  - Tailwind CSS v4 utilities are generated (checked in served CSS).

- `frontend/` scaffold committed and pushed on `feature/project-initialization` (2885c3c).
- Backend foundation started early on `feature/backend-foundation` (branched from `feature/project-initialization`): uv project, FastAPI app with `GET /health`, pytest tests.

- Phase 1 merged into `dev` (PRs #1 project initialization, #2 backend foundation, #3 app shell).
- Phase 2 (3D virtual garage) built on `feature/3d-garage` (2026-11-13): full-bleed R3F scene behind the page chrome (lazy-loaded, `ssr: false`, error boundary, loading progress), debranded M2 model on a reflective studio floor with fog, softbox environment reflections, contact shadow, overhead spotlight with switch-on flicker, orbit controls (no pan, limited polar/zoom, slow auto-rotate off under reduced motion), responsive framing. Verified 2026-11-13: `tsc`, lint, build pass; rendered with no console errors at 390×844, 1024×768, 1440×900, 1920×1080; drag-to-orbit works.

## Pending

- Open PR `feature/3d-garage` → `dev`.
- Phase 3: door hotspots and opening (hinge pivots computed from door bounds), garage-to-cockpit camera transition, cockpit/dashboard UI.

## Current Git Branch

```text
feature/3d-garage
```

## Next Immediate Milestone

Merge Phase 2 into `dev`, then start Phase 3 (vehicle interaction and cockpit) on `feature/vehicle-interaction`.

---

# 16. Long-Term Product Vision

MIRA should ultimately demonstrate the following complete experience:

```text
              USER ENTERS GARAGE
                       |
                       v
                3D VEHICLE DISPLAY
                       |
                       v
                ENTER THE VEHICLE
                       |
                       v
                DRIVER IDENTIFICATION
                       |
                       v
              LOAD DRIVER PREFERENCES
                       |
                       v
                 VIRTUAL COCKPIT
                       |
                       v
               START VOICE SESSION
                       |
                       v
                USER SPEAKS TO MIRA
                       |
                       v
                PIPECAT AUDIO PIPELINE
                       |
                       v
                 LANGGRAPH AGENT
                       |
              +--------+--------+
              |                 |
              v                 v
         MEMORY RETRIEVAL    MCP TOOLS
              |                 |
              v                 v
         DRIVER CONTEXT    VEHICLE SIMULATOR
              |                 |
              +--------+--------+
                       |
                       v
                RESPONSE GENERATION
                       |
                       v
                 SPOKEN RESPONSE
                       |
                       v
              UPDATED VIRTUAL COCKPIT
                       |
                       v
                SAVE RELEVANT MEMORY
```

The ultimate goal is to create a coherent, personalized automotive assistant that combines immersive 3D interaction, real-time voice AI, agent orchestration, tool execution, and persistent memory.

---

# Final Instruction

Build MIRA as a real software engineering project.

Do not optimize for the amount of code generated.

Optimize for a polished experience, clear architecture, reliable behavior, security, and demonstrable engineering quality.

**Understand first. Plan second. Implement incrementally. Test everything.**
