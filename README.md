# FaceVec Attendance

> A distributed, event-driven face-recognition attendance system.

Live camera frames are matched against enrolled 512-dimensional face embeddings
using **pgvector** cosine similarity over an **HNSW** index, with CPU-bound
inference offloaded to an asynchronous Python microservice via **RabbitMQ**.

---

## Architecture

```
                 ┌─────────────────────┐
                 │   Next.js 15 (web)  │  Admin / professor dashboard
                 │   :3000             │  enrollment UI · live WS feed
                 └──────────┬──────────┘
                            │ HTTPS / WebSocket
                 ┌──────────▼──────────┐
                 │  Express Gateway    │  Zod validation · JWT/RBAC
                 │  (TypeScript) :8080 │  rate limit · circuit breaker
                 └───┬────────┬────────┘
        publish task │        │ outbox / queries
            ┌────────▼──┐  ┌──▼──────────────┐
            │ RabbitMQ  │  │ PostgreSQL 17   │  pgvector + HNSW
            │ :5672     │  │ + pgvector :5432│  transactional outbox
            └────┬──────┘  └──▲──────────────┘
        consume  │            │ store / query embeddings
            ┌────▼────────────┴──┐         ┌─────────────┐
            │  FastAPI Inference  │         │   Redis     │  sessions ·
            │  + InsightFace :8000│         │   :6379     │  idempotency ·
            └─────────────────────┘         └─────────────┘  WS conn map
```

| Concern              | Technology                                                  |
| -------------------- | ----------------------------------------------------------- |
| Dashboard            | Next.js 15 (App Router) · Tailwind CSS v4                    |
| API gateway          | Node.js · Express · TypeScript (strict) · Zod               |
| Async tasks          | RabbitMQ                                                     |
| AI inference         | Python · FastAPI · InsightFace                               |
| Storage + vector ANN | PostgreSQL 17 · pgvector · HNSW index                        |
| State / cache        | Redis                                                        |

### Core identity logic
- **Enrollment** — profile photo → 512-dim embedding → stored as a `vector` in Postgres.
- **Identification** — live frame → detect + align → embedding → cosine similarity (`<=>`) over the HNSW index → resolve user if similarity > `0.75`.

### Resilience patterns
- **Transactional Outbox** — atomic DB persistence + event publication in one transaction.
- **Idempotency guardrails** — Redis distributed locks prevent double-scan mutations.
- **Circuit breaker** — `opossum` in the gateway isolates AI-service faults.

---

## Repository layout

```
facevec-attendance/
├── apps/
│   └── web/                 # Next.js 15 dashboard (Dockerfile, standalone output)
├── services/
│   ├── gateway/             # Express + TypeScript API ingestion gateway
│   └── ai-inference/        # FastAPI + InsightFace microservice
├── infra/
│   └── postgres/init/       # first-boot SQL (pgvector & extensions)
├── docker-compose.yml       # orchestrates all six services + health checks
├── .env.example             # root env consumed by compose (copy to .env)
├── Makefile                 # convenience targets around docker compose
└── README.md
```

Each service is **self-contained**: it owns its `Dockerfile`, dependency
manifest, and `.env.example`, and builds into its own image. There is no
workspace hoisting, so any service can be built and deployed independently.

---

## Prerequisites

- Docker Engine 24+ with the Compose v2 plugin
- (Optional, for running a service outside Docker) Node.js 22+, Python 3.12+

---

## Quick start

```bash
# 1. Create your local env file and fill in the secrets.
cp .env.example .env
$EDITOR .env

# 2. Build and launch the full stack.
make up          # or: docker compose up --build -d

# 3. Watch health come up.
make ps
```

| Service       | URL                              |
| ------------- | -------------------------------- |
| Dashboard     | http://localhost:3000            |
| API gateway   | http://localhost:8080/health     |
| AI inference  | http://localhost:8000/health     |
| RabbitMQ UI   | http://localhost:15672           |
| PostgreSQL    | `localhost:5432`                 |
| Redis         | `localhost:6379`                 |

