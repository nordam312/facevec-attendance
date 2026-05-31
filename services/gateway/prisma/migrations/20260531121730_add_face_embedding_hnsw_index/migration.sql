-- Approximate-nearest-neighbour index for face identification.
--
-- Prisma's schema language cannot express pgvector operator-class indexes, so
-- this index is maintained as raw SQL. Identification (Phase 4+) ranks
-- candidates with the cosine-distance operator `<=>`; `vector_cosine_ops` makes
-- that operator index-accelerated. Build parameters are pgvector defaults:
--   m               = 16  -- graph connectivity (higher = better recall, more memory)
--   ef_construction = 64  -- candidate list size at build time (higher = better graph, slower build)
-- Query-time recall is tuned per-session with `SET hnsw.ef_search` in Phase 4.
--
-- NOTE: because this index is not representable in schema.prisma, a future
-- `prisma migrate dev` will report it as drift. Apply migrations with
-- `prisma migrate deploy` (the path used by Docker/CI) to avoid that prompt.
CREATE INDEX "face_embeddings_embedding_hnsw_idx"
    ON "face_embeddings"
    USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
