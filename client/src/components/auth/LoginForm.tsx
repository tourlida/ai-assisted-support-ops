import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { loginFormSchema, type LoginFormValues } from "../../schemas/auth.schemas";
import { useAuth } from "../../hooks/useAuth";

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    mode: "onBlur",
  });

  async function submit(values: LoginFormValues) {
    setServerError("");
    try {
      await login(values);
      const target = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(target?.startsWith("/") ? target : "/dashboard", { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError && error.status === 401
        ? "Email or password was not recognized."
        : error instanceof Error ? error.message : "Unable to sign in right now.");
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit(submit)} noValidate>
      <label htmlFor="login-email">Email address</label>
      <input id="login-email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
      {errors.email && <p className="field-error" role="alert">{errors.email.message}</p>}

      <label htmlFor="login-password">Password</label>
      <input id="login-password" type="password" autoComplete="current-password" {...register("password")} aria-invalid={!!errors.password} />
      {errors.password && <p className="field-error" role="alert">{errors.password.message}</p>}

      {serverError && <p className="form-error" role="alert">{serverError}</p>}
      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
