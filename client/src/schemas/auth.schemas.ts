import { z } from "zod";

const passwordSchema = z.string()
  .min(12, "Use at least 12 characters.")
  .max(72, "Password must be at most 72 characters.")
  .regex(/[a-z]/, "Add a lowercase letter.")
  .regex(/[A-Z]/, "Add an uppercase letter.")
  .regex(/[0-9]/, "Add a number.")
  .regex(/[^A-Za-z0-9]/, "Add a special character.");

export const loginFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z.string().min(1, "Enter your password."),
});

export const registerFormSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Name must be at most 100 characters."),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password."),
}).refine((values) => values.password === values.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match.",
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type RegisterFormValues = z.infer<typeof registerFormSchema>;
