import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
/**
 * Extended job matching for FL-06: compares a job against the user's
 * profile AND actual CV content (not just fixed preferences), producing
 * a detailed, honest breakdown rather than a single opaque score.
 *
 * Kept separate from src/jobMatchingTool.ts (the original one-shot
 * job-posting analyzer) rather than modifying it, since that file calls
 * into src/agent.ts, whose internals this project's assistant has not
 * inspected. This avoids risking the existing, working analysis feature.
 */
export const GEMINI_MODEL = "models/gemini-3.6-flash";
const HALLUCINATION_GUARD = `
CRITICAL RULE — you must follow this exactly:
You may only claim skills, experience, qualifications, achievements, and
responsibilities that are directly supported by the CANDIDATE CV text given
to you below. If the job requires something the CV does not demonstrate,
you must list it as a gap/missing requirement, even if it seems like a
"related" or "similar" skill. For example, if the CV shows JavaScript but
the job requires TypeScript, TypeScript is a gap — do not treat JavaScript
experience as evidence of TypeScript experience. Never invent or infer
professional experience as fact. If something is genuinely ambiguous from
the CV, put it under "requirementsUnclear", not "requirementsMet".
`.trim();
const SYSTEM_PROMPT = `
You are a job-matching analyst helping a candidate evaluate a specific job
opportunity against their real profile and CV.

${HALLUCINATION_GUARD}

Do not recommend a role just because its title contains a matching word
(e.g. do not treat "Senior Frontend Developer" as a good match for a
candidate targeting junior/internship roles just because "Frontend
Developer" appears in the title).

CRITICAL RULE — location and eligibility gate the overall match level:
Skill/technology fit alone must never produce "strong" if the job's
location, work arrangement, or legal work-eligibility requirement is not
clearly satisfied by the candidate's profile. Specifically:
- If the job requires being on-site/hybrid in a specific place, and the
  candidate's profile does not clearly indicate they are based there or
  willing/able to relocate, this is a real gating concern, not a footnote.
- If the job states a legal right-to-work requirement tied to a country
  the candidate's profile doesn't confirm, treat this as unresolved, not
  assumed-fine.
- In either case: set "locationConcern" to a clear, specific sentence
  explaining the issue, and cap "matchLevel" at "partial" at best (use
  "poor" if the mismatch is severe, e.g. a different continent with no
  remote option). Do NOT return "strong" while requirementsMissing
  contains an unresolved location/eligibility item — that combination is
  self-contradictory and must not happen.

Respond with ONLY a single JSON object, no markdown fences, no commentary,
matching exactly this shape:

{
  "matchLevel": "strong" | "partial" | "poor" | "unclear",
  "matchEstimateLabel": string,   // e.g. "Estimated match: Strong (AI estimate, not precise)"
  "summary": string,              // 2-3 sentence plain-English overview
  "whyItMatches": string[],       // reasons supporting the match, empty array if none
  "requirementsMet": string[],    // job requirements the CV clearly supports
  "requirementsUnclear": string[],// requirements the CV doesn't clearly confirm or deny
  "requirementsMissing": string[],// requirements the CV does not support
  "skillGaps": string[],          // specific missing technologies/skills
  "experienceConcern": string,    // empty string "" if no experience-level concern
  "locationConcern": string,      // empty string "" if no location/work-arrangement concern
  "otherConcerns": string[],      // anything else worth flagging, empty array if none
  "recommendation": string        // one clear, honest next-step recommendation
}
`.trim();
const jobMatchSchema = z.object({
    matchLevel: z.enum(["strong", "partial", "poor", "unclear"]),
    matchEstimateLabel: z.string(),
    summary: z.string(),
    whyItMatches: z.array(z.string()),
    requirementsMet: z.array(z.string()),
    requirementsUnclear: z.array(z.string()),
    requirementsMissing: z.array(z.string()),
    skillGaps: z.array(z.string()),
    experienceConcern: z.string(),
    locationConcern: z.string(),
    otherConcerns: z.array(z.string()),
    recommendation: z.string(),
});
function buildUserPrompt(profile, cv, jobDescription) {
    return `
CANDIDATE PROFILE:
Target roles: ${profile.targetRoles.join(", ") || "(not specified)"}
Experience level: ${profile.experienceLevel || "(not specified)"}
Preferred location: ${profile.preferredLocation || "(not specified)"}
Work arrangement: ${profile.workArrangement}
Known skills (from profile): ${profile.skills.join(", ") || "(not specified)"}
Other preferences: ${profile.otherPreferences || "(none)"}

CANDIDATE CV (source of truth for skills/experience — do not go beyond this):
"""
${cv.rawText || "(no CV provided yet)"}
"""

JOB POSTING:
"""
${jobDescription}
"""

Analyze this job against the candidate's profile and CV, following the
system instructions exactly. Return only the JSON object.
`.trim();
}
export async function analyzeJobMatch(profile, cv, jobDescription, apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(profile, cv, jobDescription) }] }],
        config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
        },
    });
    const text = response.text;
    if (!text) {
        throw new Error("The assistant did not return a response.");
    }
    let parsedJson;
    try {
        parsedJson = JSON.parse(text);
    }
    catch {
        throw new Error("The assistant's response was not valid JSON.");
    }
    return jobMatchSchema.parse(parsedJson);
}
