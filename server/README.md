# SupportOps Server

A TypeScript/Express backend foundation for SupportOps. This phase provides PostgreSQL connectivity, login with JWT authentication, health endpoints, and an authenticated mock chat API. It does not implement AI, RAG, ingestion, tools, or frontend code.

## Architecture

```text
Routes -> Controllers -> Services -> PostgreSQL (pg)
                   Middleware handles authentication, errors, and request logging
                   Zod schemas validate external request bodies
```

The server uses the existing database managed by `database/migrations/001_initial_schema.sql` and `002_add_users.sql`. It never creates tables or runs migrations. Application users in `users` are separate from business customers in `customers`.

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
| `DATABASE_URL` | PostgreSQL connection URL. `DATABASE_URL=*** [HIDDEN FOR SECURITY]` |
| `JWT_SECRET` | Long random signing/verification secret. `JWT_SECRET=*** [HIDDEN FOR SECURITY]` |
| `JWT_EXPIRES_IN` | JWT lifetime using a duration such as `1h`. |
| `CLIENT_ORIGIN` | Single allowed browser origin for CORS. |

The committed `.env.example` contains placeholders only. Never commit the local `.env`; never print database URLs or signing secrets.

## Run, Build, and Test

```sh
npm run dev
npm run typecheck
npm run build
npm test
npm start
```

The integration test suite connects to the configured database, creates uniquely named short-lived test accounts with runtime-generated password hashes, and deletes those accounts during cleanup. It does not print passwords, hashes, tokens, or database configuration. Run tests only against a development/test database.

## Endpoints

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Process health. |
| `GET` | `/health/db` | No | Executes `SELECT 1` and confirms database connectivity. |
| `POST` | `/api/auth/login` | No | Validates credentials, checks account activity, and returns a JWT plus safe user details. |
| `GET` | `/api/chat/health` | Bearer JWT | Authenticated chat-service health. |
| `POST` | `/api/chat/messages` | Bearer JWT | Validates a message and returns a mock response. |

Login request shape:

```json
{
  "email": "user@example.com",
  "password": "<user-supplied-password>"
}
```

Successful login returns a JWT generated at runtime and safe user fields (`id`, `email`, and `role`). Never log or share the actual token; examples and diagnostics must redact it as `<JWT REDACTED>`.

Protected requests use:

```text
Authorization: Bearer <JWT REDACTED>
```

The chat response is a placeholder only. It does not call an LLM or perform retrieval.

## Authentication Flow

1. Zod validates and normalizes login input.
2. A parameterized query finds a user by case-insensitive email in the existing `users` table.
3. bcrypt verifies the supplied password against `password_hash`; inactive, missing, and invalid accounts receive the same generic authentication response.
4. A JWT containing only `userId` and `role` is signed using the configured backend secret and expiry.
5. Protected routes verify bearer tokens and attach the verified identity to `req.user`.

The database stores password hashes only. No registration or user-management endpoint is provided; account provisioning is handled separately. Password creation/reset, JWT key rotation, rate limiting, refresh tokens, sessions, authorization policy beyond the role claim, and production deployment controls are future work. JWTs and password hashes are never returned in logs or error messages.

## Error Handling and Logging

Errors use `{ "error": { "code": "...", "message": "..." } }`. Validation errors return 400, authentication errors return 401, unknown paths return 404, and unexpected errors return a generic 500 response. Raw database errors and stack traces are not sent to clients. HTTP logs contain method, path, status, and duration only; headers and bodies are not serialized.

## Current Limitations

- Chat is mocked; no AI, RAG, retrieval, embeddings, or external model services are called.
- The users table currently has no seeded account. Login requires an account to be provisioned through a separate secure process.
- There is no user registration, password reset, refresh-token/session flow, rate limiting, or account lockout.
- CORS permits only the configured single client origin.
- Database migrations are managed and applied outside the Node.js application.
