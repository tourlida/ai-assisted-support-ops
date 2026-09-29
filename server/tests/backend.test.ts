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
  const activePassword = randomBytes(24).toString("base64url");
  const inactivePassword = randomBytes(24).toString("base64url");
  const invalidPassword = randomBytes(24).toString("base64url");
  let activeUserId = "";
  let validToken = "";

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(activePassword, 4);
    const activeResult = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id::text`,
      [activeEmail, passwordHash],
    );
    activeUserId = activeResult.rows[0]?.id ?? "";

    const inactiveHash = await bcrypt.hash(inactivePassword, 4);
    await pool.query(
      `INSERT INTO users (email, password_hash, is_active)
       VALUES ($1, $2, false)`,
      [inactiveEmail, inactiveHash],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [[activeEmail, inactiveEmail]]);
    await pool.end();
  });

  async function obtainValidToken(): Promise<string> {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: activeEmail, password: activePassword });
    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    return response.body.token as string;
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
    expect(response.body.user).toEqual({ id: activeUserId, email: activeEmail, role: "agent" });
    expect(response.body.user).not.toHaveProperty("password_hash");
    validToken = response.body.token as string;
    const payload = jwt.verify(validToken, env.JWT_SECRET);
    expect(payload).toMatchObject({ userId: activeUserId, role: "agent" });
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "role", "userId"]);
  });

  it("GET /api/chat/health rejects a missing JWT", async () => {
    const response = await request(app).get("/api/chat/health");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /api/chat/health rejects an invalid JWT", async () => {
    const response = await request(app)
      .get("/api/chat/health")
      .set("Authorization", "Bearer invalid-token");
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
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(response.status).toBe(401);
  });

  it("GET /api/chat/health accepts a valid JWT", async () => {
    validToken = await obtainValidToken();
    const response = await request(app)
      .get("/api/chat/health")
      .set("Authorization", `Bearer ${validToken}`);
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
      .set("Authorization", `Bearer ${await obtainValidToken()}`)
      .send({ message: "   " });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/chat/messages returns a mock response using the JWT identity", async () => {
    validToken = await obtainValidToken();
    const response = await request(app)
      .post("/api/chat/messages")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ message: "What is the refund policy?" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: "What is the refund policy?",
      response: "This is a mock assistant response.",
      userId: activeUserId,
    });
    expect(response.body.conversationId).toEqual(expect.any(String));
  });

  it("restricts CORS to the configured client origin", async () => {
    const response = await request(app)
      .options("/api/chat/health")
      .set("Origin", env.CLIENT_ORIGIN)
      .set("Access-Control-Request-Method", "GET");
    expect(response.headers["access-control-allow-origin"]).toBe(env.CLIENT_ORIGIN);
  });
});