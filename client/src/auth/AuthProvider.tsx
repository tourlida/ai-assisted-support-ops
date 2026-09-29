import { createContext, useEffect, useState, type PropsWithChildren } from "react";
import { authApi, type LoginInput, type RegisterInput } from "../api/auth.api";
import type { SafeUser } from "./auth.types";

export interface AuthContextValue {
  user: SafeUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  refreshUser(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshUser(): Promise<void> {
    setIsLoading(true);
    try {
      const response = await authApi.me();
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(input: LoginInput): Promise<void> {
    const response = await authApi.login(input);
    setUser(response.user);
  }

  async function register(input: RegisterInput): Promise<void> {
    const response = await authApi.register(input);
    setUser(response.user);
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }

  useEffect(() => {
    void refreshUser();
    const onUnauthorized = () => setUser(null);
    window.addEventListener("supportops:unauthorized", onUnauthorized);
    return () => window.removeEventListener("supportops:unauthorized", onUnauthorized);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
