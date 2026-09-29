import { Bot, UserRound } from "lucide-react";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatMessage({ message }: { message: ChatMessageItem }) {
  const isUser = message.role === "user";
  return (
    <article className={`chat-message ${isUser ? "chat-message-user" : "chat-message-assistant"}`}>
      <span className="message-avatar" aria-hidden="true">
        {isUser ? <UserRound size={16} /> : <Bot size={16} />}
      </span>
      <div className="message-copy">
        <span className="message-author">{isUser ? "You" : "SupportOps"}</span>
        <p>{message.content}</p>
      </div>
    </article>
  );
}
