BEGIN;

CREATE TABLE data_import_runs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status text NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'succeeded', 'failed')),
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    file_manifest jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(file_manifest) = 'object'),
    row_counts jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(row_counts) = 'object'),
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(warnings) = 'array'),
    error_summary text,
    CONSTRAINT ck_data_import_runs_finished_state CHECK (
        (status = 'running' AND finished_at IS NULL)
        OR (status IN ('succeeded', 'failed') AND finished_at IS NOT NULL)
    ),
    CONSTRAINT ck_data_import_runs_error_state CHECK (
        (status = 'failed' AND error_summary IS NOT NULL)
        OR (status <> 'failed' AND error_summary IS NULL)
    )
);

CREATE INDEX ix_data_import_runs_started_at
    ON data_import_runs (started_at DESC);

COMMENT ON TABLE data_import_runs IS 'Audit record for explicit structured CSV import batches.';
COMMENT ON COLUMN data_import_runs.file_manifest IS 'Source paths and SHA-256 checksums for files in the batch.';
COMMENT ON COLUMN data_import_runs.row_counts IS 'Rows processed per source file after successful validation.';
COMMENT ON COLUMN data_import_runs.warnings IS 'Non-blocking source-data quality observations for the batch.';
COMMENT ON COLUMN data_import_runs.error_summary IS 'Sanitized validation or database failure summary; never includes credentials.';

COMMIT;