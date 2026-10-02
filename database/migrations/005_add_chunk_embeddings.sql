BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunk_embeddings (
    chunk_id bigint NOT NULL REFERENCES document_chunks (id) ON DELETE CASCADE,
    model text NOT NULL CHECK (btrim(model) <> ''),
    embedding vector(768) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (chunk_id, model)
);

COMMENT ON TABLE document_chunk_embeddings IS 'Derived embeddings per chunk and model; document_chunks.content remains the source of truth.';
COMMENT ON COLUMN document_chunk_embeddings.embedding IS 'Fixed 768 dimensions (nomic-embed-text); a different dimension needs a new column or table.';

COMMIT;
