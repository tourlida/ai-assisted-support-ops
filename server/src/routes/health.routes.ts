import { Router } from "express";
import { pool } from "../db/pool.js";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

healthRouter.get("/db", async (_request, response) => {
  await pool.query("SELECT 1");
  response.status(200).json({ status: "ok", database: "connected" });
});