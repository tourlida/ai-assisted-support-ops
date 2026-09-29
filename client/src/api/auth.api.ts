import { apiRequest } from "./client";
import type { AuthResponse } from "../auth/auth.types";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
  confirmPassword: string;
}

export const authApi = {
  login(input: LoginInput): Promise<AuthResponse> {
    return apiRequest<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  register(input: RegisterInput): Promise<AuthResponse> {
    const registration = {
      name: input.name,
      email: input.email,
      password: input.password,
    };
    return apiRequest<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(registration),
    });
  },
  me(): Promise<AuthResponse> {
    return apiRequest<AuthResponse>("/api/auth/me", { method: "GET" }, true);
  },
  async logout(): Promise<void> {
    await apiRequest<{ success: true }>("/api/auth/logout", { method: "POST" });
  },
};
