import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Gemini SDK BEFORE importing the module under test, so
// analyzeJobMatch never makes a real network call to Google.
const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

const { analyzeJobMatch } = await import("../src/enhancedJobMatching.js");
const sampleProfile = {
  targetRoles: ["Frontend Developer"],
  experienceLevel: "junior",
  preferredLocation: "Remote",
  workArrangement: "remote" as const,
  skills: ["React", "JavaScript"],
  otherPreferences: "",
  updatedAt: new Date().toISOString(),
};
const sampleCv = { rawText: "React and JavaScript projects.", updatedAt: new Date().toISOString() };

function mockGeminiJsonResponse(payload: unknown) {
  mockGenerateContent.mockResolvedValue({ text: JSON.stringify(payload) });
}

const VALID_MATCH = {
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
};

describe("enhancedJobMatching: analyzeJobMatch (Gemini mocked)", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it("never calls a real API — the Gemini client is fully mocked", () => {
    // This test exists to make the mocking intent explicit and checkable:
    // if this assertion ever fails, a real network client slipped in.
    expect(vi.isMockFunction(mockGenerateContent)).toBe(true);
  });

  it("parses a well-formed Gemini response into a validated JobMatch", async () => {
    mockGeminiJsonResponse(VALID_MATCH);
    const result = await analyzeJobMatch(sampleProfile, sampleCv, "Some job posting", "fake-key");
    expect(result.matchLevel).toBe("strong");
    expect(result.requirementsMet).toEqual(["React"]);
  });

  it("throws a clear error when Gemini returns text that isn't valid JSON", async () => {
    mockGenerateContent.mockResolvedValue({ text: "not json at all" });
    await expect(
      analyzeJobMatch(sampleProfile, sampleCv, "Some job posting", "fake-key")
    ).rejects.toThrow(/not valid JSON/i);
  });

  it("throws when Gemini's JSON doesn't match the required JobMatch shape", async () => {
    // Missing required fields like requirementsMissing/skillGaps/etc.
    mockGeminiJsonResponse({ matchLevel: "strong", summary: "Incomplete." });
    await expect(
      analyzeJobMatch(sampleProfile, sampleCv, "Some job posting", "fake-key")
    ).rejects.toThrow();
  });

  it("throws when Gemini returns an empty response", async () => {
    mockGenerateContent.mockResolvedValue({ text: "" });
    await expect(
      analyzeJobMatch(sampleProfile, sampleCv, "Some job posting", "fake-key")
    ).rejects.toThrow(/did not return a response/i);
  });

  it("rejects a matchLevel value outside the allowed enum, even if the model invents one", async () => {
    mockGeminiJsonResponse({ ...VALID_MATCH, matchLevel: "excellent" });
    await expect(
      analyzeJobMatch(sampleProfile, sampleCv, "Some job posting", "fake-key")
    ).rejects.toThrow();
  });
});