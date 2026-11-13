import { describe, expect, it } from "vitest";

import {
  advancedFilterCount,
  hasStaffFilters,
  parseStaffListParams,
  statusOptionsForView,
  toPropertyListFilters,
} from "../list-params";

const UUID = "3f0c2b9e-1d2a-4c55-9a7e-0b1c2d3e4f50";

describe("parseStaffListParams", () => {
  it("анхдагч: идэвхтэй харагдац, «Идэвхтэй» төлөв, шүүлтүүргүй, 1-р хуудас, шинэ бүртгэл эхэнд", () => {
    const p = parseStaffListParams({});
    expect(p).toEqual({
      view: "active",
      category: null,
      status: "active",
      project: null,
      district: null,
      loc: null,
      q: null,
      sort: "created",
      page: 1,
    });
    expect(hasStaffFilters(p)).toBe(false);
    expect(advancedFilterCount(p)).toBe(0);
  });

  it("зөв утгуудыг уншина", () => {
    const p = parseStaffListParams({
      view: "archive",
      category: "managed_rent",
      status: "contract_ended",
      project: UUID.toUpperCase(),
      district: " Хан-Уул ",
      loc: "  Зайсан   хотхон ",
      q: "3 өрөө",
      sort: "activated",
      page: "3",
    });
    expect(p).toMatchObject({
      view: "archive",
      category: "managed_rent",
      status: "contract_ended",
      project: UUID,
      district: "Хан-Уул",
      loc: "Зайсан хотхон",
      q: "3 өрөө",
      sort: "activated",
      page: 3,
    });
    expect(hasStaffFilters(p)).toBe(true);
    expect(advancedFilterCount(p)).toBe(5);
  });

  it("буруу утгыг хасна", () => {
    const p = parseStaffListParams({
      view: "deleted",
      category: "rental",
      project: "not-a-uuid",
      sort: "price",
      page: "-2",
    });
    expect(p.view).toBe("active");
    expect(p.category).toBeNull();
    expect(p.project).toBeNull();
    expect(p.sort).toBe("created");
    expect(p.page).toBe(1);
    expect(parseStaffListParams({ page: "abc" }).page).toBe(1);
    expect(parseStaffListParams({ page: "2.7" }).page).toBe(2);
  });

  it("төлөв нь сонгосон харагдацынх байх ёстой (эс бөгөөс анхдагч)", () => {
    expect(parseStaffListParams({ status: "archived" }).status).toBe("active");
    expect(parseStaffListParams({ view: "archive", status: "active" }).status).toBeNull();
    expect(parseStaffListParams({ status: "rented" }).status).toBe("rented");
    // Ноорог харагдацад ганц төлөвтэй тул төлвийн шүүлтүүр хэрэггүй.
    expect(parseStaffListParams({ view: "draft", status: "draft" }).status).toBeNull();
  });

  it("?status=all — идэвхтэй бүлгийн бүх төлөв, шүүлтүүр гэж тоологдоно", () => {
    const all = parseStaffListParams({ status: "all" });
    expect(all.status).toBeNull();
    expect(hasStaffFilters(all)).toBe(true);
    expect(advancedFilterCount(all)).toBe(1);
    expect(toPropertyListFilters(all).status).toBeNull();
    // Анхдагчийг шууд сонгосон ч шүүлтүүр биш.
    const explicit = parseStaffListParams({ status: "active" });
    expect(hasStaffFilters(explicit)).toBe(false);
    expect(advancedFilterCount(explicit)).toBe(0);
    // Анхдагчгүй харагдацад all = анхдагч.
    const archive = parseStaffListParams({ view: "archive", status: "all" });
    expect(archive.status).toBeNull();
    expect(hasStaffFilters(archive)).toBe(false);
  });

  it("массив параметрээс эхнийхийг авч, уртыг хязгаарлана", () => {
    const p = parseStaffListParams({ q: ["нэг", "хоёр"], loc: "x".repeat(500) });
    expect(p.q).toBe("нэг");
    expect(p.loc).toHaveLength(200);
  });
});

describe("statusOptionsForView", () => {
  it("харагдацын төлвүүд", () => {
    expect(statusOptionsForView("active")).toEqual(["active", "suspended", "rented", "sold"]);
    expect(statusOptionsForView("archive")).toEqual(["contract_ended", "archived"]);
    expect(statusOptionsForView("draft")).toEqual(["draft"]);
  });
});

describe("toPropertyListFilters", () => {
  it("listProperties-ийн шүүлтүүр болгоно", () => {
    const p = parseStaffListParams({ view: "draft", category: "sale", project: UUID, loc: "Зайсан", q: "P012", page: "2" });
    expect(toPropertyListFilters(p)).toEqual({
      statusGroup: "draft",
      status: null,
      category: "sale",
      projectId: UUID,
      district: null,
      location: "Зайсан",
      q: "P012",
      sort: "created",
      page: 2,
    });
    expect(toPropertyListFilters(p, 12).pageSize).toBe(12);
  });
});
