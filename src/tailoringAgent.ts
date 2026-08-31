import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { CV, Job } from "./types.js";

/**
 * CV tailoring for FL-06. Given a job and the candidate's real CV, produces
 * a reworded/reorganized draft that emphasizes relevant existing experience
 * — and a separate, explicit list of gaps. The system prompt forbids
 * inventing anything not already present in the CV.
 */

export const GEMINI_MODEL = "models/gemini-3.6-flash";

const SYSTEM_PROMPT = `
You are a CV-tailoring assistant. You help a candidate adapt their existing
CV for a specific job, without ever inventing information.

You MAY:
- Reorder sections/bullets to lead with the most relevant experience.
- Rewrite wording for clarity and impact.
- Emphasize experience that is genuinely relevant to the job.
- Adapt the professional summary to reference the target role.

You MUST NOT:
- Invent skills, technologies, qualifications, achievements, employers, or
  responsibilities that are not present in the candidate's CV text.
- Claim experience with a technology the CV does not mention, even if a
  related technology is mentioned (e.g. JavaScript in the CV does not mean
  you may claim TypeScript experience).
- Soften or hide a gap by implying the candidate has something they don't.

Respond with ONLY a single JSON object, no markdown fences, no commentary,
matching exactly this shape:

{
  "tailoredText": string,   // the full tailored CV as plain text, ready to read top to bottom
  "gaps": string[]          // job requirements the CV does not demonstrate, stated plainly
}

If the job requires something the CV does not support, do not weave it into
"tailoredText" — put it only in "gaps".
`.trim();

const tailoredCvSchema = z.object({
  tailoredText: z.string(),
  gaps: z.array(z.string()),
});

function buildUserPrompt(cv: CV, job: Job): string {
  return `
ORIGINAL CV (source of truth — do not go beyond this):
"""
${cv.rawText}
"""

TARGET JOB:
Title: ${job.title}
Company: ${job.company || "(not specified)"}
"""
${job.description}
"""

Produce the tailored CV and gap list, following the system instructions
exactly. Return only the JSON object.
`.trim();
}

export async function tailorCvForJob(
  cv: CV,
  job: Job,
  apiKey: string
): Promise<{ tailoredText: string; gaps: string[] }> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(cv, job) }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("The assistant did not return a response.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("The assistant's response was not valid JSON.");
  }

  return tailoredCvSchema.parse(parsedJson);
}