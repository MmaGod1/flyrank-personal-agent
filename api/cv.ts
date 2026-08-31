import type { IncomingMessage, ServerResponse } from "node:http";
import { readJson, writeJson, STORAGE_KEYS } from "../src/storage.js";
import type { CV } from "../src/types.js";
import { MAX_CV_LENGTH, lengthError } from "../src/limits.js";

type VercelRequest = IncomingMessage & { body?: unknown };
type VercelResponse = ServerResponse<IncomingMessage> & {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

function sendJson(response: VercelResponse, statusCode: number, body: unknown): void {
  if (typeof response.status === "function" && typeof response.json === "function") {
    response.status(statusCode).json(body);
    return;
  }
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function getRequestBody(request: VercelRequest): Promise<unknown> {
  if (request.body !== undefined) {
    return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  }
  let rawBody = "";
  for await (const chunk of request) rawBody += chunk;
  return rawBody ? JSON.parse(rawBody) : {};
}

const EMPTY_CV: CV = { rawText: "", updatedAt: new Date(0).toISOString() };

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method === "GET") {
    try {
      const stored = await readJson<CV>(STORAGE_KEYS.cv);
      sendJson(response, 200, stored ?? EMPTY_CV);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load CV.";
      sendJson(response, 500, { error: message });
    }
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await getRequestBody(request);
      const rawText = typeof (body as { rawText?: unknown })?.rawText === "string"
        ? (body as { rawText: string }).rawText
        : null;

      if (rawText === null || rawText.trim().length === 0) {
        sendJson(response, 400, { error: "Please provide non-empty CV text." });
        return;
      }
      if (rawText.length > MAX_CV_LENGTH) {
        sendJson(response, 400, { error: lengthError("CV", MAX_CV_LENGTH) });
        return;
      }

      const updated: CV = { rawText, updatedAt: new Date().toISOString() };
      await writeJson(STORAGE_KEYS.cv, updated);
      sendJson(response, 200, updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save CV.";
      sendJson(response, 400, { error: message });
    }
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}