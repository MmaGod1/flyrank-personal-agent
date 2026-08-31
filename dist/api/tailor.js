import { readJson, writeJson, STORAGE_KEYS } from "../src/storage.js";
import { tailorCvForJob } from "../src/tailoringAgent.js";
// FE-11: this calls Gemini once over the full CV + job text — cap runtime.
export const config = {
    maxDuration: 30,
};
function sendJson(response, statusCode, body) {
    if (typeof response.status === "function" && typeof response.json === "function") {
        response.status(statusCode).json(body);
        return;
    }
    response.writeHead(statusCode, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
}
async function getRequestBody(request) {
    if (request.body !== undefined) {
        return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    }
    let rawBody = "";
    for await (const chunk of request)
        rawBody += chunk;
    return rawBody ? JSON.parse(rawBody) : {};
}
function generateId() {
    return `tailored_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
/**
 * POST /api/tailor
 * Body: { jobId: string } — jobId must reference an already-saved job.
 * Returns: TailoredCV
 */
export default async function handler(request, response) {
    if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        sendJson(response, 500, { error: "Server is missing GEMINI_API_KEY." });
        return;
    }
    try {
        const body = (await getRequestBody(request));
        if (!body.jobId) {
            sendJson(response, 400, { error: "A jobId is required to tailor a CV." });
            return;
        }
        const [cv, savedJobs] = await Promise.all([
            readJson(STORAGE_KEYS.cv),
            readJson(STORAGE_KEYS.savedJobs),
        ]);
        if (!cv || !cv.rawText.trim()) {
            sendJson(response, 400, { error: "Add your CV before tailoring it for a job." });
            return;
        }
        const savedJob = (savedJobs ?? []).find((j) => j.id === body.jobId);
        if (!savedJob) {
            sendJson(response, 404, { error: "That saved job could not be found." });
            return;
        }
        const result = await tailorCvForJob(cv, savedJob.job, apiKey);
        const tailoredCv = {
            id: generateId(),
            jobId: savedJob.id,
            jobTitle: savedJob.job.title,
            tailoredText: result.tailoredText,
            gaps: result.gaps,
            createdAt: new Date().toISOString(),
        };
        const existingDrafts = (await readJson(STORAGE_KEYS.tailoredCvs)) ?? [];
        existingDrafts.unshift(tailoredCv);
        await writeJson(STORAGE_KEYS.tailoredCvs, existingDrafts);
        sendJson(response, 200, tailoredCv);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "The CV could not be tailored.";
        sendJson(response, 400, { error: message });
    }
}
