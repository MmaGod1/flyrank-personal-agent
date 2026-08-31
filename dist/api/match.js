import { executeJobMatchingTool } from "../src/jobMatchingTool.js";
// FE-11: the only change in this file vs. the original is this maxDuration
// export, capping how long this Gemini-calling function may run.
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
    return JSON.parse(rawBody);
}
export default async function handler(request, response) {
    if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
    }
    try {
        const result = await executeJobMatchingTool(await getRequestBody(request));
        sendJson(response, 200, result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "The job could not be analyzed.";
        sendJson(response, 400, { error: message });
    }
}
