import { z } from "zod";
import { evaluateJob } from "./agent.js";
import { MAX_JOB_POSTING_LENGTH } from "./limits.js";
// FE-11 production hygiene: the only change in this file vs. the original
// is adding .max(...) below, so a single request can't send an unbounded
// job posting to Gemini. evaluateJob()/agent.ts are untouched.
export const jobMatchingInputSchema = z.object({
    jobPosting: z
        .string()
        .trim()
        .min(1, "Paste a job posting before analyzing it.")
        .max(MAX_JOB_POSTING_LENGTH, `Job posting is too long (max ${MAX_JOB_POSTING_LENGTH.toLocaleString()} characters).`)
});
export const jobMatchingOutputSchema = z.object({
    matchLevel: z.enum(["strong", "partial", "poor", "unclear"]),
    reasons: z.array(z.string()),
    relevantRequirements: z.array(z.string()),
    missingRequirements: z.array(z.string())
});
export async function executeJobMatchingTool(input) {
    const validatedInput = jobMatchingInputSchema.parse(input);
    const result = await evaluateJob(validatedInput.jobPosting);
    return jobMatchingOutputSchema.parse(result);
}
