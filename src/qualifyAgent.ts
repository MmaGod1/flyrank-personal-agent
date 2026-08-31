import { GoogleGenAI } from "@google/genai";
import type { UserProfile, CV, Job, JobMatch } from "./types.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Model configuration and system prompt for the Job Qualification Chat
 * (originally FE-06). Extended for FL-06 to optionally ground the
 * conversation in a specific selected job, the user's stored profile,
 * their CV, and that job's match analysis, so the agent can answer
 * questions like "does my CV demonstrate React?" using real data instead
 * of generic advice.
 */
export const GEMINI_MODEL = "models/gemini-3.6-flash";

const BASE_QUALIFICATION_PROMPT = `
You are a job qualification assistant. Help the user work out whether a
specific job opportunity is a realistic fit for them, through a short,
focused conversation, not a one-shot judgment.

Ask about, in whatever order comes up naturally:
- Location and work arrangement (remote / hybrid / on-site)
- Work eligibility / right-to-work requirements tied to that location
- Role title and seniority
- Required technologies and experience level
- Any other explicit requirement the user mentions from the posting

Rules:
- Ask ONE useful follow-up question at a time. Do not stack multiple questions in one message.
- Keep questions concise.
- Clearly separate what the user has CONFIRMED from what you are ASSUMING. Say so explicitly when inferring.
- NEVER invent a job requirement that wasn't mentioned or clearly implied by the user.
- NEVER tell the user they ARE eligible or qualified unless the conversation has actually established that; if it's unclear, say what's unclear.
- When useful, briefly explain why a piece of information matters.
- Keep responses short. This is a conversation, not a report.
`.trim();

const CV_HALLUCINATION_GUARD = `
CRITICAL RULE — CV honesty:
You must only claim skills, experience, qualifications, achievements, and
responsibilities that are supported by the user's CV text provided below.
If the job requires something not demonstrated in the CV, say so plainly
as a gap. Never treat a related technology as evidence of the required
one (e.g. JavaScript experience is not TypeScript experience). Never
invent or infer professional experience as fact.
`.trim();

const EXTERNAL_ACTION_GUARD = `
CRITICAL RULE — no external actions:
You cannot and must not apply for jobs, submit applications, send emails or
messages to recruiters, submit forms, or make any external commitment on
the user's behalf. If asked to "apply" or take any such action, explain
that you cannot do this automatically, and offer instead to help prepare
material (like a tailored CV or a draft message) for the user to review
and send themselves.
`.trim();

function formatJob(job: Job): string {
  return `
Title: ${job.title}
Company: ${job.company || "(not specified)"}
Location: ${job.location || "(not specified)"}
Source: ${job.source}${job.url ? ` (${job.url})` : ""}
Description:
"""
${job.description}
"""
`.trim();
}

function formatMatch(match: JobMatch): string {
  const lines = [
    `Match level: ${match.matchLevel} (${match.matchEstimateLabel})`,
    `Summary: ${match.summary}`,
    `Requirements met: ${match.requirementsMet.join("; ") || "(none listed)"}`,
    `Requirements unclear: ${match.requirementsUnclear.join("; ") || "(none listed)"}`,
    `Requirements missing: ${match.requirementsMissing.join("; ") || "(none listed)"}`,
    `Skill gaps: ${match.skillGaps.join("; ") || "(none listed)"}`,
  ];
  if (match.experienceConcern) lines.push(`Experience concern: ${match.experienceConcern}`);
  if (match.locationConcern) lines.push(`Location concern: ${match.locationConcern}`);
  if (match.otherConcerns.length) lines.push(`Other concerns: ${match.otherConcerns.join("; ")}`);
  lines.push(`Recommendation: ${match.recommendation}`);
  return lines.join("\n");
}

export interface ChatContext {
  profile?: UserProfile;
  cv?: CV;
  selectedJob?: Job;
  jobMatch?: JobMatch;
}

export function buildSystemPrompt(context?: ChatContext): string {
  const parts = [BASE_QUALIFICATION_PROMPT, CV_HALLUCINATION_GUARD, EXTERNAL_ACTION_GUARD];

  if (context?.profile) {
    parts.push(
      `USER PROFILE:\nTarget roles: ${context.profile.targetRoles.join(", ")}\nExperience level: ${context.profile.experienceLevel}\nPreferred location: ${context.profile.preferredLocation}\nWork arrangement: ${context.profile.workArrangement}\nKnown skills: ${context.profile.skills.join(", ")}`
    );
  }

  if (context?.cv?.rawText) {
    parts.push(`USER CV (source of truth):\n"""\n${context.cv.rawText}\n"""`);
  }

  if (context?.selectedJob) {
    parts.push(`SELECTED JOB THE USER IS DISCUSSING:\n${formatJob(context.selectedJob)}`);
  }

  if (context?.jobMatch) {
    parts.push(`EXISTING MATCH ANALYSIS FOR THIS JOB:\n${formatMatch(context.jobMatch)}`);
  }

  return parts.join("\n\n");
}

/**
 * Streams the qualification assistant's reply as plain text chunks.
 * Shared by both the Vercel serverless route (api/qualify.ts) and the
 * local dev server (src/server.ts).
 */
export async function* streamQualificationChunks(
  messages: ChatMessage[],
  apiKey: string,
  context?: ChatContext
): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey });
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const stream = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: buildSystemPrompt(context),
    },
  });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}