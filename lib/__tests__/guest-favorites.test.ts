import { describe, it, expect } from "vitest";

import {
  GUEST_FAVS_MAX,
  parseGuestFavorites,
  sanitizeListingIds,
  toggleGuestFavorite,
} from "@/lib/guest-favorites";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1);
const B = id(2);
const C = id(3);

describe("sanitizeListingIds", () => {
  it("массив биш → []", () => {
    expect(sanitizeListingIds(null)).toEqual([]);
    expect(sanitizeListingIds(undefined)).toEqual([]);
    expect(sanitizeListingIds("abc")).toEqual([]);
    expect(sanitizeListingIds({ 0: A })).toEqual([]);
  });
  it("холимог төрөл, буруу мөрийг хаяна", () => {
    expect(sanitizeListingIds([A, 1, null, {}, "x", `${A} `, "' or 1=1", B])).toEqual([A, B]);
  });
  it("том үсгийг жижиг болгож, дарааллаа хадгалан давхардлыг хасна", () => {
    expect(sanitizeListingIds([B, A.toUpperCase(), A, B, C])).toEqual([B, A, C]);
  });
  it("дээд хязгаар (анхдагч 100)", () => {
    const many = Array.from({ length: 150 }, (_, i) => id(i));
    expect(sanitizeListingIds(many)).toHaveLength(GUEST_FAVS_MAX);
    expect(sanitizeListingIds(many)[0]).toBe(id(0));
    expect(sanitizeListingIds(many, 3)).toEqual([id(0), id(1), id(2)]);
  });
});

describe("parseGuestFavorites", () => {
  it("null, эвдэрсэн JSON, объект → []", () => {
    expect(parseGuestFavorites(null)).toEqual([]);
    expect(parseGuestFavorites("{not json")).toEqual([]);
    expect(parseGuestFavorites(JSON.stringify({ ids: [A] }))).toEqual([]);
  });
  it("зөв массив", () => {
    expect(parseGuestFavorites(JSON.stringify([A, "bad", B]))).toEqual([A, B]);
  });
});

describe("toggleGuestFavorite", () => {
  it("байхгүй бол эхэнд нэмнэ", () => {
    expect(toggleGuestFavorite([A], B)).toEqual({ ids: [B, A], saved: true });
  });
  it("байвал хасна", () => {
    expect(toggleGuestFavorite([B, A], A)).toEqual({ ids: [B], saved: false });
    expect(toggleGuestFavorite([B, A], A.toUpperCase())).toEqual({ ids: [B], saved: false });
  });
  it("хязгаар хадгалагдана (хамгийн хуучин нь унана)", () => {
    const full = Array.from({ length: GUEST_FAVS_MAX }, (_, i) => id(i));
    const r = toggleGuestFavorite(full, id(999));
    expect(r.saved).toBe(true);
    expect(r.ids).toHaveLength(GUEST_FAVS_MAX);
    expect(r.ids[0]).toBe(id(999));
    expect(r.ids).not.toContain(id(GUEST_FAVS_MAX - 1));
  });
});
