import { test, expect } from "@playwright/test";

/**
 * Primary-flow E2E test: paste a job -> run full analysis -> save the
 * job -> open it in the Agent tab and get a reply.
 *
 * Every network call that would reach Gemini is intercepted with
 * page.route() and fulfilled with canned JSON, so this test never makes
 * a real AI API call, matching the same rule enforced in the Vitest
 * suite. GET requests for profile/CV are allowed to hit the real local
 * server (harmless local reads, no AI involved).
 */

const MOCK_JOB = {
  id: "job_e2e_1",
  title: "Junior Frontend Developer",
  company: "Acme Corp",
  location: "Remote",
  description: "Junior role requiring React and JavaScript.",
  source: "manual-paste",
  collectedAt: new Date().toISOString(),
};

const MOCK_MATCH = {
  matchLevel: "strong",
  matchEstimateLabel: "Estimated match: Strong (AI estimate, not precise)",
  summary: "Strong overlap with your React and JavaScript experience.",
  whyItMatches: ["Requires React, which your CV demonstrates."],
  requirementsMet: ["React", "JavaScript"],
  requirementsUnclear: [],
  requirementsMissing: [],
  skillGaps: [],
  experienceConcern: "",
  locationConcern: "",
  otherConcerns: [],
  recommendation: "This looks like a solid fit — consider applying.",
};

test("primary flow: analyze a job, save it, then discuss it with the agent", async ({ page }) => {
  // Job analysis is mocked — never call the real Gemini-backed endpoint.
  await page.route("**/api/analyze", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ job: MOCK_JOB, match: MOCK_MATCH }),
    });
  });

  // Saving a job is mocked too, so this test doesn't depend on real
  // storage state between runs.
  await page.route("**/api/jobs", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "saved_1", job: MOCK_JOB, match: MOCK_MATCH, savedAt: new Date().toISOString() }),
      });
    } else {
      await route.continue();
    }
  });

  // The qualification chat streams plain text; a single fulfilled body
  // is a faithful enough stand-in for "the stream completed" in this
  // primary-flow test (streaming mechanics themselves are covered by
  // the Vitest chat-renderer tests).
  await page.route("**/api/qualify", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: "Great choice — this role matches your React experience well. Do you have a work authorization question, or shall we look at your CV next?",
    });
  });

  await page.goto("/");

  // ---- Step 1: analyze a job ----
  await expect(page.getByRole("heading", { name: /find the signal in a job post/i })).toBeVisible();

  await page.getByLabel(/job title/i).fill("Junior Frontend Developer");
  await page.getByLabel(/job posting/i).fill(
    "We're hiring a Junior Frontend Developer. Requirements: React, JavaScript, HTML, CSS."
  );
  await page.getByRole("button", { name: /full analysis/i }).click();

  await expect(page.getByText(/strong match/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Junior Frontend Developer" })).toBeVisible();

  // ---- Step 2: save the job ----
  // Locate by id rather than accessible name: this button's own text
  // changes ("Save this job" -> "Saving..." -> "Saved ✓"), and a
  // name-filtered role locator stops matching once the text changes.
  const saveButton = page.locator("#save-job-btn");
  await expect(saveButton).toBeVisible();
  await expect(saveButton).toHaveText(/save this job/i);
  await saveButton.click();
  await expect(saveButton).toHaveText(/saved/i);

  // ---- Step 3: open the Agent tab and send a message ----
  await page.getByRole("tab", { name: /^agent$/i }).click();
  const chatInput = page.getByLabel(/your message/i);
  await chatInput.fill("Is this role a good fit for me?");
  await page.getByRole("button", { name: /send message/i }).click();

  await expect(page.getByText(/matches your react experience/i)).toBeVisible();
});