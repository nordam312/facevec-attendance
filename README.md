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

## Delivery roadmap

This project is delivered in strict, reviewable phases.

| Phase | Scope                                                                 |
| ----- | --------------------------------------------------------------------- |
| **0** | **Monorepo skeleton, Dockerfiles, compose, env templates, README** ✅ |
| **1** | **Postgres schema (Prisma + raw SQL pgvector/HNSW), domain entities** ✅ |
| 2     | Express gateway — routing, Zod validation, middleware stack           |
| 3     | RabbitMQ producer/consumer + Transactional Outbox                     |
| 4     | FastAPI inference — InsightFace pipeline, embedding endpoint          |
| 5     | Redis — idempotency keys, sessions, WebSocket connection map          |
| 6     | Circuit breaker (opossum) + fallback queue strategy                   |
| 7     | Next.js dashboard — enrollment UI, real-time WebSocket feed           |
| 8     | GitHub Actions CI/CD + test scaffolding                               |
| 9     | Observability — OpenTelemetry, structured logging, health checks      |

> **Phase 0 note:** the gateway and AI service ship minimal but *real* bootstrap
> entrypoints (working `/health` + `/ready` probes), not placeholders. Their full
> application logic is added in the phases above.
