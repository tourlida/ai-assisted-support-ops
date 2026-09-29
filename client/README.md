# SupportOps Client

React + TypeScript + Vite interface for SupportOps authentication and the first protected mock-chat workflow.

## Setup

Requirements: Node.js 20 or newer and the existing backend running at its configured API origin.

```sh
npm install
cp .env.example .env
npm run dev
```

The only client environment setting is `VITE_API_BASE_URL`, which points to the backend. Vite variables are public browser configuration: never put database URLs, passwords, JWT secrets, or private API keys in `VITE_` variables.

## Run and Validate

```sh
npm run typecheck
npm test
npm run build
```

## Authentication Architecture

The browser never receives a JWT in response JSON and never stores it in localStorage or sessionStorage. On register/login, the backend sets an `HttpOnly`, `SameSite=Lax` `access_token` cookie. The API client uses `credentials: "include"`; the browser sends the cookie automatically. Auth context stores only the safe user (`id`, `name`, `email`, `role`).

Registration sends the password to the backend over the API connection because the server must verify/hash it. The confirmation field is used only for browser-side validation and is omitted from the request. Passwords are not client-side encoded or hashed: encoding is reversible and client-side hashing would become a reusable credential. The API client permits plain HTTP only for localhost during development and requires HTTPS for other origins; production must terminate TLS at the API or trusted reverse proxy. The browser's own developer tools can display a request made by that browser, but the application never logs the password.

On page load, the provider calls `GET /api/auth/me` and waits for the result before protected-route redirects. Logout calls `POST /api/auth/logout`, allowing the backend to clear the HttpOnly cookie, then clears local user state. The development setup uses explicit localhost origins; production cookie security and CSRF controls must be reviewed for the deployed topology.

## Routes

- `/login`: email/password form.
- `/register`: name, email, password, and confirmation; successful registration automatically enters the dashboard.
- `/dashboard`: protected workspace with the signed-in user's name and mock chat.

The API client calls `/api/auth/login`, `/api/auth/register`, `/api/auth/me`, `/api/auth/logout`, and `/api/chat/messages` on the backend. Chat requests use the existing request/response contract and require the HttpOnly cookie. The assistant reply remains mocked; no AI, RAG, embedding, retrieval, or streaming behavior is implemented.

## Validation and Accessibility

Forms use React Hook Form and Zod with on-blur validation, associated labels, field-level messages, keyboard support, visible focus states, and disabled submission while pending. Chat history is local to the chat component. Send is an intentional immediate action, not debounced.
