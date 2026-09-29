import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { z } from "zod";

const configDirectory = dirname(fileURLToPath(import.meta.url));
const serverEnvPath = resolve(configDirectory, "../../.env");
const rootEnvPath = resolve(configDirectory, "../../../.env");

dotenv.config({ path: serverEnvPath });

const databaseConfigSchema = z.object({
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_HOST: z.string().min(1).default("127.0.0.1"),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535),
});
const databaseConfig = databaseConfigSchema.safeParse(dotenv.parse(readFileSync(rootEnvPath)));

if (!databaseConfig.success) {
  const invalidNames = [...new Set(databaseConfig.error.issues.map((issue) => issue.path.join(".")))];
  throw new Error(`Invalid root database configuration: ${invalidNames.join(", ")}`);
}

const databaseUrl = new URL("postgresql://localhost");
databaseUrl.username = databaseConfig.data.DATABASE_USER;
databaseUrl.password = databaseConfig.data.DATABASE_PASSWORD;
databaseUrl.hostname = databaseConfig.data.DATABASE_HOST;
databaseUrl.port = String(databaseConfig.data.DATABASE_PORT);
databaseUrl.pathname = `/${databaseConfig.data.DATABASE_NAME}`;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.url().refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
    message: "Must be a PostgreSQL connection URL",
  }),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().regex(/^[1-9]\d*[smhd]$/),
  CLIENT_ORIGIN: z.url(),
});

const parsed = envSchema.safeParse({ ...process.env, DATABASE_URL: databaseUrl.toString() });

if (!parsed.success) {
  const invalidNames = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
  throw new Error(`Invalid environment configuration: ${invalidNames.join(", ")}`);
}

export const env = parsed.data;

const durationMultipliers: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};
const expiresInMatch = env.JWT_EXPIRES_IN.match(/^([1-9]\d*)([smhd])$/);
if (!expiresInMatch) {
  throw new Error("Invalid environment configuration: JWT_EXPIRES_IN");
}
const durationMultiplier = durationMultipliers[expiresInMatch[2]!];
if (!durationMultiplier) {
  throw new Error("Invalid environment configuration: JWT_EXPIRES_IN");
}
const jwtMaxAge = Number(expiresInMatch[1]) * durationMultiplier;

export const authCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: jwtMaxAge,
};