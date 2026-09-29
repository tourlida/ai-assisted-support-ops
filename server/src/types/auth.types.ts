export const userRoles = ["agent", "admin"] as const;

export type UserRole = (typeof userRoles)[number];

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
}

export interface JwtPayload extends AuthenticatedUser {}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginResponse {
  user: SafeUser;
}