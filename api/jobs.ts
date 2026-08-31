import type { IncomingMessage, ServerResponse } from "node:http";
import { readJson, writeJson, STORAGE_KEYS } from "../src/storage.js";
import type { SavedJob, Job, JobMatch } from "../src/types.js";

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

function generateId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * GET    /api/jobs        -> list all saved jobs (the shortlist)
 * POST   /api/jobs        -> save a job { job: Job, match: JobMatch }
 * DELETE /api/jobs        -> remove a job { id: string } (sent as a JSON body,
 *                             not a query string, to keep parsing simple on
 *                             both Vercel and the local raw-http dev server)
 */
export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method === "GET") {
    try {
      const savedJobs = (await readJson<SavedJob[]>(STORAGE_KEYS.savedJobs)) ?? [];
      sendJson(response, 200, savedJobs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load saved jobs.";
      sendJson(response, 500, { error: message });
    }
    return;
  }

  if (request.method === "POST") {
    try {
      const body = (await getRequestBody(request)) as { job?: Job; match?: JobMatch };
      if (!body.job || !body.match) {
        sendJson(response, 400, { error: "A job and match analysis are required to save a job." });
        return;
      }

      const savedJobs = (await readJson<SavedJob[]>(STORAGE_KEYS.savedJobs)) ?? [];
      const newSavedJob: SavedJob = {
        id: generateId(),
        job: body.job,
        match: body.match,
        savedAt: new Date().toISOString(),
      };

      savedJobs.unshift(newSavedJob);
      await writeJson(STORAGE_KEYS.savedJobs, savedJobs);
      sendJson(response, 200, newSavedJob);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the job.";
      sendJson(response, 400, { error: message });
    }
    return;
  }

  if (request.method === "DELETE") {
    try {
      const body = (await getRequestBody(request)) as { id?: string };
      if (!body.id) {
        sendJson(response, 400, { error: "A job id is required to remove a saved job." });
        return;
      }

      const savedJobs = (await readJson<SavedJob[]>(STORAGE_KEYS.savedJobs)) ?? [];
      const filtered = savedJobs.filter((j) => j.id !== body.id);
      await writeJson(STORAGE_KEYS.savedJobs, filtered);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not remove the job.";
      sendJson(response, 400, { error: message });
    }
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}