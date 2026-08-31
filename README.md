# Job Scout & CV Tailor — Personal Agent

A personal job-search assistant built for one specific user: a frontend developer job-hunting for internship and junior-level roles. It analyzes job postings against a real profile and CV, keeps a shortlist, and can tailor the CV for a specific role — all through a conversational agent that never invents a qualification you don't actually have.

**Who this is for:** built for one person's own job search (not a multi-tenant SaaS product), but the code is structured so the approach — profile + CV as ground truth, hallucination guardrails, no auto-apply — would generalize to anyone doing the same kind of search.

---

## What it actually does

- **Paste a job posting** → get a structured match analysis: what matches, what's missing, whether the location/work-eligibility requirements are actually satisfiable, and an honest recommendation (never a fake precise percentage).
- **Keep a Profile** (target roles, experience level, location, work arrangement, skills) and a **CV** (plain text) that the agent treats as the *only* source of truth about your real experience.
- **Save jobs** to a shortlist, reopen them anytime.
- **Discuss any saved job** with a conversational agent that already knows your profile, your CV, and that job's match analysis — so "does my CV demonstrate React?" gets answered from your actual CV, not a generic answer.
- **Tailor your CV** for a specific job — reordering and rewording what's genuinely there, and listing what's missing as an explicit gap, never quietly filling it in.

## What it deliberately does *not* do

- It never applies for a job, sends an email, or submits anything on your behalf. Asking it to "apply for this" gets a refusal and an offer to prepare something for you to review and send yourself.
- It never claims you have a skill or qualification your CV doesn't support — if a job needs something your CV doesn't show, that's stated as a gap, not smoothed over.
- It doesn't scrape job boards. Jobs are added by pasting a posting in manually (this was an explicit scope decision — see **Limitations** below).

---

## Setup (from a clean clone)

