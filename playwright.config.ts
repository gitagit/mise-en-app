import { defineConfig } from "@playwright/test";

export const STORAGE_STATE = "tests/e2e/.auth/user.json";

// Every page except /login and /register sits behind NextAuth, so the specs need a session.
// "setup" signs in once as the seeded test user (npm run db:create-test-user) and saves the
// cookies; "signed-in" reuses them. "onboarding" starts signed out and registers a new user.
export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  timeout: 30_000,
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "signed-in",
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /onboarding\.spec\.ts/],
      use: { storageState: STORAGE_STATE },
    },
    { name: "onboarding", testMatch: /onboarding\.spec\.ts/ },
  ],
});
