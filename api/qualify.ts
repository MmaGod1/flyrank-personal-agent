import type { IncomingMessage, ServerResponse } from 'http';
import { streamQualificationChunks, type ChatMessage } from '../src/qualifyAgent.js';

interface QualifyRequest extends IncomingMessage {
  body?: { messages?: ChatMessage[] };
  method?: string;
}

/**
 * POST /api/qualify (Vercel serverless function)
 * Streams a Gemini response for the multi-turn Job Qualification Chat (FE-06).
 * GEMINI_API_KEY is read server-side only and never sent to the client.
 */
export default async function handler(req: QualifyRequest, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const messages = Array.isArray(req.body?.messages) ? req.body!.messages! : [];
  if (messages.length === 0) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'messages array is required' }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server is missing GEMINI_API_KEY' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === 'function') {
    (res as unknown as { flushHeaders: () => void }).flushHeaders();
  }

  let clientAborted = false;
  req.on('close', () => {
    clientAborted = true;
  });

  try {
    for await (const chunk of streamQualificationChunks(messages, apiKey)) {
      if (clientAborted || res.writableEnded) break;
      res.write(chunk);
    }
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error('Gemini streaming error:', error);
    if (!clientAborted && !res.writableEnded) {
      res.write('\n\n[The assistant response was interrupted due to a server error.]');
      res.end();
    }
  }
}