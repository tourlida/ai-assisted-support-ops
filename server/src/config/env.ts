import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: resolve(process.cwd(), ".env") });

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

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const invalidNames = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
  throw new Error(`Invalid environment configuration: ${invalidNames.join(", ")}`);
}

export const env = parsed.data;