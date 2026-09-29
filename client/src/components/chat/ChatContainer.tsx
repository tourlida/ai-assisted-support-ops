import { useEffect, useRef, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { ApiError } from "../../api/client";
import { chatApi } from "../../api/chat.api";
import { ChatInput } from "./ChatInput";
import { ChatMessage, type ChatMessageItem } from "./ChatMessage";

export function ChatContainer() {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  async function sendMessage(message: string): Promise<void> {
    const userMessage: ChatMessageItem = { id: crypto.randomUUID(), role: "user", content: message };
    setMessages((current) => [...current, userMessage]);
    setError("");
    setIsSending(true);
    try {
      const response = await chatApi.sendMessage({ message });
      setMessages((current) => [...current, {
        id: response.conversationId,
        role: "assistant",
        content: response.response,
      }]);
    } catch (requestError) {
      setError(requestError instanceof ApiError
        ? requestError.message
        : "Unable to reach the assistant. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="chat-panel" aria-label="SupportOps AI chat">
      <div className="chat-panel-header">
        <div className="chat-heading-icon"><MessageSquareText size={19} aria-hidden="true" /></div>
        <div>
          <h2>SupportOps AI Chat</h2>
          <p>Support assistant · Mock mode</p>
        </div>
        <span className="connection-state"><i /> Ready</span>
      </div>

      <div className="chat-history" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <span className="empty-mark"><MessageSquareText size={21} aria-hidden="true" /></span>
            <h3>How can we help?</h3>
            <p>Ask a support question to try the chat workflow.</p>
          </div>
        ) : messages.map((message) => <ChatMessage key={message.id} message={message} />)}
        {isSending && <p className="typing-indicator" role="status">SupportOps is responding…</p>}
        {error && <p className="form-error chat-error" role="alert">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-composer">
        <ChatInput onSend={sendMessage} isSending={isSending} />
        <p className="composer-note">Responses are mocked while the assistant is being built.</p>
      </div>
    </section>
  );
}
