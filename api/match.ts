import type { IncomingMessage, ServerResponse } from "node:http";
import { executeJobMatchingTool } from "../src/jobMatchingTool.js";

type VercelRequest = IncomingMessage & {
  body?: unknown;
};

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
  return JSON.parse(rawBody);
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const result = await executeJobMatchingTool(await getRequestBody(request));
    sendJson(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The job could not be analyzed.";
    sendJson(response, 400, { error: message });
  }
}
