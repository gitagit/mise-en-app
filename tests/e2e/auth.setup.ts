import { test as setup, expect } from "@playwright/test";
import { STORAGE_STATE } from "../../playwright.config";

// Seeded by `npm run db:create-test-user`; override for a different account.
const email = process.env.E2E_EMAIL ?? "test@example.com";
const password = process.env.E2E_PASSWORD ?? "password123";

setup("sign in as the seeded test user", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // A failed login stays on /login with an error; a good one leaves it.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  // The session must carry a workspace, or every API call the specs make returns 401.
  const res = await page.request.get("/api/workspace");
  expect(res.status(), "seeded user should belong to a workspace").toBe(200);

  await page.context().storageState({ path: STORAGE_STATE });
});
