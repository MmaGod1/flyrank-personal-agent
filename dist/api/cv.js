import { readJson, writeJson, STORAGE_KEYS } from "../src/storage.js";
import { MAX_CV_LENGTH, lengthError } from "../src/limits.js";
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
const EMPTY_CV = { rawText: "", updatedAt: new Date(0).toISOString() };
export default async function handler(request, response) {
    if (request.method === "GET") {
        try {
            const stored = await readJson(STORAGE_KEYS.cv);
            sendJson(response, 200, stored ?? EMPTY_CV);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Could not load CV.";
            sendJson(response, 500, { error: message });
        }
        return;
    }
    if (request.method === "POST") {
        try {
            const body = await getRequestBody(request);
            const rawText = typeof body?.rawText === "string"
                ? body.rawText
                : null;
            if (rawText === null || rawText.trim().length === 0) {
                sendJson(response, 400, { error: "Please provide non-empty CV text." });
                return;
            }
            if (rawText.length > MAX_CV_LENGTH) {
                sendJson(response, 400, { error: lengthError("CV", MAX_CV_LENGTH) });
                return;
            }
            const updated = { rawText, updatedAt: new Date().toISOString() };
            await writeJson(STORAGE_KEYS.cv, updated);
            sendJson(response, 200, updated);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Could not save CV.";
            sendJson(response, 400, { error: message });
        }
        return;
    }
    sendJson(response, 405, { error: "Method not allowed" });
}
