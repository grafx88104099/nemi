import { test, expect } from "@playwright/test";

// auth.spec.ts-ийн seed агент (тест утга).
const AGENT = { email: "agent@nemi.mn", password: "agent123" };
const BAR = "nav[data-mobile-tabbar]";

test.describe("Гар утасны доод цэс (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("нүүр хуудсанд 5 табтай харагдана", async ({ page }) => {
    await page.goto("/");
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible();
    await expect(bar.locator("a")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Цэс" })).toBeVisible();
  });

  test("/listings дээр «Хайх» идэвхтэй", async ({ page }) => {
    await page.goto("/listings");
    await expect(page.locator(`${BAR} a[href="/listings"]`)).toHaveAttribute("aria-current", "page");
  });

  test("«Цэс» drawer нээгдэж, Escape-ээр хаагдана", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Цэс" }).click();
    const dialog = page.getByRole("dialog", { name: "Цэс" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("агентын самбарт доод цэс, «Цэс» товч байхгүй", async ({ page }) => {
    await page.goto("/agent/login");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("#email");
    await page.fill("#email", AGENT.email);
    await page.fill("#password", AGENT.password);
    await page.getByRole("button", { name: /нэвтрэх/i }).click();
    await expect(page).toHaveURL(/\/agent$/);
    for (const path of ["/agent", "/agent/chat", "/agent/crm"]) {
      await page.goto(path);
      await expect(page.locator(BAR)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Цэс" })).toHaveCount(0);
      const v = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--mobile-tabbar-h"));
      expect(v.trim()).toBe("");
    }
  });
});

test.describe("Ширээний дэлгэц (1280px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("доод цэс нуугдана", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(BAR)).toBeHidden();
  });
});

test("/your-rental → /me (307)", async ({ request }) => {
  const res = await request.get("/your-rental", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toMatch(/\/me$/);
});
