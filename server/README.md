# SupportOps Server

A TypeScript/Express backend foundation for SupportOps. This phase provides PostgreSQL connectivity, login with JWT authentication, health endpoints, an authenticated mock chat API, and a standalone CLI for importing the five structured CSV datasets. It does not implement AI, RAG, PDF ingestion, tools, or frontend code.

## Architecture

```text
Routes -> Controllers -> Services -> PostgreSQL (pg)
                   Middleware handles authentication, errors, and request logging
                   Zod schemas validate external request bodies

CSV command -> CLI adapter -> CSV import service -> batch parser + PostgreSQL
```

The ingestion service is called by the explicit CLI command only. It is not called during server startup and is not exposed through an HTTP route. The service can be reused by a future job or operator workflow without moving batch writes into request handling.

The server uses the existing database managed by `database/migrations/001_initial_schema.sql`, `002_add_users.sql`, `003_add_user_name.sql`, and `004_add_data_import_runs.sql`. The application never runs migrations automatically. Application users in `users` are separate from business customers in `customers`.

## Requirements

- Node.js 20 or newer
- PostgreSQL from the existing local Docker Compose service

## Installation

From this directory, install dependencies:

```sh
npm install
```

Create a local `.env` from `.env.example` and replace placeholders. The local file is ignored by Git.

## Environment

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`. |
| `PORT` | HTTP listen port. |
| Root `.env` database fields | `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_HOST`, and `DATABASE_PORT` are combined by the server config into its PostgreSQL connection URL. Values remain local and are never logged. |
| `JWT_SECRET` | Long random signing/verification secret. `JWT_SECRET=*** [HIDDEN FOR SECURITY]` |
| `JWT_EXPIRES_IN` | JWT lifetime using a duration such as `1h`. |
| `CLIENT_ORIGIN` | Single allowed browser origin for CORS. |

The committed server `.env.example` contains placeholders only. The server reads application settings from `server/.env` and database settings from the repository-root `.env`; it builds the database URL internally. Never commit either local `.env`; never print database URLs or signing secrets.

## Run, Build, and Test

```sh
npm run dev
npm run typecheck
npm run build
npm test
npm run ingest:csv -- --check
npm start
```

## CSV Ingestion

The responsibilities are separated by module:

- `src/cli/import-csv.ts` parses command options, reads and hashes the fixed files under `datasets/`, and prints the result.
- `src/services/csv-import.service.ts` owns batch orchestration, audit lifecycle, the database transaction, and source-ID upserts.
- `src/ingestion/csv-batch-parser.ts` is the database-independent parser and validation contract.

Apply migration 004 to the configured PostgreSQL database before running a write import. The service validates the complete batch before business writes and upserts by source ID in foreign-key dependency order. It runs outside the Express API and does not create tables. Re-imports update matching IDs but do not delete database rows absent from a later CSV.

Run validation without connecting to PostgreSQL:

```sh
npm run ingest:csv -- --check
```

Run the atomic import after migration 004 is applied:

```sh
npm run ingest:csv
```

Every write attempt is recorded in `data_import_runs`, including failed validation or database writes. A successful audit status and all five table upserts commit in one transaction; failed writes roll back and the run is marked failed separately. The CLI prints row counts and non-blocking warnings. It does not print database configuration or credentials. The current `ORD-1023` header/item total difference is intentionally warned about and preserved. PDF registration, extraction, chunking, embeddings, and RAG remain deferred.

The integration test suite connects to the configured database, creates uniquely named short-lived test accounts with runtime-generated password hashes, and deletes those accounts during cleanup. It does not print passwords, hashes, tokens, or database configuration. Run tests only against a development/test database.

## Endpoints

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Process health. |
| `GET` | `/health/db` | No | Executes `SELECT 1` and confirms database connectivity. |
| `POST` | `/api/auth/register` | No | Creates a user, sets an HttpOnly cookie, and returns safe user details. |
| `POST` | `/api/auth/login` | No | Validates credentials, sets an HttpOnly cookie, and returns safe user details. |
| `GET` | `/api/auth/me` | HttpOnly cookie | Restores the current safe user profile. |
| `POST` | `/api/auth/logout` | No | Clears the HttpOnly authentication cookie. |
| `GET` | `/api/chat/health` | HttpOnly cookie | Authenticated chat-service health. |
| `POST` | `/api/chat/messages` | HttpOnly cookie | Validates a message and returns a mock response. |

Login request shape:

```json
{
  "email": "user@example.com",
  "password": "<user-supplied-password>"
}
```

Registration request shape:

```json
{
  "name": "Jordan Lee",
  "email": "user@example.com",
  "password": "<user-supplied-password>",
  "confirmPassword": "<matching-user-supplied-password>"
}
```

Registration and successful login set the backend-generated JWT in an `HttpOnly`, `SameSite=Lax` `access_token` cookie. Registration validates password strength and confirmation, stores a bcrypt hash, and creates a default `agent` account. The JSON response contains safe user fields only (`id`, `name`, `email`, and `role`); the JWT is not returned to React and is not logged. The cookie is `Secure` in production and uses `JWT_EXPIRES_IN` for its max age. Logout clears the same cookie path/options.

Protected browser requests use the automatically managed cookie. React sends `credentials: "include"`; it does not attach an Authorization header and cannot read the HttpOnly JWT.

The chat response is a placeholder only. It does not call an LLM or perform retrieval.

## Authentication Flow

1. Zod validates and normalizes login input.
2. A parameterized query finds a user by case-insensitive email in the existing `users` table.
3. bcrypt verifies the supplied password against `password_hash`; inactive, missing, and invalid accounts receive the same generic authentication response.
4. A JWT containing only `userId` and `role` is signed using the configured backend secret and expiry, then set as an HttpOnly cookie.
5. Protected routes verify the cookie and attach the verified identity to `req.user`.

The database stores password hashes only. The JWT remains inaccessible to JavaScript; React auth state contains only safe user information. Password reset, JWT key rotation, rate limiting, refresh-token/session flows, authorization policy beyond the role claim, and production deployment controls are future work. JWTs and password hashes are never returned in logs or error messages.

Cookie authentication is configured for the explicit client origin with credentials enabled. `SameSite=Lax` and same-origin/local-development usage reduce CSRF exposure; production deployment should evaluate CSRF tokens/origin checks against its topology and cookie policy. Do not loosen CORS to wildcard origins for credentialed requests.

## Error Handling and Logging

Errors use `{ "error": { "code": "...", "message": "..." } }`. Validation errors return 400, authentication errors return 401, unknown paths return 404, and unexpected errors return a generic 500 response. Raw database errors and stack traces are not sent to clients. HTTP logs contain method, path, status, and duration only; headers and bodies are not serialized.

## Current Limitations

- Chat is mocked; no AI, RAG, retrieval, embeddings, or external model services are called.
- The users table has no seeded account; register the first active `agent` account through `/api/auth/register`.
- There is no password reset, refresh-token/session flow, rate limiting, or account lockout.
- CORS permits only the configured single client origin.
- Database migrations are managed and applied outside the Node.js application.
