import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { executeJobMatchingTool } from "./jobMatchingTool.js";
const port = Number(process.env.PORT ?? 3000);
const htmlPath = new URL("../public/index.html", import.meta.url);
const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(await readFile(htmlPath, "utf8"));
        return;
    }
    if (request.method === "POST" && request.url === "/api/match") {
        try {
            let body = "";
            for await (const chunk of request)
                body += chunk;
            const result = await executeJobMatchingTool(JSON.parse(body));
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify(result));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "The job could not be analyzed.";
            response.writeHead(400, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: message }));
        }
        return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
});
server.listen(port, () => {
    console.log(`Job Scout UI running at http://localhost:${port}`);
});
