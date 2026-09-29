import { apiRequest } from "./client";

export interface ChatMessageInput {
  message: string;
}

export interface ChatMessageResponse {
  conversationId: string;
  message: string;
  response: string;
  userId: string;
}

export const chatApi = {
  sendMessage(input: ChatMessageInput): Promise<ChatMessageResponse> {
    return apiRequest<ChatMessageResponse>(
      "/api/chat/messages",
      { method: "POST", body: JSON.stringify(input) },
      true,
    );
  },
};
