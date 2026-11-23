import { afterEach, describe, expect, it, vi } from "vitest";

import {
  agentShort,
  facebookSharerUrl,
  listingShareUrl,
  photoDownloadUrl,
  viberForwardUrl,
} from "@/lib/distribute/links";

const ID = "11111111-2222-3333-4444-555555555555";
const SB = "https://abc.supabase.co";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("listingShareUrl", () => {
  it("суваг бүрийн UTM", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.nemi.mn");
    const cases = [
      ["facebook", "social"],
      ["viber", "messenger"],
      ["unegui", "classified"],
    ] as const;
    for (const [ch, medium] of cases) {
      const u = new URL(listingShareUrl(ID, ch, "abcd1234"));
      expect(u.origin + u.pathname).toBe(`https://www.nemi.mn/listings/${ID}`);
      expect(u.searchParams.get("utm_source")).toBe(ch);
      expect(u.searchParams.get("utm_medium")).toBe(medium);
      expect(u.searchParams.get("utm_campaign")).toBe("listing");
      expect(u.searchParams.get("utm_content")).toBe("abcd1234");
    }
  });
  it("NEXT_PUBLIC_SITE_URL-ийн төгсгөлийн «/»-г хасна", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.nemi.mn/");
    expect(listingShareUrl(ID, "viber", "nemi")).toMatch(/^https:\/\/staging\.nemi\.mn\/listings\//);
  });
});

describe("agentShort", () => {
  it("эхний 8 hex", () => {
    expect(agentShort("ABCDEF12-3456-7890-abcd-ef1234567890")).toBe("abcdef12");
    expect(agentShort("0a1b-2c3d-4e5f")).toBe("0a1b2c3d");
  });
  it("fallback", () => {
    expect(agentShort(null)).toBe("nemi");
    expect(agentShort("")).toBe("nemi");
    expect(agentShort("xyz")).toBe("nemi");
  });
});

describe("photoDownloadUrl", () => {
  it("зөвхөн Supabase public URL-д download залгана", () => {
    const pub = `${SB}/storage/v1/object/public/listing-photos/a/b.jpg`;
    expect(photoDownloadUrl(pub, "nemi-1.jpg", SB)).toBe(`${pub}?download=nemi-1.jpg`);
    expect(photoDownloadUrl(`${pub}?v=2`, "a b.jpg", SB)).toBe(`${pub}?v=2&download=a%20b.jpg`);
    expect(photoDownloadUrl("https://images.unsplash.com/x.jpg", "n.jpg", SB)).toBe("https://images.unsplash.com/x.jpg");
    expect(photoDownloadUrl(`${SB}/storage/v1/object/sign/x.jpg`, "n.jpg", SB)).toBe(`${SB}/storage/v1/object/sign/x.jpg`);
    expect(photoDownloadUrl(pub, "n.jpg", undefined)).toBe(pub);
  });
  it("supabaseUrl-ийн төгсгөлийн «/»", () => {
    const pub = `${SB}/storage/v1/object/public/p.jpg`;
    expect(photoDownloadUrl(pub, "n.jpg", `${SB}/`)).toBe(`${pub}?download=n.jpg`);
  });
});

describe("deep links", () => {
  it("кодчилол", () => {
    expect(viberForwardUrl("Зарна: 2 өрөө & https://x?a=1")).toBe(
      `viber://forward?text=${encodeURIComponent("Зарна: 2 өрөө & https://x?a=1")}`
    );
    const link = "https://www.nemi.mn/listings/1?utm_source=facebook&utm_medium=social";
    expect(facebookSharerUrl(link)).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fwww.nemi.mn%2Flistings%2F1%3Futm_source%3Dfacebook%26utm_medium%3Dsocial"
    );
  });
});
