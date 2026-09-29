import { z } from "zod";

export const chatFormSchema = z.object({
  message: z.string().trim().min(1, "Enter a message.").max(4000, "Message must be at most 4000 characters."),
});

export type ChatFormValues = z.infer<typeof chatFormSchema>;
