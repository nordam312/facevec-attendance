
-- =============================================================================
-- Runs once on first cluster initialisation (empty data volume).
-- Enables the extensions the application schema depends on. The actual tables,
-- the 512-dim `vector` columns, and the HNSW index are created by the Prisma /
-- raw-SQL migrations introduced in Phase 1 — NOT here.
-- =============================================================================

-- pgvector: `vector` column type + cosine distance operator (<=>) + HNSW index.
CREATE EXTENSION IF NOT EXISTS vector;

-- UUID generation for primary keys (gen_random_uuid lives in pgcrypto on PG13+,
-- uuid-ossp kept for explicit uuid_generate_v4() compatibility).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigram index support for fuzzy name/email lookups in the admin dashboard.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
