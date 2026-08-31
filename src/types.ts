/**
 * Shared data models for the FL-06 Job Scout & CV Tailor milestone.
 * Kept in one file so every module (storage, API routes, matching,
 * tailoring) imports the same shapes instead of redefining them.
 */

export interface UserProfile {
  targetRoles: string[];
  experienceLevel: string; // e.g. "internship", "junior", "mid", "senior"
  preferredLocation: string;
  workArrangement: "remote" | "hybrid" | "onsite" | "any";
  skills: string[];
  otherPreferences: string;
  updatedAt: string; // ISO timestamp
}

export const DEFAULT_PROFILE: UserProfile = {
  targetRoles: ["Frontend Developer", "Frontend Developer Intern"],
  experienceLevel: "internship / junior",
  preferredLocation: "Remote",
  workArrangement: "remote",
  skills: [
    "HTML",
    "CSS",
    "JavaScript",
    "React",
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "Git & GitHub",
  ],
  otherPreferences: "",
  updatedAt: new Date(0).toISOString(),
};

export interface CV {
  rawText: string;
  updatedAt: string; // ISO timestamp
}

export interface Job {
  id: string;
  title: string;
  company?: string;
  location?: string;
  url?: string;
  description: string;
  source: string; // e.g. "manual-paste"
  collectedAt: string; // ISO timestamp
}

export type MatchLevel = "strong" | "partial" | "poor" | "unclear";

export interface JobMatch {
  matchLevel: MatchLevel;
  matchEstimateLabel: string; // human-readable, explicitly labeled as an estimate
  summary: string;
  whyItMatches: string[];
  requirementsMet: string[];
  requirementsUnclear: string[];
  requirementsMissing: string[];
  skillGaps: string[];
  experienceConcern: string; // empty string if none
  locationConcern: string; // empty string if none
  otherConcerns: string[];
  recommendation: string;
}

export interface SavedJob {
  id: string;
  job: Job;
  match: JobMatch;
  savedAt: string; // ISO timestamp
}

export interface TailoredCV {
  id: string;
  jobId: string;
  jobTitle: string;
  tailoredText: string; // rewritten/reorganized CV content, factually faithful
  gaps: string[]; // requirements the CV does not demonstrate
  createdAt: string; // ISO timestamp
}