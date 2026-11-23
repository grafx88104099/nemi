import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  closedHeadline,
  closedLabel,
  listingDescription,
  listingHeadline,
  listingJsonLd,
  listingMetaFor,
  priceShort,
  type ClosedListing,
  type ListingSeo,
} from "@/lib/seo/listing";
import { ROOT_OG_IMAGE } from "@/lib/seo/site";

const SB = "https://abcd.supabase.co";
const ID = "4209416d-a46c-4745-914f-2c7cbb5573fa";

function mk(o: Partial<ListingSeo> = {}): ListingSeo {
  return {
    id: ID,
    title: "Хан-Уул, 3 өрөө байр",
    description: "Тохилог байр.",
    price: 420_000_000,
    price_per_m2: null,
    deal_type: "sale",
    type: "Орон сууц",
    rooms: 3,
    area: 78,
    floor: "15/16",
    district: "Хан-Уул",
    photo: `${SB}/storage/v1/object/public/listing-photos/a.jpg`,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-02T00:00:00Z",
    ...o,
  };
}

const closed = (o: Partial<ClosedListing> = {}): ClosedListing => ({
  id: ID,
  deal_type: "sale",
  type: "Орон сууц",
  district: "Хан-Уул",
  rooms: 3,
  area: 78,
  floor: "5",
  photo: `${SB}/storage/v1/object/public/listing-photos/c.jpg`,
  ...o,
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SB);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("priceShort", () => {
  it("товчилно", () => {
    expect(priceShort(420_000_000)).toBe("420 сая₮");
    expect(priceShort(2_500_000)).toBe("2.5 сая₮");
    expect(priceShort(1_650_000_000)).toBe("1.65 тэрбум₮");
    expect(priceShort(7_226_460_000)).toBe("7.23 тэрбум₮");
    expect(priceShort(82_500)).toBe("82.5 мянга₮");
    expect(priceShort(950)).toBe("950₮");
  });
});

describe("listingHeadline", () => {
  it("худалдах орон сууц", () => {
    expect(listingHeadline(mk())).toBe("3 өрөө, 78м², Хан-Уул — 420 сая₮");
  });
  it("түрээс /сар, талбай бүхэлчилнэ", () => {
    expect(
      listingHeadline(mk({ deal_type: "rent", rooms: 2, area: 52.97, district: "Баянзүрх", price: 2_500_000 }))
    ).toBe("2 өрөө, 53м², Баянзүрх — 2.5 сая₮/сар");
  });
  it("өрөөгүй оффис", () => {
    expect(listingHeadline(mk({ rooms: 0, type: "Оффис" }))).toMatch(/^Оффис, /);
  });
  it("хаус", () => {
    expect(listingHeadline(mk({ type: "Хаус" }))).toMatch(/^3 өрөө хаус, /);
  });
  it("талбай/дүүрэггүй бол илүү таслал гарахгүй", () => {
    const h = listingHeadline(mk({ area: null, district: null }));
    expect(h).toBe("3 өрөө — 420 сая₮");
    expect(h).not.toMatch(/,\s*,|,\s*—/);
  });
});

describe("listingDescription", () => {
  it("гарчгаар эхэлнэ", () => {
    expect(listingDescription(mk())).toMatch(/^Хан-Уул, 3 өрөө байр\. /);
  });
  it("худалдахад м² үнэ (price_per_m2 эсвэл price/area)", () => {
    expect(listingDescription(mk({ price_per_m2: 5_000_000 }))).toContain("м² 5 сая₮");
    expect(listingDescription(mk())).toContain("м² ");
  });
  it("түрээст м² үнэ байхгүй", () => {
    expect(listingDescription(mk({ deal_type: "rent", price: 2_500_000, title: "Байр" }))).not.toContain("м²");
  });
  it("давхар", () => {
    expect(listingDescription(mk())).toContain("15/16 давхар");
    expect(listingDescription(mk({ floor: "-" }))).not.toContain("давхар");
  });
  it("≤160, «…», мөр шилжилтгүй", () => {
    const d = listingDescription(mk({ description: "Маш урт\nтайлбар ".repeat(40) }));
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toContain("\n");
  });
});

describe("closedLabel / closedHeadline", () => {
  it("deal_type-аар шошго", () => {
    expect(closedLabel("rent")).toBe("Түрээслэгдсэн");
    expect(closedLabel("sale")).toBe("Зарагдсан");
  });
  it("үнэгүй", () => {
    const h = closedHeadline(closed());
    expect(h).toBe("3 өрөө, 78м², Хан-Уул");
    expect(h).not.toContain("₮");
  });
  it("ClosedListing төрөлд title байхгүй (type-level)", () => {
    // @ts-expect-error — ClosedListing-д title талбар байх ёсгүй.
    const t: ClosedListing["title"] = undefined;
    expect(t).toBeUndefined();
  });
});

describe("listingMetaFor", () => {
  it("invalid / none → noindex,nofollow, openGraph-гүй", () => {
    for (const r of [{ kind: "invalid" as const }, { kind: "none" as const }]) {
      const m = listingMetaFor("x", r);
      expect(m.robots).toEqual({ index: false, follow: false });
      expect(m.openGraph).toBeUndefined();
    }
  });

  it("active → canonical, /_next/image og, large card", () => {
    const m = listingMetaFor(ID, { kind: "active", l: mk() });
    expect(m.alternates?.canonical).toBe(`/listings/${ID}`);
    const og = m.openGraph as { images: { url: string }[]; siteName: string };
    expect(og.images[0].url.startsWith(`/_next/image?url=${encodeURIComponent("https://abcd.supabase.co")}`)).toBe(
      true
    );
    expect(og.images[0].url).toContain("&w=1200&q=75");
    expect(og.siteName).toBe("Нэми");
    expect((m.twitter as { card: string }).card).toBe("summary_large_image");
    expect(String(m.title).endsWith(" | Нэми")).toBe(true);
  });

  it("active, primary зураг эхэнд", () => {
    const m = listingMetaFor(ID, {
      kind: "active",
      l: mk({
        photos: [
          { url: `${SB}/p/2.jpg`, sort_order: 0, is_primary: false },
          { url: `${SB}/p/1.jpg`, sort_order: 5, is_primary: true },
        ],
      }),
    });
    const og = m.openGraph as { images: { url: string }[] };
    expect(og.images[0].url).toContain(encodeURIComponent(`${SB}/p/1.jpg`));
  });

  it("active, зураггүй → ROOT_OG_IMAGE, summary", () => {
    const m = listingMetaFor(ID, { kind: "active", l: mk({ photo: null }) });
    expect((m.openGraph as { images: unknown[] }).images[0]).toEqual(ROOT_OG_IMAGE);
    expect((m.twitter as { card: string }).card).toBe("summary");
  });

  it("closed → noindex,follow, canonical-гүй, үнэгүй", () => {
    const m = listingMetaFor(ID, { kind: "closed", c: closed() });
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates).toBeUndefined();
    expect(String(m.title)).toMatch(/Зарагдсан|Түрээслэгдсэн/);
    const json = JSON.stringify(m);
    expect(json).not.toContain("₮");
    expect(json).not.toContain("420000000");
    expect((m.openGraph as { url?: string }).url).toBeUndefined();
    expect(String(listingMetaFor(ID, { kind: "closed", c: closed({ deal_type: "rent" }) }).title)).toContain(
      "Түрээслэгдсэн"
    );
  });
});

