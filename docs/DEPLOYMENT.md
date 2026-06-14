# Deployment Guide

How to build, configure, and run FaceVec Attendance in a deployed environment.

## Topology

Six services on one bridge network:

| Service | Image | Port | Notes |
| --- | --- | --- | --- |
| postgres | `pgvector/pgvector:pg17` | 5432 | pgvector + HNSW; first-boot extensions via `infra/postgres/init` |
| redis | `redis:7.4-alpine` | 6379 | idempotency, shared rate-limit, token revocation, WS pub/sub |
| rabbitmq | `rabbitmq:4-management-alpine` | 5672 / 15672 | events + face-task queues |
| gateway | `services/gateway` | 8080 | Express API + WebSocket `/ws` + `/metrics` |
| ai-inference | `services/ai-inference` | 8000 | stateless InsightFace embeddings + `/metrics` |
| web | `apps/web` | 3000 | Next.js dashboard (standalone output) |

Health-gated startup: the gateway waits for Postgres/Redis/RabbitMQ to be
`healthy`; the web waits for the gateway. The AI service is independent
(stateless) and the gateway tolerates it being down (circuit breaker → 503 /
async fallback queue).

## 1. Configuration & secrets

All config is environment-driven. Copy and fill the root template:

```bash
cp .env.example .env
```

**Generate strong secrets** (never reuse the placeholders):

```bash
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET
# strong POSTGRES_PASSWORD / REDIS_PASSWORD / RABBITMQ_PASSWORD
```

Key variables: `POSTGRES_*`, `REDIS_PASSWORD`, `RABBITMQ_*`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS` (the dashboard's public
origin), `NEXT_PUBLIC_API_BASE_URL` (the browser's URL for the gateway),
`FACE_MATCH_THRESHOLD`. `.env` is git-ignored — only `.env.example` is committed.

> `NEXT_PUBLIC_API_BASE_URL` is **baked into the web bundle at build time** — set
> it before building the web image, not just at runtime.

## 2. Images

### Option A — pull from GHCR (CI/CD)

Pushing to `main` runs `.github/workflows/cd.yml`, which builds and pushes each
service to GHCR tagged `latest` and the commit SHA:

```
ghcr.io/<owner>/<repo>/gateway
ghcr.io/<owner>/<repo>/ai-inference
ghcr.io/<owner>/<repo>/web
```

Pin deployments to the SHA tag for reproducibility.

### Option B — build locally

```bash
docker compose build           # or: docker compose build <service>
```

All images are multi-stage and run as **non-root**. Notes:

- **gateway** — generates the Prisma client at build; runs as `app`.
- **ai-inference** — compiles InsightFace and **bakes the `buffalo_l` model**
  (~280 MB) into the image, so the container needs **no network at runtime**.
  The first build is slow (~5–7 min); later builds hit the GHA layer cache.
- **web** — Next.js `standalone` output for a minimal runtime image.

## 3. Database migrations

The gateway image **applies migrations on start** via its entrypoint
(`prisma migrate deploy`, idempotent) before serving. For multi-replica
deployments, prefer running migrations as a **one-shot job** instead, so only one
process migrates:

```bash
docker compose run --rm gateway npx prisma migrate deploy
```

Bootstrap the first admin (idempotent):

```bash
docker compose run --rm \
  -e SEED_ADMIN_EMAIL=admin@yourdomain -e SEED_ADMIN_PASSWORD='<strong>' \
  gateway npm run db:seed
```

## 4. Run

```bash
docker compose up -d
make ps            # all services should report (healthy)
```

| Endpoint | URL |
| --- | --- |
| Dashboard | `http://<host>:3000` |
| Gateway health / ready / metrics | `:8080/health` · `/ready` · `/metrics` |
| AI health / metrics | `:8000/health` · `/metrics` |
| RabbitMQ management | `:15672` |

`/ready` returns 503 until Postgres is reachable; Redis/RabbitMQ degrade
gracefully and are reported but not required.

## 5. Observability (optional)

```bash
echo 'OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318' >> .env
docker compose --profile observability up -d
```

Adds Jaeger (UI `:16686`) and Prometheus (`:9090`, scraping both `/metrics`
endpoints). With the OTLP endpoint set, gateway and AI emit **distributed
traces**; otherwise tracing is a no-op and only metrics are exposed.

## 6. Production hardening checklist

- [ ] Terminate TLS at a reverse proxy (nginx/Caddy/ingress) in front of the
      gateway and web; set `NODE_ENV=production` (refresh cookies become `Secure`).
- [ ] Real, rotated secrets; never the committed placeholders.
- [ ] `CORS_ORIGINS` restricted to the dashboard's real origin(s).
- [ ] Managed/backed-up Postgres; RabbitMQ + Redis with persistence (volumes are
      configured). Migrate via the one-shot job, not on every replica boot.
- [ ] Scale: the gateway is stateless (Redis-backed rate-limit + WS pub/sub make
      it multi-replica safe); the AI service scales horizontally. Run **one**
      outbox relay / consumer set per gateway replica — they already use
      `FOR UPDATE SKIP LOCKED` and competing consumers, so replicas coordinate
      safely.
- [ ] Point `OTEL_EXPORTER_OTLP_ENDPOINT` at your collector; scrape `/metrics`.
- [ ] Set resource limits; the AI image is memory-heavy (ONNX runtime + model).

## 7. Operations notes

- **Changing a RabbitMQ queue's arguments** (e.g. `FACE_TASK_RETRY_DELAY_MS`)
  requires deleting the durable queue first — RabbitMQ rejects redeclaring a
  queue with different arguments.
- **Outbox backlog** and **breaker state** are exposed as metrics
  (`facevec_outbox_pending_messages`, `facevec_ai_breaker_state`) — alert on a
  growing backlog or a stuck-open breaker.
- **Exhausted face tasks** land in `facevec.face_tasks.dead`; inspect and
  re-drive from the RabbitMQ management UI.
