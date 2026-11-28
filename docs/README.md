# Traitorous — Technical Documentation

Technical documentation for **Traitorous (1901 Tactical Engine & Multiplayer Chancellery)**, a server-authoritative, real-time tactical adjudicator and multiplayer web application for standard 1901 Diplomacy.

## Contents

- [Documentation Structure](#documentation-structure)
- [1. System Architecture & Cross-Cutting Design](#1-system-architecture--cross-cutting-design)
- [2. Features & User Workflows](#2-features--user-workflows)
- [3. Backend Engine (FastAPI & Python)](#3-backend-engine-fastapi--python)
- [4. Frontend Application (React 19, TypeScript, Vite)](#4-frontend-application-react-19-typescript-vite)
- [5. Guides & References](#5-guides--references)
- [Technology Stack Summary](#technology-stack-summary)

---

## Documentation Structure

```
docs/
├── README.md                              # Documentation index & architectural roadmap
├── architecture/
│   ├── system-overview.md                 # Full-stack architecture, design principles & state sync
│   ├── runtime-and-infrastructure.md      # Cloud Run scale-to-zero, single-instance model, lazy loading & clock/timeouts
│   ├── consistency-and-persistence.md     # L1 cache, write-through persistence, state_revision & atomic edits
│   ├── secrecy-and-authorization.md       # Order masking, WS auth handshake, press visibility & seat authorization
│   ├── identity-and-auth.md               # Supabase JWTs, guest/demo sign-in, profiles & private passcodes
│   ├── database.md                        # Supabase PostgreSQL schema (ER) & RLS boundaries
│   ├── service-interactions.md            # Frontend-to-services topology, WS/HTTP flows & SPA routing
│   └── data-models.md                     # Shared types, data contracts, schemas & serialization
├── features/
│   ├── lobby-browse-and-filtering.md      # Public browser, paging/filters, My Games, Featured Hero & MiniMap
│   ├── turn-clock.md                      # Movement voting, fixed phases, extensions, pause & deadline enforcement
│   ├── press-and-diplomacy.md             # Public/private threads, anonymous press, move suggestions & unread state
│   ├── sandbox-and-hypothetical-mode.md   # Solo sandboxes, private sbx_* branches, checkpoints, AI & exports
│   ├── admin-and-creator-controls.md      # Rollback, set-turn, atomic board-edit, audit log & authorization
│   ├── spectating.md                      # Read-only match viewing, claim-seat transition & public press
│   ├── game-over-and-history.md           # Victory, surrender, full-campaign history, past-turn view & ownership log
│   ├── campaign-stats-and-awards.md       # War Ledger metrics, SC timeline, diplomatic support matrix & awards
│   └── notifications-and-sound.md         # Tab title attention indicators & background-tab Web Audio chimes
├── backend/
│   ├── README.md                          # Backend overview, FastAPI setup & test harness
│   ├── api-reference.md                   # Complete REST & WebSocket API reference
│   ├── adjudicator.md                     # Adjudication engine, DATC algorithm & resolution mechanics
│   ├── validator.md                       # Pre-flight validator & tactical sanity check rules
│   └── map-data.md                        # Province topologies, adjacencies & split coasts
├── frontend/
│   ├── README.md                          # Frontend overview, view architecture & tooling
│   ├── state-management.md                # Server-authoritative sync, hypothetical isolation & WebSocket client
│   ├── map-renderer.md                    # Interactive EuropeMap SVG, layers, pan/zoom & click-to-order
│   ├── sidebar-and-controls.md            # Dual collapsible sidebars, order controls & SanityCheckModal
│   └── styling-and-themes.md              # Cartographic design system, CSS layers, power palettes & responsive rules
└── guides/
    ├── development.md                     # Setup, local workflows, testing, E2E runner & troubleshooting
    ├── google-cloud-deployment.md         # GCP Cloud Run + Supabase serverless deployment & Terraform IaC
    ├── observability-and-dashboards.md    # Cloud Monitoring dashboards, telemetry schemas & triage playbook
    └── rulebook-reference.md              # Standard 1901 Diplomacy rules mapped to engine behavior
```

---

## 1. System Architecture & Cross-Cutting Design

- [System Overview & Architecture](architecture/system-overview.md): High-level topology, architectural principles, state synchronization, and sandbox checkpointing.
- [Runtime & Infrastructure Model](architecture/runtime-and-infrastructure.md): Cloud Run scale-to-zero (`min_instance_count = 0`, `max_instance_count = 1`), lazy loading, request-driven phase clock, and WebSocket heartbeats/timeouts.
- [Consistency & Persistence](architecture/consistency-and-persistence.md): In-memory L1 store vs. Supabase JSONB, coalesced write-through saves, `state_revision` optimistic concurrency, and atomic board edits.
- [Secrecy & Authorization](architecture/secrecy-and-authorization.md): Order masking (`sanitize_game_state_for_viewer`), WebSocket `auth` handshake, press visibility, and per-seat mutation checks.
- [Identity & Authentication](architecture/identity-and-auth.md): Supabase JWT verification, guest vs. signed-in vs. local demo sign-in, profiles, creator identity, and private-match passcodes.
- [Database Setup & Row-Level Security](architecture/database.md): Mermaid ER diagram, JSONB storage design, and RLS security boundaries.
- [Service Interactions & Frontend Communication](architecture/service-interactions.md): Frontend-to-backend/Supabase topology and sequence diagrams for Auth, WebSockets, Lobby, Sandbox, and `/game/<id>` routing.
- [Data Models & Contracts](architecture/data-models.md): Authoritative schemas for `GameState`, `Order`, `Unit`, `ValidationIssue`, `PressMessage`, and `CampaignStatsResponse`.

## 2. Features & User Workflows

- [Lobby Browse, Filtering & Featured Games](features/lobby-browse-and-filtering.md): Public match browser, server-side filters/paging, My Games urgency sorting, Featured Hero, and MiniMap previews.
- [Turn Clock (Phase Timer)](features/turn-clock.md): Movement duration voting, fixed Retreats/Adjustments clocks, extensions, pause/ready-up, and request-driven expiry.
- [Press & Diplomacy](features/press-and-diplomacy.md): Public and private threads, signed vs. anonymous messages, move suggestions, unread tracking, and independent storage.
- [Sandbox & Hypothetical Mode](features/sandbox-and-hypothetical-mode.md): Solo sandboxes, ephemeral `sbx_*` multiplayer branches, checkpoints, and board-state export.
- [Admin & Creator Controls](features/admin-and-creator-controls.md): Turn rollback, set-turn, atomic `board-edit` batches, audit log, and player acknowledgements.
- [Spring 1901 Openings](features/openings.md): Book openings for the power being ordered on the first turn, with strengths, weaknesses and zine sources, a map preview, and one-click use as the player's orders.
- [Spectating](features/spectating.md): Read-only observation of public or passcode-unlocked matches, spectator bar, public press, and claiming an open seat.
- [Game Over & Turn History](features/game-over-and-history.md): 18-SC victory, surrender, full-campaign `GAME_HISTORY` inspection, past-turn arrows, and ownership-change log.
- [Campaign Statistics & War Ledger](features/campaign-stats-and-awards.md): On-demand War Ledger metrics, Supply Center timeline, diplomatic support matrix, and campaign awards.
- [Turn Notifications & Sound Effects](features/notifications-and-sound.md): Dynamic browser tab title attention indicators and background-tab Web Audio chimes.

## 3. Backend Engine (FastAPI & Python)

- [Backend Overview](backend/README.md): FastAPI service architecture, package boundaries, and pytest harness.
- [REST & WebSocket API Reference](backend/api-reference.md): Complete endpoint specifications, request/response contracts, and WebSocket protocol.
- [Adjudication Engine (`adjudicator/`)](backend/adjudicator.md): Iterative DATC-inspired resolver via `diplomacy.Game` for movement, retreats, adjustments, and simulation.
- [Order Validator & Sanity Checks (`validator/`)](backend/validator.md): Diagnostics engine detecting illegal moves, self-bounces, friendly fire, and broken convoys.
- [Map Data & Adjacencies (`topology/`)](backend/map-data.md): 76 European provinces (75 playable, 34 Supply Centers) and split-coast mechanics (`STP`, `SPA`, `BUL`).

## 4. Frontend Application (React 19, TypeScript, Vite)

- [Frontend Architecture](frontend/README.md): React 19 structure, feature directories, Vite proxy, and Vitest setup.
- [State Management & API Sync](frontend/state-management.md): Server-authoritative state synchronization, hypothetical isolation, `/game/<id>` routing, and WebSocket client.
- [Europe Map Renderer](frontend/map-renderer.md): High-performance SVG renderer, pan/zoom engine, interactive order arrows, and piece styles.
- [Dual Collapsible Sidebars & Tactical Controls](frontend/sidebar-and-controls.md): Layout principles, top bar display settings, order entry, press/standings panels, and `SanityCheckModal`.
- [Styling & Cartographic Theme](frontend/styling-and-themes.md): CSS cascade layers, CSS Modules, antique brass/parchment design system, power palettes, and compact phone layout.

## 5. Guides & References

- [Local Development & Testing Guide](guides/development.md): Quickstart commands, `pytest`, Vitest, E2E runner, playtest harness, and troubleshooting.
- [Google Cloud Serverless Deployment Blueprint](guides/google-cloud-deployment.md): Cloud Run scale-to-zero hosting, Terraform IaC, and GitHub Actions CI/CD.
- [Observability, Dashboards & Telemetry Maintenance Guide](guides/observability-and-dashboards.md): Live Cloud Monitoring dashboards, structured JSON telemetry schemas, baselines, and CLI triage recipes.
- [Diplomacy 1901 Rulebook Reference](guides/rulebook-reference.md): Exact correspondence between classic 1901 rules and engine behavior.

---

## Technology Stack Summary

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Backend API** | Python 3.10+, FastAPI, Pydantic v2, `diplomacy`, Uvicorn | Authoritative state, validation engine, and DATC adjudicator |
| **Frontend UI** | React 19, TypeScript, Vite, Lucide React | Cartographic SVG map, reactive sidebars, press, and sanity checks |
| **Auth & Database** | Supabase Auth, PostgreSQL (JSONB + RLS) | Multi-user JWT auth, profiles, durable game state, history, and press |
| **Deployment & Ops** | Docker, Google Cloud Run (`max-instances=1`), Terraform, Cloud Monitoring | Scale-to-zero single-container hosting and log-based observability |
| **Testing** | Pytest, Vitest + Testing Library, Playwright E2E runner | Unit/integration API tests, UI/CSS layer tests, and E2E verification |
