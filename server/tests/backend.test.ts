import { randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { pool } from "../src/db/pool.js";

describe("SupportOps backend foundation", () => {
  const runId = randomUUID();
  const activeEmail = `active-${runId}@example.invalid`;
  const inactiveEmail = `inactive-${runId}@example.invalid`;
  const registerEmail = `register-${runId}@example.invalid`;
  const registerPassword = `Strong-${randomBytes(16).toString("base64url")}9!`;
  const activePassword = randomBytes(24).toString("base64url");
  const inactivePassword = randomBytes(24).toString("base64url");
  const invalidPassword = randomBytes(24).toString("base64url");
  let activeUserId = "";
  let validToken = "";

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(activePassword, 4);
    const activeResult = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id::text`,
      ["Active Test User", activeEmail, passwordHash],
    );
    activeUserId = activeResult.rows[0]?.id ?? "";

    const inactiveHash = await bcrypt.hash(inactivePassword, 4);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, is_active)
       VALUES ($1, $2, $3, false)`,
      ["Inactive Test User", inactiveEmail, inactiveHash],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [[activeEmail, inactiveEmail, registerEmail]]);
    await pool.end();
  });

  async function obtainValidCookie(): Promise<string> {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: activeEmail, password: activePassword });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: activeUserId, name: "Active Test User", email: activeEmail, role: "agent" },
    });
    expect(response.body).not.toHaveProperty("token");
    const cookie = response.headers["set-cookie"]?.[0];
    expect(cookie).toContain("access_token=");
    expect(cookie?.toLowerCase()).toContain("httponly");
    expect(cookie?.toLowerCase()).toContain("samesite=lax");
    expect(cookie?.toLowerCase()).toContain("path=/");
    expect(cookie?.toLowerCase()).toContain("max-age=3600");
    return cookie?.split(";")[0] ?? "";
  }

  it("GET /health responds with service status", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("GET /health/db confirms database connectivity", async () => {
    const response = await request(app).get("/health/db");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "connected" });
  });

  it("registers users, sets an HttpOnly cookie, and never returns the JWT", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: " Registered User ",
        email: ` ${registerEmail.toUpperCase()} `,
        password: registerPassword,
      });
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ name: "Registered User", email: registerEmail, role: "agent" });
    expect(response.body).not.toHaveProperty("token");
    const cookie = response.headers["set-cookie"]?.[0];
    expect(cookie).toContain("access_token=");
    expect(cookie?.toLowerCase()).toContain("httponly");
    expect(cookie?.toLowerCase()).toContain("samesite=lax");
    expect(cookie?.toLowerCase()).toContain("path=/");
    const stored = await pool.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE email = $1", [registerEmail]);
    expect(stored.rows[0]?.password_hash).toBeDefined();
    expect(stored.rows[0]?.password_hash).not.toBe(registerPassword);
  });

  it("rejects duplicate registration and password confirmation mismatch", async () => {
    const duplicate = await request(app).post("/api/auth/register").send({
      name: "Duplicate User", email: activeEmail.toUpperCase(),
      password: registerPassword,
    });
    expect(duplicate.status).toBe(409);
    const unexpectedField = await request(app).post("/api/auth/register").send({
      name: "Unexpected Field User", email: `unexpected-${runId}@example.invalid`,
      password: registerPassword, confirmPassword: registerPassword,
    });
    expect(unexpectedField.status).toBe(400);
  });

  it("rejects an invalid login body", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: "invalid" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid credentials with a generic response", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: activeEmail, password: invalidPassword });
    expect(response.status).toBe(401);
    expect(response.body.error).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password",
    });
  });

  it("rejects inactive users with a generic response", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: inactiveEmail, password: inactivePassword });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("authenticates a user and returns only safe user information", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: `  ${activeEmail.toUpperCase()}  `, password: activePassword });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: activeUserId,
      name: "Active Test User",
      email: activeEmail,
      role: "agent",
    });
    expect(response.body.user).not.toHaveProperty("password_hash");
    const cookie = response.headers["set-cookie"]?.[0];
    expect(cookie?.toLowerCase()).toContain("httponly");
    const token = cookie?.split(";")[0]?.split("=")[1] ?? "";
    const payload = jwt.verify(token, env.JWT_SECRET);
    expect(payload).toMatchObject({ userId: activeUserId, role: "agent" });
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "role", "userId"]);
  });

  it("GET /api/chat/health rejects a missing cookie", async () => {
    const response = await request(app).get("/api/chat/health");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /api/chat/health rejects an invalid cookie", async () => {
    const response = await request(app)
      .get("/api/chat/health")
      .set("Cookie", "access_token=invalid-token");
    expect(response.status).toBe(401);
  });

  it("GET /api/chat/health rejects an expired JWT", async () => {
    const expiredToken = jwt.sign(
      { userId: activeUserId, role: "agent" },
      env.JWT_SECRET,
      { expiresIn: -1 },
    );
    const response = await request(app)
      .get("/api/chat/health")
      .set("Cookie", `access_token=${expiredToken}`);
    expect(response.status).toBe(401);
  });

  it("GET /api/chat/health accepts a valid JWT", async () => {
    const cookie = await obtainValidCookie();
    const response = await request(app)
      .get("/api/chat/health")
      .set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "chat" });
  });

  it("POST /api/chat/messages rejects a missing JWT", async () => {
    const response = await request(app)
      .post("/api/chat/messages")
      .send({ message: "A mock chat request" });
    expect(response.status).toBe(401);
  });

  it("POST /api/chat/messages rejects an invalid body", async () => {
    const response = await request(app)
      .post("/api/chat/messages")
      .set("Cookie", await obtainValidCookie())
      .send({ message: "   " });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/chat/messages returns a mock response using the JWT identity", async () => {
    const cookie = await obtainValidCookie();
    const response = await request(app)
      .post("/api/chat/messages")
      .set("Cookie", cookie)
      .send({ message: "What is the refund policy?" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: "What is the refund policy?",
      response: "This is a mock assistant response.",
      userId: activeUserId,
    });
    expect(response.body.conversationId).toEqual(expect.any(String));
  });

  it("GET /api/auth/me returns the authenticated safe user", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", await obtainValidCookie());
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: activeUserId, name: "Active Test User", email: activeEmail, role: "agent" });
  });

  it("POST /api/auth/logout clears the authentication cookie", async () => {
    const response = await request(app).post("/api/auth/logout");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(response.headers["set-cookie"]?.[0]).toContain("access_token=");
    expect(response.headers["set-cookie"]?.[0]?.toLowerCase()).toContain("httponly");
  });

  it("restricts CORS to the configured client origin", async () => {
    const response = await request(app)
      .options("/api/chat/health")
      .set("Origin", env.CLIENT_ORIGIN)
      .set("Access-Control-Request-Method", "GET");
    expect(response.headers["access-control-allow-origin"]).toBe(env.CLIENT_ORIGIN);
  });
});