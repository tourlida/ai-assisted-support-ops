import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";

const server = app.listen(env.PORT, () => {
  console.info(`[server] listening on port ${env.PORT}`);
});

function shutdown(signal: string): void {
  console.info(`[server] received ${signal}; shutting down`);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));