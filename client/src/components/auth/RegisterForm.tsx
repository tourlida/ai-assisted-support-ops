import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { registerFormSchema, type RegisterFormValues } from "../../schemas/auth.schemas";
import { useAuth } from "../../hooks/useAuth";

export function RegisterForm() {
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    mode: "onBlur",
  });

  async function submit(values: RegisterFormValues) {
    setServerError("");
    try {
      await createAccount(values);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError && error.status === 409
        ? "An account with this email already exists."
        : error instanceof Error ? error.message : "Unable to create your account right now.");
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit(submit)} noValidate>
      <label htmlFor="register-name">Full name</label>
      <input id="register-name" autoComplete="name" maxLength={100} {...register("name")} aria-invalid={!!errors.name} />
      {errors.name && <p className="field-error" role="alert">{errors.name.message}</p>}

      <label htmlFor="register-email">Email address</label>
      <input id="register-email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
      {errors.email && <p className="field-error" role="alert">{errors.email.message}</p>}

      <label htmlFor="register-password">Password</label>
      <input id="register-password" type="password" autoComplete="new-password" {...register("password")} aria-invalid={!!errors.password} />
      {errors.password && <p className="field-error" role="alert">{errors.password.message}</p>}

      <label htmlFor="register-confirm">Confirm password</label>
      <input id="register-confirm" type="password" autoComplete="new-password" {...register("confirmPassword")} aria-invalid={!!errors.confirmPassword} />
      {errors.confirmPassword && <p className="field-error" role="alert">{errors.confirmPassword.message}</p>}

      {serverError && <p className="form-error" role="alert">{serverError}</p>}
      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
