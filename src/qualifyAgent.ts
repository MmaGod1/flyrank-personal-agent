import { GoogleGenAI } from '@google/genai';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Model configuration and system prompt for the Job Qualification Chat (FE-06).
 * Kept separate from src/jobMatchingTool.ts (the existing one-shot Gemini
 * job-matching tool) so the two Gemini use cases don't share prompt/config code.
 */
export const GEMINI_MODEL = 'models/gemini-3.6-flash';

export const QUALIFICATION_SYSTEM_PROMPT = `
You are a job qualification assistant. Help the user work out whether a specific
job opportunity is a realistic fit for them, through a short, focused conversation,
not a one-shot judgment.

Ask about, in whatever order comes up naturally:
- Location and work arrangement (remote / hybrid / on-site)
- Work eligibility / right-to-work requirements tied to that location
- Role title and seniority
- Required technologies and experience level
- Any other explicit requirement the user mentions from the posting

Rules:
- Ask ONE useful follow-up question at a time. Do not stack multiple questions in one message.
- Keep questions concise.
- Clearly separate what the user has CONFIRMED from what you are ASSUMING. Say so explicitly when inferring.
- NEVER invent a job requirement that wasn't mentioned or clearly implied by the user.
- NEVER tell the user they ARE eligible or qualified unless the conversation has actually established that; if it's unclear, say what's unclear.
- When useful, briefly explain why a piece of information matters.
- Keep responses short. This is a conversation, not a report.
`.trim();

/**
 * Streams the qualification assistant's reply as plain text chunks.
 * Shared by both the Vercel serverless route (api/qualify.ts) and the local
 * dev server (src/server.ts) so the Gemini call only lives in one place.
 */
export async function* streamQualificationChunks(
  messages: ChatMessage[],
  apiKey: string
): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey });
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const stream = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: QUALIFICATION_SYSTEM_PROMPT,
    },
  });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}