describe("listingJsonLd", () => {
  const url = `https://www.nemi.mn/listings/${ID}`;
  type Graph = { "@graph": [Record<string, unknown>, { itemListElement: { position: number }[] }] };

  it("RealEstateListing + MNT", () => {
    const j = listingJsonLd(mk(), url) as unknown as Graph;
    expect(j["@graph"][0]["@type"]).toBe("RealEstateListing");
    expect((j["@graph"][0].offers as { priceCurrency: string }).priceCurrency).toBe("MNT");
  });

  it("түрээс → unitCode MON", () => {
    const j = listingJsonLd(mk({ deal_type: "rent", price: 2_500_000 }), url) as unknown as Graph;
    const offers = j["@graph"][0].offers as { priceSpecification: { unitCode: string } };
    expect(offers.priceSpecification.unitCode).toBe("MON");
  });

  it("хувийн талбаргүй", () => {
    const s = JSON.stringify(listingJsonLd({ ...mk(), owner_phone: "99119911" } as ListingSeo, url));
    for (const bad of ["owner", "phone", "location", "address_detail", "99119911"]) expect(s).not.toContain(bad);
  });

  it("image[0] = is_primary", () => {
    const j = listingJsonLd(
      mk({
        photos: [
          { url: "https://x/2.jpg", sort_order: 0, is_primary: false },
          { url: "https://x/1.jpg", sort_order: 9, is_primary: true },
        ],
      }),
      url
    ) as unknown as Graph;
    expect((j["@graph"][0].image as string[])[0]).toBe("https://x/1.jpg");
  });

  it("BreadcrumbList байрлал 1..n (дүүрэгтэй/дүүрэггүй)", () => {
    const cases: [ListingSeo, number][] = [
      [mk(), 4],
      [mk({ district: null }), 3],
    ];
    for (const [l, n] of cases) {
      const items = (listingJsonLd(l, url) as unknown as Graph)["@graph"][1].itemListElement;
      expect(items.map((i) => i.position)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });
});
