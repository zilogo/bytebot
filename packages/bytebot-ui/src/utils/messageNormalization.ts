import { Message } from "@/types";
import { MessageContentBlock } from "@bytebot/shared";

/**
 * Ensures that a message's content field is always an array.
 * This is a defensive measure against runtime data inconsistencies.
 */
export function normalizeMessage(message: Message): Message {
  // If content is already an array, return as-is
  if (Array.isArray(message.content)) {
    return message;
  }

  // Log warning for debugging
  console.warn("Message content is not an array, normalizing:", {
    id: message.id,
    role: message.role,
    contentType: typeof message.content,
    content: message.content,
  });

  // If content is null/undefined, convert to empty array
  if (!message.content) {
    return {
      ...message,
      content: [] as MessageContentBlock[],
    };
  }

  // If content is a single object (not array), wrap it in an array
  if (typeof message.content === "object") {
    return {
      ...message,
      content: [message.content] as MessageContentBlock[],
    };
  }

  // Fallback: return empty content array
  return {
    ...message,
    content: [] as MessageContentBlock[],
  };
}

/**
 * Normalizes an array of messages
 */
export function normalizeMessages(messages: Message[]): Message[] {
  return messages.map(normalizeMessage);
}
