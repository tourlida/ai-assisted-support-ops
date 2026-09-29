import type { Request, RequestHandler, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import { loginSchema } from "../schemas/auth.schema.js";
import * as authService from "../services/auth.service.js";

export const login: RequestHandler = async (
  request: Request<ParamsDictionary, unknown, unknown>,
  response: Response,
) => {
  const input = loginSchema.parse(request.body);
  const result = await authService.login(input);
  response.status(200).json(result);
};