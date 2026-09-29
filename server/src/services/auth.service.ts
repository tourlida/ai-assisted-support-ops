import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.middleware.js";
import type { LoginInput } from "../schemas/auth.schema.js";
import { userRoles, type LoginResponse, type UserRole } from "../types/auth.types.js";

interface UserRow {
  id: string;
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

export async function login(input: LoginInput): Promise<LoginResponse> {
  const email = input.email.trim().toLowerCase();
  const result = await pool.query<UserRow>(
    `SELECT id::text, email, password_hash, role, is_active
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

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]> },
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
}