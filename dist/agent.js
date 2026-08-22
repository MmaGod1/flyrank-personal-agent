import { GoogleGenAI } from "@google/genai";
const preferences = {
    targetRoles: ["internship frontend developer", "junior frontend developer"],
    technologies: ["HTML", "CSS", "JavaScript", "React"],
    experienceLevel: ["internship", "junior"]
};
function getJobPosting() {
    const commandLineInput = process.argv.slice(2).join(" ").trim();
    if (commandLineInput) {
        return commandLineInput;
    }
    return "";
}
function parseMatchResult(value) {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Gemini returned an invalid result.");
    }
    const result = parsed;
    const validMatchLevels = new Set(["strong", "partial", "poor", "unclear"]);
    if (!validMatchLevels.has(result.matchLevel)) {
        throw new Error("Gemini returned an invalid match level.");
    }
    const arrayFields = ["reasons", "relevantRequirements", "missingRequirements"];
    for (const field of arrayFields) {
        if (!Array.isArray(result[field]) || !result[field].every((item) => typeof item === "string")) {
            throw new Error(`Gemini returned an invalid ${field} field.`);
        }
    }
    return {
        matchLevel: result.matchLevel,
        reasons: result.reasons,
        relevantRequirements: result.relevantRequirements,
        missingRequirements: result.missingRequirements
    };
}
async function evaluateJob(jobPosting) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing. Add it as an environment variable before running the agent.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are my personal Job Scout. Evaluate the job posting against my preferences.

Preferences:
${JSON.stringify(preferences, null, 2)}

Job posting:
${jobPosting}

Return only valid JSON with exactly these fields:
{
  "matchLevel": "strong" | "partial" | "poor" | "unclear",
  "reasons": string[],
  "relevantRequirements": string[],
  "missingRequirements": string[]
}

Use "missingRequirements" for requirements or skills explicitly stated in the posting that are not supported by the preferences. Do not invent anything about the candidate, and do not claim that a preference proves the candidate has a skill. Base the evaluation only on the posting and the provided preferences. If the posting is incomplete or ambiguous, use "unclear" and say so in "reasons".`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        const responseText = response.text?.trim();
        if (!responseText) {
            throw new Error("Gemini returned an empty response.");
        }
        return parseMatchResult(responseText);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Gemini error";
        throw new Error(`Gemini request failed: ${message}`);
    }
}
async function main() {
    const jobPosting = getJobPosting();
    if (!jobPosting) {
        console.error("Error: provide a non-empty job posting as a command-line argument.");
        console.error('Example: npm start -- "Junior Frontend Developer internship. Requirements: HTML, CSS, JavaScript and React."');
        process.exitCode = 1;
        return;
    }
    try {
        const result = await evaluateJob(jobPosting);
        console.log(JSON.stringify(result, null, 2));
    }
    catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : "The agent could not evaluate this job."}`);
        process.exitCode = 1;
    }
}
void main();
