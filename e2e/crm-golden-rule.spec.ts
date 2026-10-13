import { test, expect, type Page } from "@playwright/test";

/**
 * UAT §11.2 — сценари 1 (⭐ Алтан дүрэм, F-125) + сценари 2-ын давхардлын
 * анхааруулгын хэсэг (F-107). Урьдач:
 *   1) Миграци 000100…000900 хэрэглэгдсэн
 *   2) node scripts/seed-crm.mjs  (тохиргоо/урсгал/лавлах)
 *   3) node scripts/seed-crm-demo.mjs  (DEMO- өгөгдөл)
 *   4) office@nemi.mn хэрэглэгч CRM ажилтан (демо seed автоматаар болгодог)
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

/** Өнөөдрөөс `days` хоногийн дараах YYYY-MM-DD. */
function dateAfter(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

test.describe("⭐ Алтан дүрэм (F-125)", () => {
  test("идэвхжүүлэлт 5 бүрдэлгүйгээр хориглогдож, бүрдмэгц амжилттай", async ({ page }) => {
    test.slow(); // сервер үйлдэл олонтой урсгал

    await loginOffice(page);
    await page.goto("/office/crm/leads");
    await expect(page.getByRole("heading", { name: "Сэжим" })).toBeVisible();

    // Шинэ сэжим ҮРГЭЛЖ шинээр үүсгэнэ (давтан гүйлтэд ч детерминистик:
    // шинэ сэжимд last_contact_at үргэлж хоосон → 1-р оролдлого заавал хаагдана)
    const uniq = String(Date.now()).slice(-8);
    await page.getByRole("button", { name: "Шинэ сэжим" }).click();
    const cdlg = page.getByRole("dialog");
    await cdlg.locator('label:text-is("Овог") + input').fill("Тест");
    await cdlg.locator('label:text-is("Нэр") + input').fill(`Голден${uniq}`);
    await cdlg.locator('label:text-is("Утас") + input').fill(`88${uniq.slice(2)}`);
    await cdlg.locator('label:text-is("Эх сурвалж") + div select').selectOption({ index: 1 });
    // Зарим эх сурвалжид дэлгэрэнгүй заавал (F-104) — үргэлж бөглөнө
    await cdlg.locator('label:text-is("Эх сурвалжийн дэлгэрэнгүй") + input').fill("e2e тест");
    await cdlg.getByRole("button", { name: "Бүртгэх" }).click();
    await page.waitForURL(/\/office\/crm\/leads\/[0-9a-f-]{36}/);

    // Алтан дүрмийн блок харагдана
    await expect(page.getByText("Алтан дүрмийн 5 бүрдэл")).toBeVisible();

    // 1-р оролдлого: дараагийн алхам/огноог бөглөсөн ч эхний холболтгүй →
    // хориглоно, дутуу бүрдлийн жагсаалт монголоор харагдана.
    await page.getByRole("button", { name: "Идэвхжүүлэх" }).first().click();
    let dlg = page.getByRole("dialog");
    await expect(dlg.getByText("Сэжим идэвхжүүлэх")).toBeVisible();
    await dlg.locator('label:text-is("Дараагийн алхам") + input').fill("Эхний уулзалт товлох");
    await dlg.locator('label:text-is("Алхмын огноо") + input').fill(dateAfter(2));
    await dlg.getByRole("button", { name: "Идэвхжүүлэх" }).click();

    await expect(page.getByText("Идэвхжүүлэхийн өмнө дутуу бүрдлүүдийг нөхнө үү.")).toBeVisible();
    await expect(page.getByText(/эхний холболт/i).first()).toBeVisible();
    await dlg.getByRole("button", { name: "Болих" }).click();

    // Эзэмшигч дутуу гэж заасан бол (ажлын бус цагт Д-01 дараалалд орсон
    // сэжим) — гараар шилжүүлж эзэмшигчтэй болгоно.
    if ((await page.getByText("Эзэмшигч (эхлээд хуваарилна/шилжүүлнэ)").count()) > 0) {
      await page.getByRole("button", { name: "Шилжүүлэх" }).first().click();
      const rdlg = page.getByRole("dialog");
      await rdlg.locator('label:text-is("Шинэ эзэмшигч") + div select').selectOption({ index: 1 });
      await rdlg.getByRole("button", { name: "Шилжүүлэх" }).click();
      await expect(rdlg).toBeHidden();
    }

    // Эхний холболт бүртгэх (F-110) → товч «Холболт бүртгэх» болж хувирна.
    // (Дахин гүйлтийн үлдэгдэл төлөвт аль хэдийн бүртгэгдсэн байж болно.)
    const firstContactBtn = page.getByRole("button", { name: "Эхний холболт бүртгэх" });
    if ((await firstContactBtn.count()) > 0) await firstContactBtn.click();
    await expect(page.getByRole("button", { name: "Холболт бүртгэх" })).toBeVisible();

    // 2-р оролдлого: бүрдэл бүрэн → амжилттай, сэжим «Идэвхтэй»
    await page.getByRole("button", { name: "Идэвхжүүлэх" }).first().click();
    dlg = page.getByRole("dialog");
    await dlg.locator('label:text-is("Дараагийн алхам") + input').fill("Эхний уулзалт товлох");
    await dlg.locator('label:text-is("Алхмын огноо") + input').fill(dateAfter(2));
    await dlg.getByRole("button", { name: "Идэвхжүүлэх" }).click();

    await expect(dlg).toBeHidden();
    await expect(page.getByText("Идэвхтэй", { exact: true }).first()).toBeVisible();
    // Идэвхжүүлэх товч алга болсон (идэвхтэй төлөвт харагдахгүй)
    await expect(page.getByRole("button", { name: "Идэвхжүүлэх" })).toHaveCount(0);
  });

  test("удирдлагын самбарт алтан дүрмийн зөрчлийн блок харагдана (R-06)", async ({ page }) => {
    await loginOffice(page);
    await page.goto("/office/crm");
    await expect(page.getByRole("heading", { name: "CRM самбар" })).toBeVisible();
    await expect(page.getByText("Алтан дүрмийн зөрчил")).toBeVisible();
  });
});

test.describe("Давхардлын анхааруулга (F-107)", () => {
  test("ижил утастай бүртгэл дээр DuplicateHint гарна", async ({ page }) => {
    await loginOffice(page);
    await page.goto("/office/crm/leads");
    await page.getByRole("button", { name: "Шинэ сэжим" }).click();

    const dlg = page.getByRole("dialog");
    // Демо seed: DEMO-C-003 (Г. Түвшин) 9911-0003 дугаартай
    await dlg.locator('label:text-is("Утас") + input').fill("99110003");
    await expect(dlg.getByText(/Ижил төстэй бүртгэл олдлоо/)).toBeVisible();
    await expect(dlg.getByText("Утас таарсан").first()).toBeVisible();

    // Бичилт хийхгүй — хаана (идемпотент тест)
    await dlg.getByRole("button", { name: "Болих" }).click();
    await expect(dlg).toBeHidden();
  });
});
