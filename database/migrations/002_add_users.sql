BEGIN;

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL CHECK (
        email <> ''
        AND email = lower(btrim(email))
    ),
    password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
    role text NOT NULL DEFAULT 'agent'
        CHECK (role IN ('agent', 'admin')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_users_email_lower
    ON users (lower(email));

COMMENT ON TABLE users IS 'People authorized to access the SupportOps application; distinct from business customers.';
COMMENT ON COLUMN users.email IS 'Stored in trimmed lowercase form; applications should normalize before inserting or authenticating.';
COMMENT ON COLUMN users.password_hash IS 'Application-generated Argon2/bcrypt or equivalent password hash; never plaintext.';
COMMENT ON COLUMN users.role IS 'Application role constrained to agent or admin; this is not a general RBAC model.';
COMMENT ON COLUMN users.is_active IS 'Inactive accounts must be rejected by the future authentication layer.';

COMMIT;
