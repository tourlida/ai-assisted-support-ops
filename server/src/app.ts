import cors from "cors";
import cookieParser from "cookie-parser";
import express, { type RequestHandler } from "express";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { notFoundHandler } from "./middleware/not-found.middleware.js";

const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = Date.now();
  response.on("finish", () => {
    console.info(`[http] ${request.method} ${request.path} ${response.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
};

export const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(requestLogger);
app.use("/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);
app.use(notFoundHandler);
app.use(errorHandler);