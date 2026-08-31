import { readJson, STORAGE_KEYS } from "../src/storage.js";
import { analyzeJobMatch } from "../src/enhancedJobMatching.js";
import { DEFAULT_PROFILE } from "../src/types.js";
import { MAX_JOB_POSTING_LENGTH, lengthError } from "../src/limits.js";
// FE-11: this calls Gemini once with a full job posting + CV + profile —
// cap the function's max runtime so a slow/stuck call can't hang.
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
    return `raw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
/**
 * POST /api/analyze
 * New, profile+CV-aware job analysis endpoint. Deliberately separate from
 * the existing /api/match (one-shot, fixed-preference analysis) rather
 * than modifying it, since /api/match depends on src/agent.ts which this
 * change does not touch or assume the internals of.
 *
 * Body: { jobPosting: string, title?: string, company?: string, location?: string, url?: string }
 * Returns: { job: Job, match: JobMatch }
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
        const jobPosting = typeof body.jobPosting === "string" ? body.jobPosting.trim() : "";
        if (!jobPosting) {
            sendJson(response, 400, { error: "Paste a job posting before analyzing it." });
            return;
        }
        if (jobPosting.length > MAX_JOB_POSTING_LENGTH) {
            sendJson(response, 400, { error: lengthError("Job posting", MAX_JOB_POSTING_LENGTH) });
            return;
        }
        const [profile, cv] = await Promise.all([
            readJson(STORAGE_KEYS.profile),
            readJson(STORAGE_KEYS.cv),
        ]);
        const effectiveProfile = profile ?? DEFAULT_PROFILE;
        const effectiveCv = cv ?? { rawText: "", updatedAt: new Date(0).toISOString() };
        if (!effectiveCv.rawText.trim()) {
            sendJson(response, 400, {
                error: "Add your CV before running a full analysis, so the match reflects your actual experience.",
            });
            return;
        }
        const match = await analyzeJobMatch(effectiveProfile, effectiveCv, jobPosting, apiKey);
        const job = {
            id: generateId(),
            title: body.title || "Untitled role",
            company: body.company || undefined,
            location: body.location || undefined,
            url: body.url || undefined,
            description: jobPosting,
            source: "manual-paste",
            collectedAt: new Date().toISOString(),
        };
        sendJson(response, 200, { job, match });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "The job could not be analyzed.";
        sendJson(response, 400, { error: message });
    }
}
