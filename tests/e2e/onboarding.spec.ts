import { test, expect } from "@playwright/test";

// Regression test: a newly registered user has no workspace yet, and POST /api/workspace
// used to reject them with 401, so nobody could get past this screen.
test.describe("Onboarding", () => {
  test("register, create a workspace, land in the onboarding wizard", async ({ page }) => {
    const email = `e2e-onboard-${Date.now()}@example.com`;

    await page.goto("/register");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password (8+ characters)").fill("correct-horse-battery");
    await page.getByRole("button", { name: /^create account$/i }).click();

    await expect(page).toHaveURL(/\/workspace\/setup/, { timeout: 15_000 });

    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/workspace") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^create workspace$/i }).click();
    expect((await created).status()).toBe(200);

    await expect(page).toHaveURL(/\/onboard/, { timeout: 15_000 });

    // The session now carries the workspace, so workspace-scoped APIs answer.
    const res = await page.request.get("/api/workspace");
    expect(res.status()).toBe(200);
    expect((await res.json()).workspace.name).toBe("My Kitchen");
  });

  test("signed-out visitors are sent to the login page", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/login/);
  });
});
