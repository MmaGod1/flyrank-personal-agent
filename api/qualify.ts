import type { IncomingMessage, ServerResponse } from "node:http";
import { streamQualificationChunks, type ChatMessage, type ChatContext } from "../src/qualifyAgent.js";
import { readJson, STORAGE_KEYS } from "../src/storage.js";
import type { UserProfile, CV, SavedJob } from "../src/types.js";
import { MAX_CHAT_MESSAGE_LENGTH, truncateHistory, lengthError } from "../src/limits.js";

interface QualifyRequest extends IncomingMessage {
  body?: { messages?: ChatMessage[]; jobId?: string };
  method?: string;
}

// FE-11: this is a streaming Gemini call — cap how long Vercel will let a
// single invocation run, so a stalled/slow generation can't hold a
// function (and its resources) open indefinitely.
export const config = {
  maxDuration: 30,
};

/**
 * POST /api/qualify (Vercel serverless function)
 * Streams a Gemini response for the multi-turn Job Qualification Chat.
 *
 * Extended for FL-06: if the request includes a `jobId` referencing a
 * saved job, the assistant's system prompt is grounded in that job's
 * description, its stored match analysis, the user's profile, and their
 * CV — so questions like "does my CV demonstrate React for this role?"
 * are answered from real data. `jobId` is optional; omitting it preserves
 * the original generic qualification-chat behavior.
 *
 * GEMINI_API_KEY is read server-side only and never sent to the client.
 */
export default async function handler(req: QualifyRequest, res: ServerResponse) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const rawMessages = Array.isArray(req.body?.messages) ? req.body!.messages! : [];
  const jobId = typeof req.body?.jobId === "string" ? req.body!.jobId : undefined;

  if (rawMessages.length === 0) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "messages array is required" }));
    return;
  }

  const oversizedMessage = rawMessages.find((m) => (m.content?.length ?? 0) > MAX_CHAT_MESSAGE_LENGTH);
  if (oversizedMessage) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: lengthError("Chat message", MAX_CHAT_MESSAGE_LENGTH) }));
    return;
  }

  // FE-11: cap how much history is actually sent to Gemini per request,
  // regardless of how long the client-side conversation has grown.
  const messages = truncateHistory(rawMessages);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Server is missing GEMINI_API_KEY" }));
    return;
  }

  let context: ChatContext | undefined;
  try {
    const [profile, cv, savedJobs] = await Promise.all([
      readJson<UserProfile>(STORAGE_KEYS.profile),
      readJson<CV>(STORAGE_KEYS.cv),
      jobId ? readJson<SavedJob[]>(STORAGE_KEYS.savedJobs) : Promise.resolve(null),
    ]);

    const selectedJob = jobId ? (savedJobs ?? []).find((j) => j.id === jobId) : undefined;

    context = {
      profile: profile ?? undefined,
      cv: cv ?? undefined,
      selectedJob: selectedJob?.job,
      jobMatch: selectedJob?.match,
    };
  } catch (error) {
    // Context loading is a best-effort enhancement — if storage is
    // unavailable, fall back to the plain qualification chat rather
    // than failing the whole request.
    console.error("Could not load chat context:", error);
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as unknown as { flushHeaders: () => void }).flushHeaders();
  }

  let clientAborted = false;
  req.on("close", () => {
    clientAborted = true;
  });

  try {
    for await (const chunk of streamQualificationChunks(messages, apiKey, context)) {
      if (clientAborted || res.writableEnded) break;
      res.write(chunk);
    }
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error("Gemini streaming error:", error);
    if (!clientAborted && !res.writableEnded) {
      res.write("\n\n[The assistant response was interrupted due to a server error.]");
      res.end();
    }
  }
}