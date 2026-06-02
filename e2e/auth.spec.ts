import { test, expect } from "@playwright/test";

const OFFICE = { email: "office@nemi.mn", password: "office123" };
const ADMIN = { email: "admin@nemi.mn", password: "nemiadmin123" };
const AGENT = { email: "agent@nemi.mn", password: "agent123" };

test.describe("Нийтийн хандалт", () => {
  test("/agents нэвтрэлтгүйгээр нээлттэй", async ({ page }) => {
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.getByRole("heading", { name: /Баталгаажсан агентууд/ })).toBeVisible();
  });
});

test.describe("Оффисын портал нэвтрэлт", () => {
  test("/office → /office/login руу шилжинэ", async ({ page }) => {
    await page.goto("/office");
    await expect(page).toHaveURL(/\/office\/login/);
  });

  test("буруу нууц үг татгалзана", async ({ page }) => {
    await page.goto("/office/login");
    await page.fill("#email", OFFICE.email);
    await page.fill("#password", "wrongpass");
    await page.getByRole("button", { name: /нэвтрэх/i }).click();
    await expect(page.getByText(/буруу/)).toBeVisible();
  });

  test("зөв нэвтрэлт → оффисын самбар + ?next= хүндэтгэнэ", async ({ page }) => {
    await page.goto("/office/agents"); // → /office/login?next=/office/agents
    await expect(page).toHaveURL(/\/office\/login\?next=/);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("#email");
    await page.fill("#email", OFFICE.email);
    await page.fill("#password", OFFICE.password);
    await page.getByRole("button", { name: /нэвтрэх/i }).click();
    await expect(page).toHaveURL(/\/office\/agents/);
    await expect(page.getByRole("heading", { name: /Агентууд/ })).toBeVisible();
  });
});

test.describe("Агентын нэвтрэлт", () => {
  test("/agent → /agent/login руу шилжинэ", async ({ page }) => {
    await page.goto("/agent");
    await expect(page).toHaveURL(/\/agent\/login/);
  });

  test("агент зөв нэвтрэх → самбар", async ({ page }) => {
    await page.goto("/agent/login");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("#email");
    await page.fill("#email", AGENT.email);
    await page.fill("#password", AGENT.password);
    await page.getByRole("button", { name: /нэвтрэх/i }).click();
    await expect(page).toHaveURL(/\/agent$/);
    await expect(page.getByRole("heading", { name: /Сайн байна уу/ })).toBeVisible();
  });
});

test.describe("Backoffice нэвтрэлт", () => {
  test("буруу эрх (оффис) admin-д орохгүй", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill("#email", OFFICE.email);
    await page.fill("#password", OFFICE.password);
    await page.getByRole("button", { name: /нэвтрэх/i }).click();
    await expect(page.getByText(/admin эрх байхгүй/)).toBeVisible();
  });

  test("админ зөв нэвтэрнэ", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill("#email", ADMIN.email);
    await page.fill("#password", ADMIN.password);
    await page.getByRole("button", { name: /нэвтрэх/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: /Хяналтын самбар/ })).toBeVisible();
  });
});