Tear down with `make down` (keeps data) or `make clean` (removes volumes).

> See [CONTRIBUTING.md](CONTRIBUTING.md) for local development and conventions,
> and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the deployment guide.

### Environment strategy
- The **root `.env`** holds the values `docker-compose.yml` interpolates and wires
  into every container. It is git-ignored; only `.env.example` is committed.
- Each service additionally ships its own `.env.example` for running that service
  **standalone** (outside Compose), pointing at `localhost`.
- **No secrets are ever committed.** Generate strong values with `openssl rand -hex 48`.

---

## Health & readiness

Every backend service exposes:
- `GET /health` — liveness (process is up). Used by the Docker `HEALTHCHECK`.
- `GET /ready` — readiness (dependencies reachable). Extended per phase.

---

## Persistence & migrations

The data model lives in the **gateway** service (it owns `DATABASE_URL`):

```
services/gateway/
├── prisma/
│   ├── schema.prisma          # relational model, enums, FKs, indexes
│   └── migrations/            # SQL migrations (applied with `migrate deploy`)
└── src/domain/                # framework-agnostic domain entities & rules
```

Prisma owns the relational schema; two pgvector features it cannot express are
applied as raw SQL inside the migrations:

- **`vector(512)`** column on `face_embeddings` (declared `Unsupported(...)` in
  the schema so Prisma stays drift-aware; read back via `$queryRaw`).
- **HNSW index** `USING hnsw (embedding vector_cosine_ops)` for cosine-distance
  (`<=>`) nearest-neighbour search.

```bash
cd services/gateway
cp .env.example .env                     # set DATABASE_URL (localhost when outside Compose)
npm install
npm run db:migrate                       # prisma migrate deploy  (apply existing migrations)
npm run db:migrate:dev -- --name <name>  # author a new migration during development
npm run db:generate                      # regenerate the typed Prisma client
```

> The HNSW index is intentionally **migration-only** (not representable in
> `schema.prisma`). Apply migrations with `db:migrate` (`migrate deploy`) — the
> path used by Docker/CI — to avoid `migrate dev`'s drift prompt for that index.

The `src/domain/` layer is pure TypeScript — branded id types, the `Role`/RBAC
capability map, entity interfaces, and rules such as `cosineSimilarity` and
refresh-token rotation checks. It imports nothing from Prisma or Express;
Phase 2 maps persisted rows onto these entities.

---

## API (gateway)

The gateway is an **Express 5 + TypeScript** app under `/api/v1`. Every request
gets a propagated `x-request-id`; responses are JSON, and errors share one shape:
`{ "error": { "code", "message", "details?" }, "requestId" }`.

**Middleware stack:** request logging (pino) → `helmet` → CORS allow-list →
JSON/cookie parsing → rate limiting → Zod validation → JWT auth → RBAC.

**Auth.** Short-lived access JWT (HS256) in the `Authorization: Bearer` header;
long-lived **opaque refresh token** in an httpOnly cookie, stored only as a
peppered HMAC and **rotated on every refresh** (reuse of a rotated token revokes
the whole token family). Passwords are hashed with **Argon2id**.

**RBAC.** Roles `ADMIN` / `PROFESSOR` / `STUDENT` map to capabilities in
`src/domain/role.ts`; routes are gated by capability and resource ownership is
enforced per-row (a professor only sees their own courses/sessions).

| Method & path | Auth | Notes |
| --- | --- | --- |
| `POST /auth/register` | public | self-service, always creates a STUDENT |
| `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` | public / cookie | refresh rotates the token |
| `GET /auth/me` | bearer | current principal |
| `… /users` (CRUD) | ADMIN | user management |
| `… /students` (CRUD) | PROFESSOR·ADMIN | roster |
| `… /courses` (CRUD) + `…/courses/:id/enrollments` | PROFESSOR·ADMIN | own courses; enroll/unenroll |
| `POST /courses/:id/sessions` · `… /sessions/:id` · `…/close` | PROFESSOR·ADMIN | attendance windows |
| `POST /sessions/:id/attendance` | PROFESSOR·ADMIN | manual marking (idempotent) |
| `GET /health` · `GET /ready` | public | `/ready` verifies Postgres |

