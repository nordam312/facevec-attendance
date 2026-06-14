# Contributing to FaceVec Attendance

Thanks for contributing! This is a decoupled monorepo of independently
deployable services. Please read this guide before opening a pull request.

## Repository layout

```
services/gateway/      # Express + TypeScript API gateway (auth, RBAC, orchestration)
services/ai-inference/ # FastAPI + InsightFace embedding service (stateless)
apps/web/              # Next.js 15 dashboard
infra/                 # Postgres init SQL, Prometheus config
.github/workflows/     # CI (ci.yml) and CD (cd.yml)
```

Each service is **self-contained**: its own `package.json`/`requirements.txt`,
`Dockerfile`, `.env.example`, and lockfile. There is **no workspace hoisting** —
build and deploy any service on its own. Do not add a root `package.json` or a
workspace manager.

## Prerequisites

- Docker Engine 24+ with Compose v2
- Node.js 22 (see `.nvmrc`), Python 3.12 (for the AI service)

## Local setup

```bash
cp .env.example .env            # root env consumed by docker compose
make up                         # build + start the full stack
make ps                         # watch health
```

To run a service outside Docker, copy its own `.env.example` to `.env` and point
the connection strings at `localhost`. The infra services can be started alone:

```bash
docker compose up -d postgres redis rabbitmq
```

### Gateway

```bash
cd services/gateway
cp .env.example .env
npm install
npm run db:migrate        # apply Prisma migrations
npm run db:seed           # bootstrap an ADMIN (admin@facevec.local / ChangeMe123!)
npm run dev               # tsx watch on :8080
```

### AI inference

```bash
cd services/ai-inference
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000     # downloads buffalo_l on first run
```

### Web

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev               # Next.js on :3000
```

## Branching & commits

- Branch from the branch you're building on: `feature/<short-topic>` (or
  `fix/<topic>`, `chore/<topic>`). Never commit directly to `main`.
- Use **[Conventional Commits](https://www.conventionalcommits.org/)**:
  `feat(gateway): …`, `fix(ai): …`, `test(gateway): …`, `chore: …`, `docs: …`.
  Scope is the service (`gateway`, `ai`, `web`) when applicable.
- Keep PRs focused; one logical change per PR. Rebase rather than merge `main`
  into your branch to keep history linear.

## Quality gates (must pass before review)

Run the same checks CI runs. **A PR must be green on all of them.**

| Service | Commands |
| --- | --- |
| Gateway | `npm run lint` · `npm run typecheck` · `npm test` |
| Web | `npm run lint` · `npm run typecheck` · `npm run build` |
| AI inference | `flake8 app tests` · `mypy app` · `pytest` |

### Conventions

- **Gateway (TypeScript):** strict `tsconfig` (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`). NodeNext modules → use
  `.js` extensions on relative imports. Validate all input with Zod at the edge.
  Domain logic in `src/domain` must not import Prisma/Express. Map Prisma errors
  in the central error handler, not in controllers.
- **AI (Python):** `flake8` (max line 100) + strict `mypy` (`disallow_untyped_defs`).
  The service stays **stateless** — no database or broker access.
- **Web:** client-side SPA; talk to the gateway via `lib/api.ts` only.

## Tests

- **Unit** tests cover pure logic (no I/O) — domain rules, the face engine's
  mapping. **Integration** tests run the real HTTP app against Postgres.
- Gateway integration tests **truncate their database** — point `DATABASE_URL`
  at a disposable DB, never a database with data you care about.
- Add/extend tests with any behavioural change. New endpoints need integration
  coverage; new domain rules need unit coverage.

## Database changes

Prisma owns the relational schema; the `vector(512)` column and the HNSW index
are raw SQL inside migrations. To change the schema:

```bash
cd services/gateway
# edit prisma/schema.prisma, then:
npm run db:migrate:dev -- --name <change>
```

For pgvector-specific DDL (operator-class indexes) that Prisma can't express,
hand-author the SQL in the generated migration and apply with `db:migrate`
(`prisma migrate deploy`) — see `prisma/migrations/*_add_*` for the pattern.

## Pull request checklist

- [ ] Branch named `feature|fix|chore/<topic>`, Conventional-Commit messages
- [ ] All quality gates green for every service you touched
- [ ] Tests added/updated; integration tests pass against Postgres
- [ ] `.env.example` updated if you added a config variable
- [ ] No secrets committed (only `.env.example` placeholders)
- [ ] README/docs updated if behaviour or setup changed
