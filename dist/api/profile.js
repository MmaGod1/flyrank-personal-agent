import { readJson, writeJson, STORAGE_KEYS } from "../src/storage.js";
import { DEFAULT_PROFILE } from "../src/types.js";
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
function isValidProfilePayload(value) {
    return typeof value === "object" && value !== null;
}
export default async function handler(request, response) {
    if (request.method === "GET") {
        try {
            const stored = await readJson(STORAGE_KEYS.profile);
            sendJson(response, 200, stored ?? DEFAULT_PROFILE);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Could not load profile.";
            sendJson(response, 500, { error: message });
        }
        return;
    }
    if (request.method === "POST") {
        try {
            const body = await getRequestBody(request);
            if (!isValidProfilePayload(body)) {
                sendJson(response, 400, { error: "Invalid profile payload." });
                return;
            }
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
            const message = error instanceof Error ? error.message : "Could not save profile.";
            sendJson(response, 400, { error: message });
        }
        return;
    }
    sendJson(response, 405, { error: "Method not allowed" });
}
