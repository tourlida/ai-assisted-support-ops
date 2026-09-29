BEGIN;

ALTER TABLE users
    ADD COLUMN name text NOT NULL
        CHECK (name = btrim(name) AND name <> '');

COMMENT ON COLUMN users.name IS 'Display name for an authenticated SupportOps application user.';

COMMIT;