```bash
cd services/gateway
cp .env.example .env            # set DATABASE_URL + JWT secrets
npm install && npm run db:migrate
npm run db:seed                 # bootstrap ADMIN (admin@facevec.local / ChangeMe123!)
npm run dev                     # tsx watch on :8080
```

In Docker the gateway applies pending migrations on start (entrypoint) before
serving. Face enrollment and recognition write-paths arrive in Phases 3–4.

---

## Messaging & events (transactional outbox)

Events are published to RabbitMQ via the **transactional-outbox** pattern, so a
business write and its event are committed atomically and never lost — even if
the broker is down at commit time.

```
write + outbox row   ┌──────────────┐   poll + publish (confirms)   ┌────────────┐
  (one DB tx)  ─────► │ outbox_messages│ ───────────────────────────► │  RabbitMQ  │
                      └──────────────┘   mark PUBLISHED               │ facevec.   │
   relay claims rows with FOR UPDATE SKIP LOCKED                       │  events    │
   (multi-replica safe); retries with backoff                         └────────────┘
```

- **Write side:** services call `recordEvent(tx, …)` inside their
  `prisma.$transaction`, inserting into `outbox_messages` (`event_type` = AMQP
  routing key, row `id` = message id for consumer dedup).
- **Relay:** a background poller (`OutboxRelay`) claims PENDING rows with
  `FOR UPDATE SKIP LOCKED`, publishes each with **publisher confirms**, and marks
  them PUBLISHED; failures stay PENDING with exponential backoff up to a cap.
- **Topology:** a durable topic exchange `facevec.events` fans out by routing
  key to durable queues — `facevec.notifications` (`attendance.#`, `course.#`)
  and `facevec.face_tasks` (`face.#`, consumed by the AI service in Phase 4).
- **Resilience:** if the broker is unreachable the gateway still serves writes;
  events accumulate in the outbox and drain on reconnect. `/ready` reports broker
  status but only gates on Postgres.

Current producers: `attendance.recorded`, `course.student_enrolled`. The
`face.*` task events are produced once the enrollment/recognition endpoints land
(Phases 3→4).

---

## Face recognition (AI inference)

The **AI service** is stateless compute: it loads InsightFace `buffalo_l` at
startup and exposes `POST /v1/embeddings` (image → 512-d L2-normalised
embeddings + bounding boxes). It never touches the database — the **gateway**
orchestrates persistence and the pgvector search, calling the AI over HTTP.

```
            multipart image
 gateway  ───────────────────►  AI service        (stateless, model in-image)
   │  ◄───────────────────────  512-d embedding
   │
   ├─ enroll:    INSERT INTO face_embeddings (… , embedding::vector)   (raw SQL)
   └─ identify:  SELECT 1 - (embedding <=> $1::vector) AS similarity    (cosine)
                 within the session's course roster; if > FACE_MATCH_THRESHOLD
                 → record PRESENT (method FACE) + emit attendance.recorded
```

| Endpoint | Auth | Behaviour |
| --- | --- | --- |
| `POST /api/v1/students/:id/faces` | PROF·ADMIN | enroll a face (multipart `image`); SHA-256 de-dupes re-uploads |
| `GET /api/v1/students/:id/faces` · `DELETE …/:embeddingId` | PROF·ADMIN | list / remove embeddings |
| `POST /api/v1/sessions/:id/identify` | PROF·ADMIN | recognise a face; on a > threshold match records FACE attendance |

The gateway maps AI faults to clean statuses (`503 ai_unavailable`,
`502 ai_bad_response`, `422 no_face_detected`), which Phase 6 wraps in a circuit
breaker with a fallback queue. The AI service is CPU-only (`onnxruntime`); the
model pack is baked into the image so the container needs no runtime network.

---

## Redis (idempotency · rate limiting · session revocation)

