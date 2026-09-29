import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "./error.middleware.js";
import { userRoles, type UserRole } from "../types/auth.types.js";

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && userRoles.some((role) => role === value);
}

export const authenticate: RequestHandler = (request, _response, next) => {
  const authorization = request.get("authorization");
  const [scheme, token, ...extraParts] = authorization?.trim().split(/\s+/) ?? [];

  if (scheme !== "Bearer" || !token || extraParts.length > 0) {
    next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof payload === "string" ||
      typeof payload.userId !== "string" ||
      !isUserRole(payload.role)
    ) {
      next(new AppError(401, "UNAUTHORIZED", "Invalid or expired token"));
      return;
    }

    request.user = {
      userId: payload.userId,
      role: payload.role,
    };
    next();
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Invalid or expired token"));
  }
};