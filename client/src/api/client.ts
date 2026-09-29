import type { ApiErrorBody } from "../auth/auth.types";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export function assertSecureTransport(url: URL, isDevelopment = import.meta.env.DEV): void {
  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isDevelopment && url.protocol === "http:" && isLoopback)) {
    throw new ApiError(0, "INSECURE_TRANSPORT", "Secure HTTPS is required for API requests outside local development.");
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  requiresAuth = false,
): Promise<T> {
  const url = new URL(path, baseUrl);
  assertSecureTransport(url);

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Unable to reach the SupportOps server.");
  }

  const body = await response.json().catch(() => null) as ApiErrorBody | null;
  if (!response.ok) {
    if (response.status === 401 && requiresAuth) {
      window.dispatchEvent(new Event("supportops:unauthorized"));
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "The request could not be completed.",
    );
  }

  return body as T;
}
