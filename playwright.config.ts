import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start:web",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Present so any accidental un-mocked route fails loudly with a
      // clear 500 instead of an unrelated crash — every AI-calling route
      // in this E2E test is intercepted at the network layer via
      // page.route() before it ever reaches this server.
      GEMINI_API_KEY: "e2e-placeholder-key-never-used",
    },
  },
});