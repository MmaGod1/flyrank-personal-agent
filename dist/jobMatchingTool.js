import { z } from "zod";
import { evaluateJob } from "./agent.js";
export const jobMatchingInputSchema = z.object({
    jobPosting: z.string().trim().min(1, "Paste a job posting before analyzing it.")
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
