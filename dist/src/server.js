import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { executeJobMatchingTool } from "./jobMatchingTool.js";
import { streamQualificationChunks } from "./qualifyAgent.js";
import { readJson, writeJson, STORAGE_KEYS } from "./storage.js";
import { analyzeJobMatch } from "./enhancedJobMatching.js";
import { tailorCvForJob } from "./tailoringAgent.js";
import { DEFAULT_PROFILE, } from "./types.js";
import { MAX_JOB_POSTING_LENGTH, MAX_CHAT_MESSAGE_LENGTH, MAX_CV_LENGTH, truncateHistory, lengthError, } from "./limits.js";
const port = Number(process.env.PORT ?? 3000);
const htmlPath = new URL("../../index.html", import.meta.url);
function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
async function readBody(request) {
    let raw = "";
    for await (const chunk of request)
        raw += chunk;
    return raw ? JSON.parse(raw) : {};
}
function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
}
const server = createServer(async (request, response) => {
    const url = request.url ?? "/";
    // ---------------- Static shell ----------------
    if (request.method === "GET" && url === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(await readFile(htmlPath, "utf8"));
        return;
    }
    // ---------------- Existing one-shot job match (unchanged) ----------------
    if (request.method === "POST" && url === "/api/match") {
        try {
            const result = await executeJobMatchingTool(await readBody(request));
            sendJson(response, 200, result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "The job could not be analyzed.";
            sendJson(response, 400, { error: message });
        }
        return;
    }
    // ---------------- Streaming qualification chat (extended with context) ----------------
    if (request.method === "POST" && url === "/api/qualify") {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            sendJson(response, 500, { error: "Server is missing GEMINI_API_KEY" });
            return;
        }
        try {
            const body = (await readBody(request));
            const rawMessages = Array.isArray(body.messages) ? body.messages : [];
            if (rawMessages.length === 0) {
                sendJson(response, 400, { error: "messages array is required" });
                return;
            }
            const oversized = rawMessages.find((m) => (m.content?.length ?? 0) > MAX_CHAT_MESSAGE_LENGTH);
            if (oversized) {
                sendJson(response, 400, { error: lengthError("Chat message", MAX_CHAT_MESSAGE_LENGTH) });
                return;
            }
            const messages = truncateHistory(rawMessages);
            let context;
            try {
                const [profile, cv, savedJobs] = await Promise.all([
                    readJson(STORAGE_KEYS.profile),
                    readJson(STORAGE_KEYS.cv),
                    body.jobId ? readJson(STORAGE_KEYS.savedJobs) : Promise.resolve(null),
                ]);
                const selectedJob = body.jobId ? (savedJobs ?? []).find((j) => j.id === body.jobId) : undefined;
                context = {
                    profile: profile ?? undefined,
                    cv: cv ?? undefined,
                    selectedJob: selectedJob?.job,
                    jobMatch: selectedJob?.match,
                };
            }
            catch (contextError) {
                console.error("Could not load chat context:", contextError);
            }
            response.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
            });
            let clientAborted = false;
            request.on("close", () => {
                clientAborted = true;
            });
            for await (const chunk of streamQualificationChunks(messages, apiKey, context)) {
                if (clientAborted || response.writableEnded)
                    break;
                response.write(chunk);
            }
            if (!response.writableEnded)
                response.end();
        }
        catch (error) {
            console.error("Gemini streaming error:", error);
            if (!response.headersSent) {
                sendJson(response, 400, { error: "The assistant could not respond right now." });
            }
            else if (!response.writableEnded) {
                response.end();
            }
        }
        return;
    }
    // ---------------- Profile ----------------
    if (url === "/api/profile") {
        if (request.method === "GET") {
            try {
                const stored = await readJson(STORAGE_KEYS.profile);
                sendJson(response, 200, stored ?? DEFAULT_PROFILE);
            }
            catch (error) {
                sendJson(response, 500, { error: error instanceof Error ? error.message : "Could not load profile." });
            }
            return;
        }
        if (request.method === "POST") {
            try {
                const body = (await readBody(request));
                const existing = (await readJson(STORAGE_KEYS.profile)) ?? DEFAULT_PROFILE;
                const updated = {
                    targetRoles: Array.isArray(body.targetRoles) ? body.targetRoles : existing.targetRoles,
                    experienceLevel: typeof body.experienceLevel === "string" ? body.experienceLevel : existing.experienceLevel,
                    preferredLocation: typeof body.preferredLocation === "string" ? body.preferredLocation : existing.preferredLocation,
                    workArrangement: body.workArrangement === "remote" ||
                        body.workArrangement === "hybrid" ||
                        body.workArrangement === "onsite" ||
                        body.workArrangement === "any"
                        ? body.workArrangement
                        : existing.workArrangement,
                    skills: Array.isArray(body.skills) ? body.skills : existing.skills,
                    otherPreferences: typeof body.otherPreferences === "string" ? body.otherPreferences : existing.otherPreferences,
                    updatedAt: new Date().toISOString(),
                };
                await writeJson(STORAGE_KEYS.profile, updated);
                sendJson(response, 200, updated);
            }
            catch (error) {
                sendJson(response, 400, { error: error instanceof Error ? error.message : "Could not save profile." });
            }
            return;
        }
        sendJson(response, 405, { error: "Method not allowed" });
        return;
    }
    // ---------------- CV ----------------
    if (url === "/api/cv") {
        if (request.method === "GET") {
            try {
                const stored = await readJson(STORAGE_KEYS.cv);
                sendJson(response, 200, stored ?? { rawText: "", updatedAt: new Date(0).toISOString() });
            }
            catch (error) {
                sendJson(response, 500, { error: error instanceof Error ? error.message : "Could not load CV." });
            }
            return;
        }
        if (request.method === "POST") {
            try {
                const body = (await readBody(request));
                if (!body.rawText || !body.rawText.trim()) {
                    sendJson(response, 400, { error: "Please provide non-empty CV text." });
                    return;
                }
                if (body.rawText.length > MAX_CV_LENGTH) {
                    sendJson(response, 400, { error: lengthError("CV", MAX_CV_LENGTH) });
                    return;
                }
                const updated = { rawText: body.rawText, updatedAt: new Date().toISOString() };
                await writeJson(STORAGE_KEYS.cv, updated);
                sendJson(response, 200, updated);
            }
            catch (error) {
                sendJson(response, 400, { error: error instanceof Error ? error.message : "Could not save CV." });
            }
            return;
        }
        sendJson(response, 405, { error: "Method not allowed" });
        return;
    }
    // ---------------- Saved jobs (shortlist) ----------------
    if (url === "/api/jobs") {
        if (request.method === "GET") {
            try {
                const savedJobs = (await readJson(STORAGE_KEYS.savedJobs)) ?? [];
                sendJson(response, 200, savedJobs);
            }
            catch (error) {
                sendJson(response, 500, { error: error instanceof Error ? error.message : "Could not load saved jobs." });
            }
            return;
        }
        if (request.method === "POST") {
            try {
                const body = (await readBody(request));
                if (!body.job || !body.match) {
                    sendJson(response, 400, { error: "A job and match analysis are required to save a job." });
                    return;
                }
                const savedJobs = (await readJson(STORAGE_KEYS.savedJobs)) ?? [];
                const newSavedJob = {
                    id: generateId("job"),
                    job: body.job,
                    match: body.match,
                    savedAt: new Date().toISOString(),
                };
                savedJobs.unshift(newSavedJob);
                await writeJson(STORAGE_KEYS.savedJobs, savedJobs);
                sendJson(response, 200, newSavedJob);
            }
            catch (error) {
                sendJson(response, 400, { error: error instanceof Error ? error.message : "Could not save the job." });
            }
            return;
        }
        if (request.method === "DELETE") {
            try {
                const body = (await readBody(request));
                if (!body.id) {
                    sendJson(response, 400, { error: "A job id is required to remove a saved job." });
                    return;
                }
                const savedJobs = (await readJson(STORAGE_KEYS.savedJobs)) ?? [];
                await writeJson(STORAGE_KEYS.savedJobs, savedJobs.filter((j) => j.id !== body.id));
                sendJson(response, 200, { ok: true });
            }
            catch (error) {
                sendJson(response, 400, { error: error instanceof Error ? error.message : "Could not remove the job." });
            }
            return;
        }
        sendJson(response, 405, { error: "Method not allowed" });
        return;
    }
    // ---------------- Full profile+CV-aware analysis ----------------
    if (request.method === "POST" && url === "/api/analyze") {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            sendJson(response, 500, { error: "Server is missing GEMINI_API_KEY." });
            return;
        }
        try {
            const body = (await readBody(request));
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
                id: generateId("raw"),
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
            sendJson(response, 400, { error: error instanceof Error ? error.message : "The job could not be analyzed." });
        }
        return;
    }
    // ---------------- CV tailoring ----------------
    if (request.method === "POST" && url === "/api/tailor") {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            sendJson(response, 500, { error: "Server is missing GEMINI_API_KEY." });
            return;
        }
        try {
            const body = (await readBody(request));
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
                id: generateId("tailored"),
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
            sendJson(response, 400, { error: error instanceof Error ? error.message : "The CV could not be tailored." });
        }
        return;
    }
    sendJson(response, 404, { error: "Not found" });
});
server.listen(port, () => {
    console.log(`Job Scout UI running at http://localhost:${port}`);
});
// Exported so integration tests can start this module on an ephemeral
// port and close it cleanly afterwards. Purely additive — no runtime
// behavior changes for the deployed/local-dev app.
export { server };
