import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { executeJobMatchingTool } from "./jobMatchingTool.js";
import { streamQualificationChunks, type ChatMessage } from "./qualifyAgent.js";

const port = Number(process.env.PORT ?? 3000);
const htmlPath = new URL("../../public/index.html", import.meta.url);

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(await readFile(htmlPath, "utf8"));
    return;
  }

  if (request.method === "POST" && request.url === "/api/match") {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      const result = await executeJobMatchingTool(JSON.parse(body));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The job could not be analyzed.";
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: message }));
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/qualify") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Server is missing GEMINI_API_KEY" }));
      return;
    }

    let body = "";
    try {
      for await (const chunk of request) body += chunk;
      const parsed = JSON.parse(body) as { messages?: ChatMessage[] };
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];

      if (messages.length === 0) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "messages array is required" }));
        return;
      }

      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      });

      let clientAborted = false;
      request.on("close", () => {
        clientAborted = true;
      });

      for await (const chunk of streamQualificationChunks(messages, apiKey)) {
        if (clientAborted || response.writableEnded) break;
        response.write(chunk);
      }
      if (!response.writableEnded) response.end();
    } catch (error) {
      console.error("Gemini streaming error:", error);
      if (!response.headersSent) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "The assistant could not respond right now." }));
      } else if (!response.writableEnded) {
        response.end();
      }
    }
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, () => {
  console.log(`Job Scout UI running at http://localhost:${port}`);
});