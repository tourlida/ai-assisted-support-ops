import type { Request, RequestHandler, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import { authCookieOptions } from "../config/env.js";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";
import * as authService from "../services/auth.service.js";
import { AppError } from "../middleware/error.middleware.js";

export const login: RequestHandler = async (
  request: Request<ParamsDictionary, unknown, unknown>,
  response: Response,
) => {
  const input = loginSchema.parse(request.body);
  const result = await authService.login(input);
  response.cookie("access_token", result.token, authCookieOptions);
  response.status(200).json({ user: result.user });
};

export const register: RequestHandler = async (
  request: Request<ParamsDictionary, unknown, unknown>,
  response: Response,
) => {
  const input = registerSchema.parse(request.body);
  const result = await authService.register(input);
  response.cookie("access_token", result.token, authCookieOptions);
  response.status(201).json({ user: result.user });
};

export const currentUser: RequestHandler = async (request, response) => {
  if (!request.user) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  const user = await authService.getSafeUser(request.user.userId);
  response.status(200).json({ user });
};

export const logout: RequestHandler = (_request, response) => {
  response.clearCookie("access_token", {
    httpOnly: authCookieOptions.httpOnly,
    secure: authCookieOptions.secure,
    sameSite: authCookieOptions.sameSite,
    path: authCookieOptions.path,
  });
  response.status(200).json({ success: true });
};