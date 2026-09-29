export type UserRole = "agent" | "admin";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  user: SafeUser;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}
