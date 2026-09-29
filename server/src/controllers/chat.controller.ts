import type { Request, RequestHandler, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import { chatMessageSchema } from "../schemas/chat.schema.js";
import { createMessage } from "../services/chat.service.js";
import { AppError } from "../middleware/error.middleware.js";

export const health: RequestHandler = (_request, response) => {
  response.status(200).json({ status: "ok", service: "chat" });
};

export const createChatMessage: RequestHandler = (
  request: Request<ParamsDictionary, unknown, unknown>,
  response: Response,
) => {
  const user = request.user;
  if (!user) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const input = chatMessageSchema.parse(request.body);
  response.status(200).json(createMessage(input, user));
};