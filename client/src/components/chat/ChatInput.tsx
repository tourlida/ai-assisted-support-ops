import { ArrowUp } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { chatFormSchema, type ChatFormValues } from "../../schemas/chat.schemas";

export function ChatInput({ onSend, isSending }: {
  onSend(message: string): Promise<void>;
  isSending: boolean;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChatFormValues>({
    resolver: zodResolver(chatFormSchema),
    mode: "onBlur",
  });

  async function submit(values: ChatFormValues) {
    await onSend(values.message.trim());
    reset();
  }

  return (
    <form className="chat-input-row" onSubmit={handleSubmit(submit)}>
      <label className="visually-hidden" htmlFor="chat-message">Message SupportOps</label>
      <textarea
        id="chat-message"
        rows={1}
        maxLength={4000}
        placeholder="Ask about an order or policy…"
        {...register("message")}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void handleSubmit(submit)();
          }
        }}
        aria-invalid={!!errors.message}
        disabled={isSending}
      />
      <button className="send-button" type="submit" aria-label="Send message" title="Send message" disabled={isSending}>
        <ArrowUp size={19} aria-hidden="true" />
      </button>
      {errors.message && <span className="field-error chat-validation" role="alert">{errors.message.message}</span>}
    </form>
  );
}
