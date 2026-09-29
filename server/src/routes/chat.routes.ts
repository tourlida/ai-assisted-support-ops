import { Router } from "express";
import { createChatMessage, health } from "../controllers/chat.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

export const chatRouter = Router();

chatRouter.get("/health", authenticate, health);
chatRouter.post("/messages", authenticate, createChatMessage);