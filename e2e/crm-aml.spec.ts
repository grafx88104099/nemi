import { test, expect, type Page } from "@playwright/test";

/**
 * UAT §11.2 — сценари 4 (МУТСТ, D7) автоматжсан хэсэг:
 *   - Агентад МУТСТ таб/мэдээлэл огт харагдахгүй (tipping-off, ACC-25)
 *   - Хязгаарлагдмал бүс нэвтрэлт шаардана
 *   - aml_officer R-13 самбарыг тоолуур/демо кейстэй харна
 *   - Дохио илгээх зам бүх ажилтанд нээлттэй (илгээлтийн ЯВЦ харагдахгүй)
 *
 * Урьдач: seed-crm.mjs + seed-crm-demo.mjs (демо кейс: Мөнх Констракшн ХХК,
 * DEMO-S-001, босго давсан 450 сая ₮ төлбөр). office@nemi.mn нь демо seed-ээр
 * aml_officer дүртэй; agent@nemi.mn зөвхөн agent дүртэй.
 */

const OFFICE = { email: "office@nemi.mn", password: "office123" };
const AGENT = { email: "agent@nemi.mn", password: "agent123" };

async function loginOffice(page: Page) {
  await page.goto("/office/login");
  await page.waitForSelector("#email");
  await page.fill("#email", OFFICE.email);
  await page.fill("#password", OFFICE.password);
  await page.getByRole("button", { name: /нэвтрэх/i }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/office") && !u.pathname.includes("/login"));
}

async function loginAgent(page: Page) {
  await page.goto("/agent/login");
  await page.waitForSelector("#email");
  await page.fill("#email", AGENT.email);
  await page.fill("#password", AGENT.password);
  await page.getByRole("button", { name: /нэвтрэх/i }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/agent") && !u.pathname.includes("/login"));
}

test.describe("МУТСТ — хязгаарлагдмал бүс (D7/ACC-25)", () => {
  test("нэвтрээгүй хэрэглэгч /office/crm/aml → login руу шилжинэ", async ({ page }) => {
    await page.goto("/office/crm/aml");
    await expect(page).toHaveURL(/\/office\/login/);
  });

  test("агентын CRM цэсэнд МУТСТ таб огт байхгүй", async ({ page }) => {
    await loginAgent(page);
    await page.goto("/agent/crm");
    await expect(page.getByRole("heading", { name: "Өдрийн самбар" })).toBeVisible();

    const nav = page.getByRole("navigation", { name: "CRM цэс" });
    await expect(nav).toBeVisible();
    await expect(nav.getByText("Сэжим")).toBeVisible(); // цэс өөрөө ажиллаж байгаагийн хяналт
    await expect(nav.getByText("МУТСТ")).toHaveCount(0); // tipping-off: таб огт үгүй
  });

  test("aml_officer R-13 самбар: тоолуур + демо кейс", async ({ page }) => {
    await loginOffice(page);
    await page.goto("/office/crm/aml");

    await expect(page.getByRole("heading", { name: /МУТСТ нийцэл/ })).toBeVisible();
    await expect(page.getByText("Хязгаарлагдмал бүс — хандалт бүр аудитад бүртгэгдэнэ.")).toBeVisible();

    // R-13 тоолуурын 4 карт
    await expect(page.getByText("Нээлттэй кейс")).toBeVisible();
    await expect(page.getByText("5 өдрийн босго дөхсөн")).toBeVisible();
    await expect(page.getByText("СГТ 24ц дөхсөн")).toBeVisible();
    await expect(page.getByText("Идэвхтэй hold")).toBeVisible();

    // Демо кейс (Д-25 босго давсан төлбөр) жагсаалтад
    await expect(page.getByText("Мөнх Констракшн ХХК").first()).toBeVisible();
    await expect(page.getByText("DEMO-S-001").first()).toBeVisible();
  });

  test("хэлцлийн хуудсанд «Дохио илгээх» зам бүх ажилтанд нээлттэй", async ({ page }) => {
    await loginOffice(page);
    await page.goto("/office/crm/transactions");
    await expect(page.getByRole("heading", { name: "Хэлцэл" })).toBeVisible();

    // Демо хэлцлийг нээгээд дохионы товч байгааг шалгана (илгээхгүй —
    // бодит илгээлт нь бичилт үүсгэх тул гар UAT-д).
    await page.getByRole("link", { name: /DEMO-S-001/ }).first().click();
    await page.waitForURL(/\/office\/crm\/transactions\/[0-9a-f-]{36}/);
    await expect(page.getByRole("button", { name: "Дохио илгээх" })).toBeVisible();
  });
});
