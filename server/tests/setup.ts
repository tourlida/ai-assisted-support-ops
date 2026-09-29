import { randomBytes } from "node:crypto";

process.env.NODE_ENV ??= "test";
process.env.PORT ??= "3000";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.JWT_SECRET ??= randomBytes(48).toString("hex");
process.env.JWT_EXPIRES_IN ??= "1h";
process.env.CLIENT_ORIGIN ??= "http://localhost:5173";