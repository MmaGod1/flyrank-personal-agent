# FL-07 Build Log

## Starting Point

FL-07 started from the FL-06 specification for a personal **Job Scout & CV Tailor**. The initial MVP goal was to prove one narrow job-matching flow end to end before building the complete agent.

## What We Built

- A TypeScript/Node.js scripted job-matching agent.
- Gemini API as the live AI service.
- Fixed user preferences for internship and junior frontend roles, using HTML, CSS, JavaScript, and React.
- Command-line job posting input.
- A structured result containing `matchLevel`, `reasons`, `relevantRequirements`, and `missingRequirements`.
- Error handling for empty input, a missing API key, failed Gemini requests, and invalid responses.

## What Broke

The initial Gemini model, `gemini-2.5-flash`, returned a 404 because it was unavailable to new users. The API recommended `gemini-3.6-flash` instead. Some automated validation attempts were also prevented by terminal approval and tool execution, so the successful test was eventually run directly in PowerShell.

## Changes Made

The Gemini model was updated from `gemini-2.5-flash` to `gemini-3.6-flash`. No other agent behavior was changed.

## Deliberately Deferred

The first FL-07 MVP does not yet include:

- CV tailoring
- Scheduled three-day job scanning
- Multiple job websites
- Automatic job application
- A database
- A frontend UI

These features were deferred because FL-07 requires starting with the narrowest core job and proving one end-to-end run before expanding the agent.

## Successful Validation

The completed flow was:

`job posting -> agent -> Gemini API -> structured match result`

The successful test identified a junior frontend internship as a strong match based on its role, technologies, and experience level. The result included the match level, reasons, relevant requirements, and missing requirements, without inventing skills or qualifications.

## FE-07: Tool Results and Structured Output in the UI

Added a small browser UI and native Node.js server around the existing agent. The job-matching tool validates its input and output with Zod, while the server keeps `GEMINI_API_KEY` out of the browser. The UI shows input-streaming, input-available, output-available, and output-error states, renders the match result as separate components, and provides a retry action for errors.

## FE-07 Validation and Completion

Verified that the Zod tool schema and execute function remain in `src/jobMatchingTool.ts`, the result is rendered as UI components, the retry error state is present, the API key remains server-side, and the existing CLI remains intact. Adjusted the UI lifecycle so `input-streaming` remains visible during the Gemini request and `input-available` is restored when the user edits the posting. TypeScript validation is required before manual testing.

## FE-07 Final Implementation Note

Implemented the browser UI, server-side Gemini connection, Zod-backed job-matching tool, structured result components, lifecycle states, error state, and retry action. Updated the UI so `input-streaming` remains visible during requests. Tested with `npm run build`, which passed. Manual browser testing was not performed; this is the only outstanding validation item.

## Vercel Deployment Fix

Added `api/match.ts` as a Vercel serverless function for `POST /api/match`, reusing the existing Zod tool and keeping `GEMINI_API_KEY` server-side. Included the function in the TypeScript build and adjusted compiled local entry-point paths so the existing CLI remains available. The UI and Gemini matching behavior were otherwise unchanged.

## Vercel Build Permission Fix

Vercel could not execute the locally installed `node_modules/.bin/tsc` shim and reported `Permission denied`, although the project built locally. Updated the `build` script to invoke TypeScript through Node at `./node_modules/typescript/bin/tsc`, avoiding the executable shim without changing application code or functionality. The existing TypeScript 5.9.3 dependency and lockfile were retained.