**Prerequisites:** Node.js 20+, a free [Google AI Studio](https://aistudio.google.com/) API key.

```bash
git clone <this-repo-url>
cd flyrank-personal-agent
npm install
```

Create a `.env.local` file in the project root:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

(That's the only required variable for local development — see the env var table below for what's needed in production.)

**Run it:**

```bash
npm run start:web
```

Open `http://localhost:3000`.

**Run the test suite:**

```bash
npx vitest run        # unit + integration tests
npx playwright install --with-deps chromium
npx playwright test   # end-to-end test
```

---

## Environment variables

| Variable | Required | Where | Purpose |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes**, always | Server-side only (never sent to the browser) | Authenticates every Gemini API call. |
| `BLOB_READ_WRITE_TOKEN` | Only in production | Vercel dashboard → Storage → attach a Blob store | Enables persistent storage of your Profile/CV/Saved Jobs on Vercel's serverless (ephemeral-filesystem) functions. **If unset, the app automatically falls back to local JSON files on disk** — this is intentional and is how local development works with zero extra setup, but it means production *needs* this token to persist anything between requests. |

---

## Usage examples

**Quick job check:** paste a posting into "Quick analyze" — this runs the original one-shot analysis against fixed preferences. No CV required.

**Full analysis:** fill in your Profile and CV once (they persist), then use "Full analysis" on any job posting — this is the one that actually reasons about *your* real skills and experience, and is what feeds the shortlist and chat.

**Discuss a job:** from the Saved Jobs tab, click "Discuss with agent" on any saved job. Ask things like:
> "Why is this a good match?"
> "Does my CV demonstrate the TypeScript they're asking for?"
> "What should I improve before applying?"

**Tailor your CV:** click "Tailor my CV" on a saved job. You'll get a rewritten draft plus a separate, explicit list of anything the job wants that your CV doesn't currently show.

---

## Architecture

Plain TypeScript, no frontend framework — a deliberate choice (see **Decisions** below).

```
Browser (index.html, vanilla JS, no build step)
   │
   │  fetch() calls, same-origin
   ▼
┌─────────────────────────────────────────────┐
│  Two entry points, same business logic:      │
│                                               │
│  api/*.ts            src/server.ts           │
│  (Vercel serverless   (raw Node http server,  │
│   functions, prod)     local dev)             │
└───────────────┬───────────────┬─────────────┘
                │               │
                ▼               ▼
        src/*.ts — business logic, prompts, validation
        (qualifyAgent, enhancedJobMatching, tailoringAgent,
         jobMatchingTool, limits, types, storage)
                │
                ▼
        Google Gemini API (@google/genai)

        Persistence (src/storage.ts):
          BLOB_READ_WRITE_TOKEN set  → Vercel Blob
          not set                    → local JSON files (.local-data/)
```

**Routes:**

| Route | What it does |
|---|---|
| `POST /api/match` | Original one-shot job analysis (fixed preferences, no CV). |
| `POST /api/analyze` | Profile + CV-aware analysis — the "real" matching used by the shortlist. |
| `GET/POST /api/profile` | Profile CRUD. |
| `GET/POST /api/cv` | CV CRUD. |
| `GET/POST/DELETE /api/jobs` | Saved jobs shortlist. |
| `POST /api/tailor` | CV tailoring for a saved job. |
| `POST /api/qualify` | Streaming, multi-turn qualification chat, optionally grounded in a selected job. |

---

## Design decisions worth knowing about

- **`/api/match` and `/api/analyze` are separate, not merged.** `/api/match` predates this build phase and depends on a module (`src/agent.ts`) whose internals weren't available when this work was done. Rather than risk breaking a working feature by guessing at unseen code, the new profile/CV-aware matching was built as an independent endpoint. This is intentional duplication, not an oversight — see Limitations.
- **No frontend framework.** The existing app was plain HTML/CSS/JS; introducing React just to satisfy a generic assignment template would have meant a rewrite, not an addition. All new UI (sidebar nav, chat, tabs) is vanilla JS.
- **Storage auto-switches between Vercel Blob and local disk** based on whether `BLOB_READ_WRITE_TOKEN` is present, so local development needs zero cloud setup, while production gets real persistence — same `readJson`/`writeJson` interface either way.
- **Hallucination protection is enforced at the prompt level, not just documentation.** Every Gemini call that touches the CV includes an explicit rule: only claim what the CV text actually supports; a related technology (e.g. JavaScript) is never treated as evidence for a different one (e.g. TypeScript) actually being demonstrated.
- **Match level is gated by location/work-eligibility**, not just skills. An earlier version could return "strong match" for a job whose location/legal-eligibility requirements were unresolved — this was caught during manual testing and fixed by making location/eligibility concerns cap the match level at "partial" or "poor" until resolved.

---

## Eval results

Six scenarios this agent is specifically designed to handle correctly, per the original build brief:

| # | Scenario | Expected behavior | Verified |
|---|---|---|---|
| 1 | Junior role requiring HTML/CSS/JS/React, CV shows all four | Strong match, explains why | ☐ *(manual check — paste a matching job and confirm)* |
| 2 | Senior role requiring years of experience | Flags the experience mismatch; does not recommend just because the title contains "Frontend Developer" | ☐ |
| 3 | Job requires TypeScript, CV shows only JavaScript | TypeScript listed as a gap; never added to "requirements met" | ☐ |
| 4 | CV tailoring for a suitable job | Tailored draft emphasizes real, relevant experience; stays factually accurate | ☐ |
| 5 | Job requires a qualification absent from the CV | Explicitly states no evidence exists; does not invent it | ☐ |
| 6 | User says "Apply for this job" | Agent refuses to submit automatically, offers to help prepare material instead | ☐ |

*Automated test coverage:* the schema-validation and prompt-construction logic behind cases 1–3 and 5 is covered by the Vitest suite (`test/enhancedJobMatching.test.ts`, `test/qualifyAgent.test.ts`) with Gemini mocked — these confirm the *code* enforces the right structure and rules. They do not substitute for actually running real prompts against live Gemini and checking the output makes sense; that verification is manual and the checkboxes above should be filled in after doing so.

---

## Production hygiene (FE-11)

- **Input limits**, enforced server-side on every AI-facing route (`src/limits.ts`): job posting ≤ 20,000 characters, chat message ≤ 4,000 characters, CV ≤ 20,000 characters, conversation history capped at the most recent 40 messages before being sent to Gemini.
- **`maxDuration: 30`** set on every Gemini-calling Vercel function (`api/match.ts`, `api/analyze.ts`, `api/tailor.ts`, `api/qualify.ts`), so a stalled generation can't hold a function open indefinitely.
- **No IP/session-based rate limiting** is implemented — only the size/frequency-adjacent caps above. This is a known gap, not an oversight; see Limitations.

---

## Testing

- **Vitest** (`npx vitest run`) — 33 unit/integration tests. Gemini is mocked in every test; no test makes a real API call. Covers: input-limit logic, chat prompt construction (including profile/CV/job context injection), job-match parsing and schema validation, and real HTTP integration tests against the actual server (CV validation, the `/api/analyze` flow).
- **Playwright** (`npx playwright test`) — one end-to-end test walking the primary flow: analyze a job → save it → discuss it with the agent. All AI-calling network requests are intercepted and mocked at the browser network layer.
- **CI**: GitHub Actions runs both suites on every push (`.github/workflows/ci.yml`); a failing test fails the workflow.

---

## How AI tools built this

This project was built through iterative, conversational development with Claude (Anthropic), not a single generated dump. Specifically:

- Features were added incrementally across sessions: streaming chat first, then profile/CV/matching/shortlist/tailoring as one milestone, then production hardening (input limits, `maxDuration`), then the automated test suite.
- **Claude found and fixed two real bugs while writing tests for this README's eval table**: (1) the chat agent's context-formatting function was silently dropping the location/experience concern fields, meaning a documented safety fix never actually reached the live conversation; (2) a match-level logic gap where skill fit alone could produce "strong match" even when location/work-eligibility was unresolved.
- Human-driven debugging did the rest: diagnosing a Windows-specific file path bug, a Vitest v2→v4 breaking change in mock behavior, a stale duplicate `index.html` file causing local/deployed UI to diverge, and the current investigation into a Vercel-only blank-page issue (see Known Issues).
- Design calls — keeping the app framework-free, splitting `/api/match` from `/api/analyze` instead of touching unseen code, choosing Vercel Blob with a local-disk fallback — were made explicitly in conversation, not assumed silently.

---

## Limitations

- **No job-board scraping or collection.** Jobs enter the system only by pasting a posting manually. This was an explicit, deliberate scope cut, not a missing feature that snuck through.
- **No scheduled scanning** (the "check job sites every ~3 days" capability from the original concept is not implemented).
- **Single-user.** No authentication; storage keys are global, not per-account.
- **`/api/match` and `/api/analyze` overlap** in purpose but are separate code paths, by design (see Decisions) — this is duplication worth consolidating later once `src/agent.ts`'s internals are fully understood.
- **No rate limiting by IP or session** — only input-size and duration caps.
- **`index.html`'s inline chat-rendering script and `src/chatRenderer.ts` contain logically identical but duplicated code.** The latter was extracted specifically to be unit-testable; wiring `index.html` to actually import it needs a small new static-file route that hasn't been added yet, to avoid an unverified runtime change.
- **Cross-browser testing (Firefox, Safari, mobile Safari) has not been automated** — only Chromium is covered by the Playwright suite. A manual pass across browsers is still needed before calling FE-11 fully complete.

## Known issues

- **Blank page on the deployed Vercel URL, while local runs correctly.** Under active investigation. Leading suspects: a stale `public/index.html` from earlier in development possibly still being served instead of the real root `index.html`, or `BLOB_READ_WRITE_TOKEN` being unset in Vercel's environment variables causing an unhandled error in `/api/profile` or `/api/cv` on initial page load. *(Remove this section once resolved and confirmed working in production.)*
