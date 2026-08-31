import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";

// In-memory fake of src/storage.ts so integration tests never touch real
// disk or Vercel Blob, and are fully isolated/deterministic.
const memoryStore = new Map<string, unknown>();
vi.mock("../src/storage.js", () => ({
  readJson: vi.fn(async (key: string) => (memoryStore.has(key) ? memoryStore.get(key) : null)),
  writeJson: vi.fn(async (key: string, data: unknown) => {
    memoryStore.set(key, data);
  }),
  STORAGE_KEYS: {
    profile: "job-scout/profile.json",
    cv: "job-scout/cv.json",
    savedJobs: "job-scout/saved-jobs.json",
    tailoredCvs: "job-scout/tailored-cvs.json",
  },
}));

// Mock every Gemini-touching module server.ts imports, so this test suite
// can never make a real API call, regardless of which route is hit.
const mockAnalyzeJobMatch = vi.fn();
vi.mock("../src/enhancedJobMatching.js", () => ({
  analyzeJobMatch: mockAnalyzeJobMatch,
}));

vi.mock("../src/tailoringAgent.js", () => ({
  tailorCvForJob: vi.fn(async () => ({ tailoredText: "mock", gaps: [] })),
}));

const mockStreamChunks = vi.fn();
vi.mock("../src/qualifyAgent.js", () => ({
  streamQualificationChunks: mockStreamChunks,
}));

vi.mock("../src/jobMatchingTool.js", () => ({
  executeJobMatchingTool: vi.fn(async () => ({
    matchLevel: "unclear",
    reasons: [],
    relevantRequirements: [],
    missingRequirements: [],
  })),
}));

process.env.PORT = "0"; // ephemeral port, avoids clashing with a real dev server
process.env.GEMINI_API_KEY = "test-key-not-real";

let baseUrl: string;
let serverInstance: import("node:http").Server;

beforeAll(async () => {
  const mod = await import("../src/server.js");
  serverInstance = mod.server;
  await new Promise<void>((resolve) => {
    if (serverInstance.listening) return resolve();
    serverInstance.once("listening", () => resolve());
  });
  const address = serverInstance.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  serverInstance.close();
});

describe("server: CV validation (validated form flow)", () => {
  it("rejects an empty CV submission with a clear 400 error", async () => {
    const response = await fetch(`${baseUrl}/api/cv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "   " }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/non-empty/i);
  });

  it("rejects a CV submission longer than the FE-11 max length", async () => {
    const response = await fetch(`${baseUrl}/api/cv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "x".repeat(25_000) }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/too long/i);
  });

  it("accepts a valid CV and persists it, readable back via GET", async () => {
    const postResponse = await fetch(`${baseUrl}/api/cv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: "Experienced with React and JavaScript." }),
    });
    expect(postResponse.status).toBe(200);

    const getResponse = await fetch(`${baseUrl}/api/cv`);
    const cv = await getResponse.json();
    expect(cv.rawText).toBe("Experienced with React and JavaScript.");
  });
});

describe("server: /api/analyze (job-analysis tool-result flow, Gemini mocked)", () => {
  it("refuses to analyze when no CV has been saved yet", async () => {
    memoryStore.delete("job-scout/cv.json");
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobPosting: "Junior Frontend Developer role." }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/add your cv/i);
  });

  it("returns a structured job + match result once a CV exists, without calling the real Gemini API", async () => {
    memoryStore.set("job-scout/cv.json", { rawText: "React developer.", updatedAt: new Date().toISOString() });
    mockAnalyzeJobMatch.mockResolvedValue({
      matchLevel: "strong",
      matchEstimateLabel: "Estimated match: Strong (AI estimate)",
      summary: "Good fit.",
      whyItMatches: ["React matches"],
      requirementsMet: ["React"],
      requirementsUnclear: [],
      requirementsMissing: [],
      skillGaps: [],
      experienceConcern: "",
      locationConcern: "",
      otherConcerns: [],
      recommendation: "Apply.",
    });

    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobPosting: "Junior Frontend Developer, React required.", title: "Junior FE Dev" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job.title).toBe("Junior FE Dev");
    expect(body.match.matchLevel).toBe("strong");
    expect(mockAnalyzeJobMatch).toHaveBeenCalledTimes(1);
  });

  it("rejects a job posting longer than the FE-11 max length before ever calling Gemini", async () => {
    mockAnalyzeJobMatch.mockClear();
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobPosting: "x".repeat(25_000) }),
    });
    expect(response.status).toBe(400);
    expect(mockAnalyzeJobMatch).not.toHaveBeenCalled();
  });
});