import { describe, expect, it } from "vitest";

import { AI_NOT_LIVE_NOTE, articleBody, articleIndexable, getArticle, NEWS } from "@/lib/news";

describe("AI-ийн нийтлэл — AI оноо ажиллаагүй үед (hasAiScores = false)", () => {
  const ai = getArticle("how-ai-valuation-works")!;

  it("нийтлэл AI-ийн хаалгатай", () => {
    expect(ai.requiresAiScores).toBe(true);
  });

  it("«тун удахгүй» тэмдэглэл хамгийн эхэнд; ажиллаж эхэлбэл тэмдэглэлгүй", () => {
    expect(articleBody(ai, false)[0]).toBe(AI_NOT_LIVE_NOTE);
    expect(AI_NOT_LIVE_NOTE).toMatch(/ажиллаагүй/);
    expect(articleBody(ai, true)).toEqual(ai.body);
    expect(articleBody(ai, true)).not.toContain(AI_NOT_LIVE_NOTE);
  });

  it("sitemap/index-д зөвхөн AI ажиллаж эхэлсний дараа; бусад нийтлэл үргэлж", () => {
    expect(articleIndexable(ai, false)).toBe(false);
    expect(articleIndexable(ai, true)).toBe(true);
    for (const a of NEWS.filter((n) => !n.requiresAiScores)) {
      expect(articleIndexable(a, false)).toBe(true);
      expect(articleBody(a, false)).toEqual(a.body);
    }
  });

  it("бие нь AI оноог бүх зарт байгаа мэт хэлэхгүй (хуучин тэмдэглэл)", () => {
    expect(ai.body.join(" ")).not.toMatch(/бүх зарт хараахан/);
  });
});
