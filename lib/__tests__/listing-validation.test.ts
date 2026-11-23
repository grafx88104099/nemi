import { describe, expect, it } from "vitest";

import { validateListingInput } from "@/lib/validation/listing";

const BASE = {
  title: "3 өрөө · River Garden",
  type: "Орон сууц",
  district: "Хан-Уул",
  rooms: 3,
  area: 96.5,
  floor: "12/18",
  price: 350_000_000,
  year: 2022,
  parking: 0,
  description: "",
  amenities: ["Лифттэй"],
  features: [] as string[],
  photos: ["https://example.com/a.jpg"],
  status: "active",
  deal_type: "sale",
  rent_advance_months: null,
  rent_deposit_months: null,
  lat: null,
  lng: null,
};

const ok = (input: unknown) => {
  const r = validateListingInput(input);
  if ("error" in r) throw new Error(r.error);
  return r.data;
};

describe("validateListingInput — features", () => {
  it("хүчинтэй онцлогийг толийн дарааллаар хэвшүүлнэ", () => {
    expect(ok({ ...BASE, features: ["parking", "furnished"] }).features).toEqual(["furnished", "parking"]);
  });

  it("танихгүй түлхүүрт «Онцлог» алдаа", () => {
    const r = validateListingInput({ ...BASE, features: ["jacuzzi"] });
    expect(r).toEqual({ error: "«Онцлог» талбар буруу байна." });
  });

  it("хэт олон онцлог", () => {
    const r = validateListingInput({ ...BASE, features: Array(9).fill("parking") });
    expect(r).toEqual({ error: "Онцлог хэт олон байна" });
  });

  it("features илгээгээгүй хуучин клиент → undefined (.strict() дор ч хүчинтэй, UPDATE баганыг хөндөхгүй)", () => {
    const { features: _omit, ...stale } = BASE;
    void _omit;
    const d = ok(stale);
    expect(d.features).toBeUndefined();
    expect("features" in d).toBe(false);
    // parking > 0 ч features үүсгэхгүй — DB триггер listings_features_parking нэмнэ.
    expect("features" in ok({ ...stale, parking: 2 })).toBe(false);
  });

  it("хоосон массив илгээвэл [] (тодорхой цэвэрлэлт хэвээр)", () => {
    expect(ok({ ...BASE, features: [] }).features).toEqual([]);
  });

  it("parking > 0 → 'parking' заавал", () => {
    expect(ok({ ...BASE, parking: 2, features: [] }).features).toEqual(["parking"]);
    expect(ok({ ...BASE, parking: 1, features: ["elevator"] }).features).toEqual(["parking", "elevator"]);
  });

  it("бусад талбарын зан төлөв хэвээр", () => {
    const d = ok(BASE);
    expect(d).toMatchObject({ title: BASE.title, price: BASE.price, amenities: ["Лифттэй"], status: "active" });
    expect(validateListingInput({ ...BASE, price: 0 })).toEqual({ error: "Үнэ 0-ээс их байх ёстой" });
    expect(validateListingInput({ ...BASE, title: " " })).toEqual({ error: "Гарчиг оруулна уу" });
    expect(validateListingInput({ ...BASE, extra: 1 })).toHaveProperty("error");
    expect(validateListingInput({ ...BASE, lat: "x" })).toEqual({ error: "«Байршил» талбар буруу байна." });
  });
});