Redis backs three cross-cutting concerns in the gateway, each of which **degrades
gracefully** if Redis is unavailable (the gateway keeps serving, with that
guarantee relaxed):

- **Idempotency** — unsafe operations (`enroll`, `mark`, `identify`) accept an
  `Idempotency-Key` header. The first request takes a Redis `SET NX` lock and its
  successful response is cached; retries replay it (`Idempotency-Replayed: true`),
  and a replay while the original is in flight gets `409`. This is the
  "distributed lock prevents double-scan mutations" guardrail.
- **Distributed rate limiting** — `express-rate-limit` uses a Redis store, so a
  limit is shared across all gateway replicas (in-memory fallback when `REDIS_URL`
  is unset).
- **Access-token revocation** — access JWTs are stateless, so Redis makes
  revocation immediate: `POST /auth/logout` denylists the token's `jti`;
  `POST /auth/logout-all` records a per-user cutoff that invalidates every access
  token issued so far. `authenticate` consults both on each request.

Refresh tokens remain the durable, audited source of truth in Postgres (rotation
+ reuse detection from Phase 2); Redis adds the fast, immediate-revocation layer
on top.

---

## Resilience (circuit breaker + fallback queue)

The gateway→AI call is wrapped in an **opossum** circuit breaker. When the AI
service is failing the breaker trips **OPEN** and calls fail fast (no piling up on
timeouts); after a cooldown it goes **HALF-OPEN** and lets one trial through.

The two AI-backed operations degrade differently by nature:

- **Enrollment** (not latency-sensitive) → **async fallback**. On any AI failure
  (or open breaker) the gateway enqueues the image as a `face.enrollment.requested`
  task and returns **202 Accepted** with a `jobId`. A background **consumer**
  drains `facevec.face_tasks` (extract via the breaker → persist). Failures are
  parked in a **TTL retry queue** (delayed redelivery, bounded attempts), and
  exhausted tasks land in a **dead-letter queue**.
- **Identification** (real-time) → **no fallback**: a stale async result is
  useless for live attendance, so it surfaces **503** immediately.

```
enroll, AI up      → 201 enrolled (sync)
enroll, AI down    → 202 queued ──► facevec.face_tasks ──► consumer drains on recovery
                                         │ fail
                                         ▼
                            face_tasks.retry (TTL) ──► back to face_tasks
                                         │ attempts exhausted
                                         ▼
                                 face_tasks.dead
identify, AI down  → 503
```

`/ready` reports the breaker state (`closed` / `open` / `half-open`).

---

## Dashboard & real-time feed

**Gateway WebSocket** (`/ws`) powers a live attendance feed. Clients authenticate
with `?token=<accessToken>` on the upgrade and `subscribe` to sessions they are
authorised for. The `facevec.notifications` queue is consumed and each
`attendance.recorded` event is fanned out to subscribers; cross-replica delivery
uses **Redis pub/sub**, so the one replica that consumes an event reaches every
replica's sockets (local-only fallback without Redis).

```
mark / identify → outbox → relay → facevec.notifications
                                        │ (consumed once)
                                        ▼
                              Redis pub/sub  ──►  every replica
                                        ▼
                              WebSocket subscribers (live feed)
```

**Next.js 15 dashboard** (`apps/web`) — a client-side SPA against the gateway
(CORS + httpOnly refresh cookie; access token in memory with transparent refresh
on 401):

| Route | Purpose |
| --- | --- |
| `/login` | sign in |
| `/courses` | list / create courses |
| `/courses/[id]` | roster, **face enrollment** (webcam or upload), open sessions |
| `/sessions/[id]` | **live attendance feed** (WebSocket) |
| `/sessions/[id]/scan` | capture → identify (records on a match) |

Face capture supports **webcam** (`getUserMedia` → canvas → JPEG) with a
**file-upload** fallback.

---

## Testing & CI

