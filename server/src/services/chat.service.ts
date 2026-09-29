import { randomUUID } from "node:crypto";
import type { ChatMessageInput } from "../schemas/chat.schema.js";
import type { AuthenticatedUser } from "../types/auth.types.js";

export interface ChatMessageResponse {
  conversationId: string;
  message: string;
  response: string;
  userId: string;
}

export function createMessage(
  input: ChatMessageInput,
  user: AuthenticatedUser,
): ChatMessageResponse {
  return {
    conversationId: randomUUID(),
    message: input.message,
    response: "This is a mock assistant response.",
    userId: user.userId,
  };
}