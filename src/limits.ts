/**
 * FE-11 production hygiene: hard limits on anything sent to Gemini, so a
 * single caller can't send unbounded payloads and burn through the
 * Gemini quota. Every AI-facing route imports these instead of trusting
 * client input size.
 */

export const MAX_JOB_POSTING_LENGTH = 20_000; // ~ a very long job posting, generously
export const MAX_CHAT_MESSAGE_LENGTH = 4_000; // one chat turn
export const MAX_CONVERSATION_MESSAGES = 40; // messages actually sent to Gemini per request
export const MAX_CV_LENGTH = 20_000;

export function lengthError(fieldName: string, maxLength: number): string {
  return `${fieldName} is too long (max ${maxLength.toLocaleString()} characters).`;
}

/**
 * Keeps only the most recent `maxMessages` entries. Used on the chat
 * history before it's sent to Gemini, so a very long-running
 * conversation can't grow the request (and the model's context/cost)
 * without bound.
 */
export function truncateHistory<T>(messages: T[], maxMessages: number = MAX_CONVERSATION_MESSAGES): T[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(messages.length - maxMessages);
}