import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../src/auth/AuthProvider";
import { AppRoutes } from "../src/routes/AppRoutes";
import { loginFormSchema, registerFormSchema } from "../src/schemas/auth.schemas";
import { ApiError, assertSecureTransport } from "../src/api/client";

const user = {
  id: "bd54183a-3ee8-4fe0-b850-aa2335094f0d",
  name: "Morgan Lee",
  email: "morgan@example.invalid",
  role: "agent" as const,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderRoutes(initialPath = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SupportOps client", () => {
  it("validates login and registration input including password confirmation", () => {
    expect(loginFormSchema.safeParse({ email: "bad", password: "x" }).success).toBe(false);
    expect(registerFormSchema.safeParse({
      name: "Morgan", email: "morgan@example.invalid", password: "weak", confirmPassword: "different",
    }).success).toBe(false);
    expect(registerFormSchema.safeParse({
      name: "Morgan", email: "morgan@example.invalid", password: "Strong-pass-123!", confirmPassword: "Strong-pass-123!",
    }).success).toBe(true);
  });

  it("allows HTTPS everywhere and HTTP only for local development", () => {
    expect(() => assertSecureTransport(new URL("https://api.example.com"), false)).not.toThrow();
    expect(() => assertSecureTransport(new URL("http://localhost:3000"), true)).not.toThrow();
    expect(() => assertSecureTransport(new URL("http://api.example.com"), true)).toThrow(ApiError);
    expect(() => assertSecureTransport(new URL("http://localhost:3000"), false)).toThrow(ApiError);
  });

  it("restores the cookie session before rendering a protected dashboard", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user }));
    vi.stubGlobal("fetch", fetchMock);
    renderRoutes("/dashboard");

    expect(await screen.findByRole("heading", { name: "Support, in one place." })).toBeInTheDocument();
    expect(screen.getByText("Hi, Morgan Lee")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ credentials: "include" }));
  });

  it("redirects to login when session restoration returns unauthorized", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401));
    vi.stubGlobal("fetch", fetchMock);
    renderRoutes("/dashboard");
    expect(await screen.findByRole("heading", { name: "Good support starts with a clear view." })).toBeInTheDocument();
  });

  it("logs in through the API and enters the dashboard without receiving a JWT", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ user }));
    vi.stubGlobal("fetch", fetchMock);
    const actor = userEvent.setup();
    renderRoutes("/login");

    await actor.type(await screen.findByLabelText("Email address"), user.email);
    await actor.type(screen.getByLabelText("Password"), "Strong-pass-123!");
    await actor.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Support, in one place." })).toBeInTheDocument();
    expect(screen.getByText("Hi, Morgan Lee")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
  });

  it("registers and automatically enters the protected dashboard without exposing a token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ user }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const actor = userEvent.setup();
    renderRoutes("/register");

    await actor.type(await screen.findByLabelText("Full name"), "Morgan Lee");
    await actor.type(screen.getByLabelText("Email address"), "Morgan@Example.invalid");
    await actor.type(screen.getByLabelText("Password"), "Strong-pass-123!");
    await actor.type(screen.getByLabelText("Confirm password"), "Strong-pass-123!");
    await actor.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Support, in one place." })).toBeInTheDocument();
    expect(screen.getByText("Hi, Morgan Lee")).toBeInTheDocument();
    const registrationCall = fetchMock.mock.calls[1];
    expect(registrationCall?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
    const registrationBody = JSON.parse(String(registrationCall?.[1]?.body)) as Record<string, unknown>;
    expect(registrationBody).toEqual({
      name: "Morgan Lee",
      email: "Morgan@Example.invalid",
      password: expect.any(String),
    });
    expect(registrationBody).not.toHaveProperty("confirmPassword");
    expect(registrationBody).not.toHaveProperty("token");
  });

  it("logs out through the backend and returns to login", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const actor = userEvent.setup();
    renderRoutes("/dashboard");

    await actor.click(await screen.findByRole("button", { name: "Logout" }));
    expect(await screen.findByRole("heading", { name: "Good support starts with a clear view." })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toMatchObject({ pathname: "/api/auth/logout" });
  });

  it("validates and submits chat messages with cookie credentials", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({
        conversationId: "chat-1",
        message: "What is the refund policy?",
        response: "This is a mock assistant response.",
        userId: user.id,
      }));
    vi.stubGlobal("fetch", fetchMock);
    const actor = userEvent.setup();
    renderRoutes("/dashboard");

    await actor.click(await screen.findByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a message.");
    await actor.type(screen.getByLabelText("Message SupportOps"), "What is the refund policy?");
    await actor.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("This is a mock assistant response.")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
    expect(fetchMock.mock.calls[1]?.[1]).not.toHaveProperty("Authorization");
  });
});
