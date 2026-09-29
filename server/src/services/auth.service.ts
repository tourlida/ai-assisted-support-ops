import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.middleware.js";
import type { LoginInput, RegisterInput } from "../schemas/auth.schema.js";
import { userRoles, type SafeUser, type UserRole } from "../types/auth.types.js";

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: boolean;
}

const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString("hex"), 10);
const invalidCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");

function isUserRole(value: string): value is UserRole {
  return userRoles.some((role) => role === value);
}

export async function login(input: LoginInput): Promise<{ user: SafeUser; token: string }> {
  const email = input.email.trim().toLowerCase();
  const result = await pool.query<UserRow>(
    `SELECT id::text, name, email, password_hash, role, is_active
     FROM users
     WHERE lower(email) = $1
     LIMIT 1`,
    [email],
  );

  const user = result.rows[0];
  const candidateHash = user?.password_hash ?? (await dummyPasswordHash);
  const passwordMatches = await bcrypt.compare(input.password, candidateHash);

  if (!user || !user.is_active || !passwordMatches || !isUserRole(user.role)) {
    throw invalidCredentials();
  }

  const safeUser: SafeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
  };

  return { user: safeUser, token: createAccessToken(user) };
}

function createAccessToken(user: Pick<UserRow, "id" | "role">): string {
  return jwt.sign(
    { userId: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]> },
  );
}

export async function register(input: RegisterInput): Promise<{ user: SafeUser; token: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const result = await pool.query<Pick<UserRow, "id" | "name" | "email" | "role">>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id::text, name, email, role`,
      [name, email, passwordHash],
    );
    const row = result.rows[0];
    if (!row || !isUserRole(row.role)) {
      throw new AppError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred");
    }
    return {
      user: { id: row.id, name: row.name, email: row.email, role: row.role },
      token: createAccessToken(row),
    };
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists");
    }
    throw error;
  }
}

export async function getSafeUser(userId: string): Promise<SafeUser> {
  const result = await pool.query<Pick<UserRow, "id" | "name" | "email" | "role" | "is_active">>(
    `SELECT id::text, name, email, role, is_active
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );
  const user = result.rows[0];
  if (!user || !user.is_active || !isUserRole(user.role)) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
