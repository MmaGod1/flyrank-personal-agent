# Job Scout & CV Tailor Agent

An agent that evaluates job postings against a fixed set of personal job preferences using the Gemini API, and returns a structured match result (match level, reasons, relevant requirements, missing requirements). Built incrementally as a CLI tool, then a web UI, then hardened for deployment and edge cases.

## Stack

- TypeScript / Node.js
- Gemini API (`models/gemini-3.6-flash`)
- Zod (schema validation for tool input/output)
- Vercel (serverless deployment)
- No frontend framework — plain HTML/JS UI
- No database, no authentication

## Core Behavior

- Accepts a single job posting as input.
- Evaluates it against fixed preferences:
  - Target roles: internship, junior frontend development
  - Relevant technologies: HTML, CSS, JavaScript, React
  - Experience level: internship/junior
- Sends the posting + preferences to Gemini and asks it to judge fit.
- Returns a structured result:
  - Match level
  - Reasons for match/mismatch
  - Relevant requirements found
  - Missing requirements / skill gaps
- **Never invents qualifications, experience, or skills.**
- **Never applies for jobs or takes external action.** Evaluation only.

## Build Stages

### FL-07 — Core Agent (MVP)
Narrowest working version: input → Gemini → analysis → structured result.

- TypeScript/Node.js CLI script.
- Gemini API key read from an environment variable, never hard-coded.
- Error handling for:
  - missing Gemini API key
  - failed Gemini request
  - invalid/empty job input
- Explicitly excluded at this stage: CV tailoring, scheduling, multiple job sites, frontend UI, auth, database, deployment.
- Validated end-to-end with a live Gemini call using a realistic junior frontend job posting, plus a missing-API-key guardrail test.
- Model updated from `models/gemini-2.5-flash` (deprecated, returned 404) to `models/gemini-3.6-flash`. No other changes made.

### FE-07 — Tool Results & Structured UI
Turned the CLI agent into a small web UI.

- Job-posting input form.
- UI connects to the existing Gemini-powered agent; API key stays server-side.
- Job-matching tool defined with a Zod schema and execute function.
- Tool lifecycle states rendered distinctly:
  - `input-streaming`
  - `input-available`
  - `output-available`
  - `output-error`
- Result rendered as a proper match-result component (not raw JSON): match level, reasons, relevant requirements, missing requirements.
- Designed error state with a retry action.

### Deployment Fixes (Vercel)
- Replaced the native Node HTTP server (`server.ts`, works locally but not servable as-is on Vercel) with a Vercel API function at `/api/match`, keeping the existing UI, Gemini logic, and Zod schema untouched.
- Fixed a `tsc: Permission denied` build failure on Vercel with a build/config-level fix (no application code changes).
- Fixed a blank deployed page (empty `<body>`, no console errors — `public/index.html` wasn't being served at root):
  - Moved `public/index.html` → `index.html`.
  - Removed the now-unnecessary `vercel.json` rewrite for `/` → `/public/index.html`.
  - Confirmed `GET /` serves `index.html` and `POST /api/match` continues using `api/match.ts`.

### FE-08 — Failure & Edge-Case Handling (in progress)
Inspection-only stage before making changes. Reviewing:

- `index.html`
- `api/match.ts`
- `src/jobMatchingTool.ts`
- `src/server.ts`
- `BUILD_LOG.md`
- `package.json`

Checking current handling of: empty input, Gemini/API failure, failed tool execution, slow response, no results, network failure — and whether the UI already has a useful empty state, loading state, error state, and working retry action, plus any mobile/responsive issues. Findings determine which FE-08 requirements are already met vs. genuinely missing before any fix work begins.

## Project Structure

```
.
├── index.html              # Frontend UI (served at GET /)
├── api/
│   └── match.ts             # Vercel serverless function (POST /api/match)
├── src/
│   ├── jobMatchingTool.ts   # Zod schema + execute function for the matching tool
│   └── server.ts            # Local dev CLI/server entry point
├── BUILD_LOG.md              # Running log of implementation changes
└── package.json
```

## Environment

Set the Gemini API key as an environment variable — never hard-code it or expose it to the browser:

```
GEMINI_API_KEY=your_key_here
```

## Running Locally

```bash
npm run build
npm start -- "paste a job posting here"
```

## Change Log

See `BUILD_LOG.md` for the full, append-only history of implementation changes.

## Guardrails Across All Stages

- No CV tailoring, scheduling, multi-site support, auth, or database until explicitly scoped.
- No unnecessary dependencies or frameworks.
- Changes are scoped to the smallest fix needed; existing working functionality is not rewritten.
- Every stage is validated (build + live test) before moving to the next feature.