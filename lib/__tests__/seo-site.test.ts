import { afterEach, describe, expect, it, vi } from "vitest";

import { absUrl, clip, isUuid, jsonLdHtml, ogPhotoUrl, ROOT_OG_IMAGE, siteUrl, withBrand } from "@/lib/seo/site";
import { agentMetaFor, officeMetaFor, type AgentSeo, type OfficeSeo } from "@/lib/seo/profiles";

const SB = "https://abcd.supabase.co";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl / absUrl", () => {
  it("хэвийн болгоно", () => {
    const cases: [string, string][] = [
      ["https://x.mn/", "https://x.mn"],
      ["www.nemi.mn", "https://www.nemi.mn"],
      ["http://localhost:3000/", "http://localhost:3000"],
      ["::bad::", "https://www.nemi.mn"],
      ["", "https://www.nemi.mn"],
    ];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [raw, want] of cases) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", raw);
      expect(siteUrl(), raw).toBe(want);
    }
    err.mockRestore();
  });
  it("тохируулаагүй → анхдагч", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    expect(siteUrl()).toBe("https://www.nemi.mn");
  });
  it("absUrl", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x.mn/");
    expect(absUrl("/a")).toBe("https://x.mn/a");
    expect(absUrl("a")).toBe("https://x.mn/a");
  });
});

describe("цэвэр туслахууд", () => {
  it("jsonLdHtml «<» үлдээхгүй", () => {
    expect(jsonLdHtml({ x: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
  it("withBrand", () => {
    expect(withBrand("A")).toBe("A — Нэми");
    expect(withBrand("A — B")).toBe("A — B | Нэми");
  });
  it("clip", () => {
    expect(clip(null, 10)).toBe("");
    expect(clip("a  b\n c", 10)).toBe("a b c");
    const c = clip("нэг хоёр гурав дөрөв", 10);
    expect(c.length).toBeLessThanOrEqual(10);
    expect(c.endsWith("…")).toBe(true);
  });
  it("isUuid", () => {
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("4209416d-a46c-4745-914f-2c7cbb5573fa")).toBe(true);
  });
  it("ogPhotoUrl", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    expect(ogPhotoUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(ogPhotoUrl("http://abcd.supabase.co/a.jpg")).toBeNull();
    expect(ogPhotoUrl(null)).toBeNull();
    expect(ogPhotoUrl("not a url")).toBeNull();
    const src = `${SB}/storage/v1/object/public/x/a.jpg`;
    expect(ogPhotoUrl(src)).toBe(`/_next/image?url=${encodeURIComponent(src)}&w=1200&q=75`);
    expect(ogPhotoUrl(src, 640)).toContain("&w=640&");
  });
});

const ID = "7a3c1f8e-1111-4222-8333-944455556666";

const agent = (o: Partial<AgentSeo> = {}): AgentSeo => ({
  id: ID,
  display_name: "Бат",
  avatar_url: `${SB}/storage/v1/object/public/avatars/b.jpg`,
  rating: 4.8,
  reviews_count: 12,
  sold: 30,
  years: 5,
  specialty: "Орон сууц",
  areas: ["Хан-Уул", "Сүхбаатар", "Баянгол", "Чингэлтэй"],
  bio: "Туршлагатай агент.",
  office: { name: "PMC" },
  ...o,
});

const office = (o: Partial<OfficeSeo> = {}): OfficeSeo => ({
  id: ID,
  name: "PMC",
  logo_url: null,
  cover_url: null,
  agents_count: 24,
  listings_count: 133,
  about: "Оффис.",
  description: null,
  service_areas: ["Хан-Уул"],
  suspended_at: null,
  ...o,
});

describe("agentMetaFor", () => {
  it("null → noindex", () => {
    expect(agentMetaFor(ID, null).robots).toEqual({ index: false, follow: false });
  });
  it("аватартай → summary, w=640, canonical", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    const m = agentMetaFor(ID, agent());
    expect((m.twitter as { card: string }).card).toBe("summary");
    expect((m.openGraph as { images: { url: string }[] }).images[0].url).toContain("w=640");
    expect(m.alternates?.canonical).toBe(`/agents/${ID}`);
    expect(String(m.description)).toContain("PMC");
  });
  it("аватаргүй → ROOT_OG_IMAGE", () => {
    const m = agentMetaFor(ID, agent({ avatar_url: null }));
    expect((m.openGraph as { images: unknown[] }).images[0]).toEqual(ROOT_OG_IMAGE);
  });
  it("утас гаралтад орохгүй", () => {
    const m = agentMetaFor(ID, { ...agent(), phone: "99887766" } as AgentSeo);
    expect(JSON.stringify(m)).not.toContain("99887766");
  });
});

describe("officeMetaFor", () => {
  it("null → noindex", () => {
    expect(officeMetaFor(ID, null).robots).toEqual({ index: false, follow: false });
  });
  it("түдгэлзсэн → noindex, canonical-гүй", () => {
    const m = officeMetaFor(ID, office({ suspended_at: "2026-11-01T00:00:00Z" }));
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.alternates).toBeUndefined();
  });
  it("ковертой → summary_large_image", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
    const m = officeMetaFor(ID, office({ cover_url: `${SB}/storage/v1/object/public/c/x.jpg` }));
    expect((m.twitter as { card: string }).card).toBe("summary_large_image");
    expect(m.alternates?.canonical).toBe(`/offices/${ID}`);
    expect(m.robots).toBeUndefined();
  });
  it("ковергүй → summary", () => {
    expect((officeMetaFor(ID, office()).twitter as { card: string }).card).toBe("summary");
  });
});
