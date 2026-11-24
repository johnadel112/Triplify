import { test, expect, type Page } from "@playwright/test";
const password = "Disposable12345"; // Only valid in the disposable test database.
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("homepage and mobile navigation are usable without overflow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Explore the world. Exceptionally." }),
  ).toBeVisible();
  await page
    .locator(".hero-photo")
    .evaluate((img: HTMLImageElement) => img.decode());
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/demo-homepage.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Menu", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/demo-mobile.png",
    fullPage: true,
  });
});
test("registration, profile update, password change, logout, and confirmed deactivation", async ({
  page,
  context,
}) => {
  await page.goto("/register");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("Enter your name", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Browser Traveler");
  await page.getByLabel("Email address").fill("browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("checkbox").check();
  await page.screenshot({
    path: "test-results/demo-registration.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/registered=1/);
  await login(page, "browser@example.test");
  await expect(page).toHaveURL("/dashboard");
  const cookies = await context.cookies();
  expect(
    cookies
      .filter((cookie) => cookie.name.endsWith("_token"))
      .every((cookie) => cookie.httpOnly),
  ).toBe(true);
  await page.goto("/account/profile");
  await page.getByLabel("Full name").fill("Updated Traveler");
  await page.getByLabel("Preferred currency").selectOption("EUR");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("Updated Traveler");
  await page.screenshot({
    path: "test-results/demo-profile.png",
    fullPage: true,
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Access denied" }),
  ).toBeVisible();
  await page.goto("/account/security");
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByLabel("New password", { exact: true })
    .fill("Replacement12345");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Replacement12345");
  await page.screenshot({
    path: "test-results/demo-security.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/passwordChanged=1/);
  await page.getByLabel("Email address").fill("browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Replacement12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/login");
  await page.getByLabel("Email address").fill("browser@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Replacement12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
  await page.goto("/account/settings");
  await page.getByRole("button", { name: "Deactivate my account" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Deactivate my account" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/deactivated=1/);
});
test("real administration workflows and forced temporary-password change", async ({
  page,
}) => {
  await login(page, "admin@example.test");
  await expect(page).toHaveURL("/dashboard");
  await page.goto("/admin");
  await page.screenshot({
    path: "test-results/demo-admin.png",
    fullPage: true,
  });
  await page.goto("/admin/accounts");
  const traveler = page
    .getByRole("row")
    .filter({ hasText: "traveler@example.test" })
    .filter({ hasText: "Demo Traveler" });
  await expect(traveler).toBeVisible();
  await page.screenshot({
    path: "test-results/demo-accounts.png",
    fullPage: true,
  });
  await traveler.getByRole("button", { name: "Suspend", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(traveler).toContainText("SUSPENDED");
  await traveler
    .getByRole("button", { name: "Reactivate", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(traveler).toContainText("ACTIVE");
  await traveler.getByRole("button", { name: "Reset password" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const credential = await page.locator(".temporary-password").textContent();
  expect(credential).toBeTruthy();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".temporary-password")).toHaveCount(0);
  await page.goto("/admin/moderators");
  await page.getByLabel("Full name").fill("Demo Moderator");
  await page
    .getByLabel("Email", { exact: true })
    .fill("moderator@example.test");
  await page
    .getByLabel("Assigned provider ID")
    .fill("000000000000000000000201");
  await page.getByLabel("Temporary password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create moderator" }).click();
  await expect(page.getByRole("status")).toContainText("was created");
  await page.screenshot({
    path: "test-results/demo-moderators.png",
    fullPage: true,
  });
  await page.goto("/admin/providers");
  await page.getByLabel("Provider ID").fill("000000000000000000000201");
  await page.getByRole("button", { name: "Review action" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("inactive");
  await page.getByLabel("Action", { exact: true }).selectOption("reactivate");
  await page.getByRole("button", { name: "Review action" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("active");
  await page.goto("/admin/bookings");
  await expect(
    page.getByRole("cell", { name: "DEMO-INSPECT-01 FLIGHT" }),
  ).toBeVisible();
  await page.getByLabel("Booking type").selectOption("HOTEL");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No records match these filters.")).toBeVisible();
  await page.goto("/admin/reports");
  await expect(
    page.getByText("Demonstration report for administrator review"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/demo-reports.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "hide", exact: true }).click();
  await page
    .getByLabel("Resolution notes")
    .fill("Reviewed in browser integration test");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("Moderation action completed.", { exact: true }),
  ).toBeVisible();
  await page.goto("/admin/audit-logs");
  await expect(page.getByRole("cell", { name: /^REPORT_HIDE/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/demo-audit.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/login");
  await page.getByLabel("Email address").fill("traveler@example.test");
  await page.getByLabel("Password", { exact: true }).fill(credential!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/account/security");
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/account/security");
  await page.getByLabel("Current password", { exact: true }).fill(credential!);
  await page
    .getByLabel("New password", { exact: true })
    .fill("UpdatedTemporary123");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("UpdatedTemporary123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/passwordChanged=1/);
});
test("failed, locked and suspended logins show errors", async ({ page }) => {
  for (const email of [
    "missing@example.test",
    "locked@example.test",
    "suspended@example.test",
  ]) {
    await login(page, email);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL("/login");
  }
  await page.screenshot({
    path: "test-results/demo-login-error.png",
    fullPage: true,
  });
});

test("logout failure preserves access; session expiry clears protected views", async ({
  page,
}) => {
  await login(page, "admin@example.test");
  await expect(page).toHaveURL("/dashboard");
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText("Sign out failed. Please try again.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open administration" }),
  ).toBeVisible();
  await page.unroute("**/api/auth/logout");
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, json: { message: "Expired" } }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: { message: "Expired" } }),
  );
  await page.goto("/admin/accounts");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("admin errors, keyboard dialogs and mobile tables", async ({ page }) => {
  await login(page, "admin@example.test");
  await expect(page).toHaveURL("/dashboard");
  await page.route("**/api/admin/users?*", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Private database stack trace" },
    }),
  );
  await page.goto("/admin/accounts");
  await expect(
    page.getByText(
      "The service is temporarily unavailable. Please try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Private database stack trace")).toHaveCount(0);
  await page.unroute("**/api/admin/users?*");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Demo Administrator", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Demo Administrator", exact: true }),
  ).toBeFocused();
});
