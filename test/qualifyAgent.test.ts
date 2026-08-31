import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/qualifyAgent.js";
import type { UserProfile, CV, Job, JobMatch } from "../src/types.js";

const sampleProfile: UserProfile = {
  targetRoles: ["Frontend Developer"],
  experienceLevel: "junior",
  preferredLocation: "Remote",
  workArrangement: "remote",
  skills: ["JavaScript", "React"],
  otherPreferences: "",
  updatedAt: new Date().toISOString(),
};

const sampleCv: CV = {
  rawText: "Built several React apps. Comfortable with JavaScript and HTML/CSS.",
  updatedAt: new Date().toISOString(),
};

const sampleJob: Job = {
  id: "job_1",
  title: "Junior Frontend Developer",
  company: "Acme",
  location: "New York, USA",
  description: "On-site role requiring React and TypeScript.",
  source: "manual-paste",
  collectedAt: new Date().toISOString(),
};

const sampleMatch: JobMatch = {
  matchLevel: "partial",
  matchEstimateLabel: "Estimated match: Partial (AI estimate)",
  summary: "Good skill overlap but location is on-site only.",
  whyItMatches: ["React experience matches"],
  requirementsMet: ["React"],
  requirementsUnclear: [],
  requirementsMissing: ["TypeScript"],
  skillGaps: ["TypeScript"],
  experienceConcern: "",
  locationConcern: "Role is on-site in New York; candidate profile is remote-only.",
  otherConcerns: [],
  recommendation: "Clarify relocation before proceeding.",
};

describe("qualifyAgent: buildSystemPrompt", () => {
  it("always includes the base qualification instructions and safety guards", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("job qualification assistant");
    expect(prompt.toLowerCase()).toContain("cv honesty");
    expect(prompt.toLowerCase()).toContain("no external actions");
  });

  it("omits profile/CV/job sections entirely when no context is given", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain("USER PROFILE");
    expect(prompt).not.toContain("SELECTED JOB");
  });

  it("includes the user's actual skills and experience level when a profile is provided", () => {
    const prompt = buildSystemPrompt({ profile: sampleProfile });
    expect(prompt).toContain("USER PROFILE");
    expect(prompt).toContain("JavaScript, React");
    expect(prompt).toContain("junior");
  });

  it("includes the raw CV text verbatim so the model can't go beyond it", () => {
    const prompt = buildSystemPrompt({ cv: sampleCv });
    expect(prompt).toContain("USER CV");
    expect(prompt).toContain(sampleCv.rawText);
  });

  it("includes the selected job's title and description when discussing a specific job", () => {
    const prompt = buildSystemPrompt({ selectedJob: sampleJob });
    expect(prompt).toContain("SELECTED JOB");
    expect(prompt).toContain("Junior Frontend Developer");
    expect(prompt).toContain("On-site role requiring React and TypeScript.");
  });

  it("includes prior match analysis (gaps and concerns) when available, not just the raw job", () => {
    const prompt = buildSystemPrompt({ selectedJob: sampleJob, jobMatch: sampleMatch });
    expect(prompt).toContain("EXISTING MATCH ANALYSIS");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("on-site in New York");
  });
});