| Suite | Tooling | What it covers |
| --- | --- | --- |
| Gateway unit | vitest | domain rules — cosine similarity, RBAC capability map, embedding/UUID validation, refresh-token reuse, session state |
| Gateway integration | vitest + supertest + Postgres | auth (login/refresh-rotation/reuse), `/me`, RBAC, course ownership isolation, CRUD, validation (422), 404, roster + manual attendance (incl. the transactional outbox write) |
| AI unit | pytest | `decode_image`, `FaceEngine.extract` mapping/sorting (mocked model), `/health`, `/ready`, `/v1/embeddings` (415/400/503/200) |

```bash
cd services/gateway && npm test       # unit + integration (needs Postgres)
cd services/ai-inference && pytest     # model is faked — no weights needed
```

Integration tests run against Postgres only — Redis/RabbitMQ are unset so the app
uses the in-memory limiter and the outbox simply accumulates rows (their live
behaviour is covered by the Phase 5/6 checks). They **truncate** their target
database, so point `DATABASE_URL` at a disposable DB.

**CI** (`.github/workflows/ci.yml`) runs on every PR: lint + typecheck per
service, **`test-gateway`** (spins up a `pgvector` service, applies migrations,
runs vitest), **`lint-ai`** (flake8 + mypy + pytest), and a Docker build matrix.

---

## Observability

Three pillars across both services:

- **Metrics** — Prometheus `/metrics` on the gateway (`prom-client`) and the AI
  service (`prometheus_client`): default process metrics + HTTP request
  count/duration (labelled by matched route), plus app metrics
  (`facevec_ai_breaker_state`, `facevec_outbox_pending_messages`,
  `facevec_identify_total`, `ai_inference_duration_seconds`,
  `ai_faces_detected_total`).
- **Tracing** — OpenTelemetry on both services, enabled only when
  `OTEL_EXPORTER_OTLP_ENDPOINT` is set. The gateway instruments http/express/
  ioredis/amqplib/undici (so the gateway→AI call propagates W3C `traceparent`)
  and the AI service continues the trace via the FastAPI instrumentor — yielding
  end-to-end distributed traces.
- **Logs** — pino (gateway) / structlog (AI), JSON in production; the gateway
  injects the active `trace_id`/`span_id` into every log line so logs correlate
  to traces.

Run the optional stack (Jaeger + Prometheus) and ship telemetry to it:

```bash
echo 'OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318' >> .env
docker compose --profile observability up -d
# Jaeger UI → http://localhost:16686    Prometheus → http://localhost:9090
```

The gateway starts its tracing bootstrap first, then dynamically imports the app
so the instrumentations patch its modules (avoiding the `--import` double-init
pitfall). Tracing is a no-op when no endpoint is configured.

---

## Delivery roadmap

This project is delivered in strict, reviewable phases.

| Phase | Scope                                                                 |
| ----- | --------------------------------------------------------------------- |
| **0** | **Monorepo skeleton, Dockerfiles, compose, env templates, README** ✅ |
| **1** | **Postgres schema (Prisma + raw SQL pgvector/HNSW), domain entities** ✅ |
| **2** | **Express gateway — routing, Zod validation, auth/RBAC, middleware stack** ✅ |
| **3** | **RabbitMQ topology + Transactional Outbox relay (publisher confirms)** ✅ |
| **4** | **FastAPI InsightFace embedding service + gateway enroll/identify (pgvector)** ✅ |
| **5** | **Redis — idempotency locks, distributed rate limiting, token/session revocation** ✅ |
| **6** | **Circuit breaker (opossum) + async fallback queue with retry/dead-letter** ✅ |
| **7** | **WebSocket live feed (Redis pub/sub) + Next.js 15 dashboard (enrollment, scan)** ✅ |
| **8** | **Test suites (vitest unit/integration, pytest) + CI test jobs** ✅ |
| **9** | **Observability — OpenTelemetry tracing, Prometheus metrics, log↔trace correlation** ✅ |

> **Phase 0 note:** the gateway and AI service ship minimal but *real* bootstrap
> entrypoints (working `/health` + `/ready` probes), not placeholders. Their full
> application logic is added in the phases above.
