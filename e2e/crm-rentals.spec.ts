import { test, expect, type Page } from "@playwright/test";

/**
 * UAT §11.2 — сценари 6/7-ийн автоматжсан хэсэг + R-07/R-08/R-09 самбарууд:
 *   - R-08 түрээсийн багцын самбар (дүүргэлт, дуусах гэрээ, авлагын нэгтгэл)
 *   - R-09 нэхэмжлэхийн насжилт (демо: DEMO-INV-003 «8+ хоног» бүлэгт)
 *   - R-07 сарын менежментийн бүртгэл (бөглөлт %, урамшууллын hold)
 *   - Гэрээний 360° карт (гинж, барьцаа)
 *   - Cron endpoint-ууд Bearer CRON_SECRET-гүйгээр 401 (Д-13/14 хамгаалалт)
 *
 * Урьдач: seed-crm.mjs + seed-crm-demo.mjs (DEMO-LS-001 идэвхтэй гэрээ,
 * DEMO-INV-001/002 төлөгдсөн, DEMO-INV-003 12 хоног хоцорсон, DEMO-P-002
 * дээр сарын бүртгэл 2 сар). office@nemi.mn — property_manager-аас дээш эрхтэй.
 */

const OFFICE = { email: "office@nemi.mn", password: "office123" };

async function loginOffice(page: Page) {
  await page.goto("/office/login");
  await page.waitForSelector("#email");
  await page.fill("#email", OFFICE.email);
  await page.fill("#password", OFFICE.password);
  await page.getByRole("button", { name: /нэвтрэх/i }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/office") && !u.pathname.includes("/login"));
}

test.describe("Түрээсийн мөчлөг (R-07/R-08/R-09)", () => {
  test("R-08 багцын самбар: дүүргэлт, гэрээ, авлагын карт", async ({ page }) => {
    await loginOffice(page);
    await page.goto("/office/crm/rentals");

    await expect(page.getByRole("heading", { name: "Түрээсийн менежмент" })).toBeVisible();

    // R-08 тоон картууд
    await expect(page.getByText(/Идэвхтэй гэрээ \(/)).toBeVisible();
    await expect(page.getByText("60/30 хоногт дуусах (F-570)")).toBeVisible();
    await expect(page.getByText(/Дүүргэлт \(\d+ түрээслэгдсэн/)).toBeVisible();
    await expect(page.getByText(/Хугацаа хэтэрсэн авлага/)).toBeVisible();

    // Демо гэрээ жагсаалтад
    await expect(page.getByText("DEMO-LS-001").first()).toBeVisible();
  });

  test("R-09 насжилт: хоцорсон нэхэмжлэх 8+ бүлэгт", async ({ page }) => {
    await loginOffice(page);
    await page.goto("/office/crm/rentals/invoices");

    await expect(page.getByRole("heading", { name: "Нэхэмжлэх" })).toBeVisible();

    // Насжилтын бүлгүүд (F-524) — демо DEMO-INV-003 нь 12 хоног хоцорсон
    await expect(page.getByText("8+ хоног").first()).toBeVisible();
    await expect(page.getByText("DEMO-INV-003").first()).toBeVisible();
    // Төлөгдсөн нэхэмжлэхүүд мөн жагсаалтад (шүүлтгүй үед)
    await expect(page.getByText("DEMO-INV-001").first()).toBeVisible();
  });

  test("R-07 сарын бүртгэл: бөглөлт % ба hold төлөв", async ({ page }) => {
    await loginOffice(page);
    await page.goto("/office/crm/rentals/monthly");

    await expect(
      page.getByRole("heading", { name: "Сарын менежментийн бүртгэл" })
    ).toBeVisible();

    // Демо: энэ сард DEMO-P-002 дээр дутуу бүртгэл (commission_hold=true)
    await expect(page.getByText(/DEMO-P-002/).first()).toBeVisible();
    await expect(page.getByText(/Бөглөлт: \d+/)).toBeVisible();
  });

  test("гэрээний 360° карт нээгдэнэ (гинж/барьцаа/хоцролт)", async ({ page }) => {
    await loginOffice(page);
    await page.goto("/office/crm/rentals");

    await page.getByRole("link", { name: /DEMO-LS-001/ }).first().click();
    await page.waitForURL(/\/office\/crm\/rentals\/leases\/[0-9a-f-]{36}/);
    await expect(page.getByText("DEMO-LS-001").first()).toBeVisible();
    // Идэвхтэй төлөвийн badge (демо гэрээ идэвхтэй)
    await expect(page.getByText("Идэвхтэй", { exact: true }).first()).toBeVisible();
  });

  test("cron route-ууд бий бөгөөд зөвхөн GET хүлээн авна", async ({ request }) => {
    // GET-ийг зориуд дуудахгүй: CRON_SECRET тохируулаагүй dev орчинд guard
    // алгасагдаж БОДИТ гүйлт (нэхэмжлэх үүсгэлт) хийгдэх эрсдэлтэй.
    for (const path of ["/api/cron/crm-monthly", "/api/cron/crm-daily"]) {
      const res = await request.post(path);
      expect(res.status(), `${path} POST`).toBe(405); // route бий, GET-ээс өөр арга хаалттай
    }
  });

  test("cron GET буруу Bearer-тэй → 401 (CRON_SECRET тохируулсан орчинд)", async ({ request }) => {
    test.skip(!process.env.CRON_SECRET, "Тест процессын орчинд CRON_SECRET алга — гар UAT-аар шалгана");
    const res = await request.get("/api/cron/crm-monthly", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(res.status()).toBe(401);
  });
});
