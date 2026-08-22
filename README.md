# FlyRank Personal Agent

This is the first MVP of the Job Scout & CV Tailor agent. It evaluates one job posting against fixed internship and junior frontend preferences using Gemini.

## Setup

Install dependencies:

```powershell
npm install
```

Set the Gemini API key in the current PowerShell session:

```powershell
$env:GEMINI_API_KEY = "your_api_key_here"
```

The key is read only from `GEMINI_API_KEY` and is never stored in the source code. `.env.example` documents the required variable name.

## Run

```powershell
npm start -- "Junior Frontend Developer internship. Requirements: HTML, CSS, JavaScript and React."
```

The agent sends the posting and these preferences to Gemini:

- Target roles: internship and junior frontend development
- Technologies: HTML, CSS, JavaScript, React
- Experience level: internship or junior

It returns JSON with `matchLevel`, `reasons`, `relevantRequirements`, and `missingRequirements`. It does not apply for jobs or perform any external action.

Example successful output:

```json
{
	"matchLevel": "strong",
	"reasons": [
		"The role is an internship-level frontend position.",
		"The posting mentions HTML, CSS, JavaScript, and React."
	],
	"relevantRequirements": [
		"HTML",
		"CSS",
		"JavaScript",
		"React"
	],
	"missingRequirements": []
}
```

An empty posting, missing API key, failed Gemini request, or invalid Gemini response produces a clear error and a non-zero exit code.
