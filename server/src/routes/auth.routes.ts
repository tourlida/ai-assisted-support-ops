import { Router } from "express";
import { currentUser, login, logout, register } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/login", login);
authRouter.post("/register", register);
authRouter.get("/me", authenticate, currentUser);
authRouter.post("/logout", logout);