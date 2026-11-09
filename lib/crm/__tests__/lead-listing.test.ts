import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  fetchListingForLead,
  groupLeadsByListing,
  listingInactiveLabel,
  listingPriceLabel,
  listingSearchTerms,
  listingSpecLabel,
  parseListingRef,
  parseListingSnapshot,
  toListingOption,
  toListingSnapshot,
  type LeadListingRow,
  type LeadListingSourceRow,
} from "@/lib/crm/lead-listing";
import { validateLeadInput, validateSetLeadListing } from "@/lib/validation/crm";
import type { Database } from "@/types/database";

const ID_A = "6f1c2f6e-3b1a-4c55-9a44-0d6f6f6f6f6a";
const ID_B = "7f1c2f6e-3b1a-4c55-9a44-0d6f6f6f6f6b";

const row: LeadListingRow = {
  id: ID_A,
  title: "Зайсан 3 өрөө",
  price: 285_000_000,
  deal_type: "sale",
  district: "Хан-Уул",
  type: "Орон сууц",
  rooms: 3,
  area: 85,
  photo: "https://example.test/a.jpg",
  agent: { office: { name: "PMC" } },
};

const snapshotJson = {
  title: "Зайсан 3 өрөө",
  price: 285_000_000,
  deal_type: "sale",
  district: "Хан-Уул",
  type: "Орон сууц",
  rooms: 3,
  area: 85,
  photo: null,
  captured_at: "2026-11-09T00:00:00.000Z",
};

describe("toListingSnapshot", () => {
  it("зөвхөн хуулбарын талбаруудыг, тогтсон цагтай хадгална", () => {
    const snap = toListingSnapshot(row, new Date("2026-11-09T01:02:03.000Z"));
    expect(snap).toEqual({
      title: "Зайсан 3 өрөө",
      price: 285_000_000,
      deal_type: "sale",
      district: "Хан-Уул",
      type: "Орон сууц",
      rooms: 3,
      area: 85,
      photo: "https://example.test/a.jpg",
      captured_at: "2026-11-09T01:02:03.000Z",
    });
  });
});

describe("toListingOption", () => {
  it("оффисын нэрийг embed-ээс гаргана, байхгүй бол null", () => {
    expect(toListingOption(row).office_name).toBe("PMC");
    expect(toListingOption({ ...row, agent: null }).office_name).toBeNull();
  });
});

describe("parseListingSnapshot", () => {
  it("зөв jsonb-г хүлээн авна", () => {
    expect(parseListingSnapshot(snapshotJson)?.title).toBe("Зайсан 3 өрөө");
  });

  it("бүрэн бус утгад null", () => {
    expect(parseListingSnapshot(null)).toBeNull();
    expect(parseListingSnapshot([])).toBeNull();
    expect(parseListingSnapshot("x")).toBeNull();
    expect(parseListingSnapshot({ title: "x" })).toBeNull();
  });
});

describe("parseListingRef", () => {
  it("listing:<uuid> хэлбэрийг задална", () => {
    expect(parseListingRef(`listing:${ID_A}`)).toBe(ID_A);
    expect(parseListingRef(`listing:${ID_A.toUpperCase()}`)).toBe(ID_A);
  });

  it("бусад утгад null", () => {
    expect(parseListingRef(null)).toBeNull();
    expect(parseListingRef(undefined)).toBeNull();
    expect(parseListingRef("")).toBeNull();
    expect(parseListingRef(`agent:${ID_A}`)).toBeNull();
    expect(parseListingRef(`open_house:${ID_A}`)).toBeNull();
    expect(parseListingRef("listing:abc")).toBeNull();
    expect(parseListingRef(`listing:${ID_A}x`)).toBeNull();
  });
});

describe("listingSearchTerms", () => {
  it("хоосон утгад хоосон жагсаалт", () => {
    expect(listingSearchTerms("")).toEqual([]);
    expect(listingSearchTerms("  ,()%  ")).toEqual([]);
  });

  it("монгол үсэг, тоо, зураасыг хадгалж үгээр хуваана", () => {
    expect(listingSearchTerms("Хан-Уул  3 өрөө")).toEqual(["Хан-Уул", "3", "өрөө"]);
  });

  it("PostgREST .or() бүтцийг эвдэх тэмдэгт үлдэхгүй", () => {
    const hostile = [
      "a,price.eq.1",
      "x),(title.ilike.*",
      'x"y',
      "x\\",
      "100%_*",
      "and(status.eq.draft)",
    ];
    for (const input of hostile) {
      for (const term of listingSearchTerms(input)) expect(term).not.toMatch(/[,()"\\%_*]/);
    }
    expect(listingSearchTerms("a,price.eq.1")).toEqual(["a", "price.eq.1"]);
  });

  it("үгийн тоо, уртыг хязгаарлана", () => {
    expect(listingSearchTerms("a b c d e f g")).toHaveLength(5);
    expect(listingSearchTerms("я".repeat(100))[0]).toHaveLength(40);
  });
});

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const eq = vi.fn();
  const builder = { select: () => builder, eq, maybeSingle: async () => result };
  eq.mockReturnValue(builder);
  return { client: { from: () => builder } as unknown as SupabaseClient<Database>, eq };
}

describe("fetchListingForLead", () => {
  it("activeOnly үед төлөвөөр шүүнэ", async () => {
    const { client, eq } = fakeClient({ data: row, error: null });
    await expect(fetchListingForLead(client, ID_A, { activeOnly: true })).resolves.toBe(row);
    expect(eq).toHaveBeenCalledWith("id", ID_A);
    expect(eq).toHaveBeenCalledWith("status", "active");
  });

  it("анхдагчаар төлөвөөр шүүхгүй", async () => {
    const { client, eq } = fakeClient({ data: row, error: null });
    await fetchListingForLead(client, ID_A);
    expect(eq).toHaveBeenCalledTimes(1);
  });

  it("олдоогүй, алдаатай үед null (шидэхгүй)", async () => {
    const silent = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(fetchListingForLead(fakeClient({ data: null, error: null }).client, ID_A)).resolves.toBeNull();
    await expect(
      fetchListingForLead(fakeClient({ data: null, error: { message: "boom" } }).client, ID_A)
    ).resolves.toBeNull();
    silent.mockRestore();
  });
});

function lead(over: Partial<LeadListingSourceRow>): LeadListingSourceRow {
  return {
    id: "l1",
    status: "new",
    created_at: "2026-11-01T00:00:00+00:00",
    listing_id: ID_A,
    listing_snapshot: snapshotJson,
    live_status: "active",
    live_listing: null,
    contact_name: "Бат",
    owner_name: "Сараа",
    ...over,
  };
}

describe("groupLeadsByListing", () => {
  it("нэг зарын сэжмүүдийг нэгтгэж, нээлттэйг зөв тоолно", () => {
    const [group, ...rest] = groupLeadsByListing([
      lead({ id: "l1", status: "new" }),
      lead({ id: "l2", status: "active", created_at: "2026-11-03T00:00:00+00:00" }),
      lead({ id: "l3", status: "inactive", created_at: "2026-11-02T00:00:00+00:00" }),
      lead({ id: "l4", status: "archived" }),
      lead({ id: "l5", status: "recycled" }),
    ]);
    expect(rest).toEqual([]);
    expect(group.lead_count).toBe(5);
    expect(group.open_lead_count).toBe(2);
    expect(group.latest_lead_at).toBe("2026-11-03T00:00:00+00:00");
    expect(group.leads[0].id).toBe("l2");
  });

  it("сүүлд бүртгэгдсэн зар эхэндээ", () => {
    const groups = groupLeadsByListing([
      lead({ id: "old", listing_id: ID_A }),
      lead({ id: "new", listing_id: ID_B, created_at: "2026-11-05T00:00:00+00:00" }),
    ]);
    expect(groups.map((g) => g.listing_id)).toEqual([ID_B, ID_A]);
  });

  it("амьд зар харагдахгүй бол хуулбарт найдна", () => {
    const [group] = groupLeadsByListing([lead({ live_status: null })]);
    expect(group.is_readable).toBe(false);
    expect(group.is_active).toBe(false);
    expect(group.listing?.title).toBe("Зайсан 3 өрөө");
  });

  it("идэвхтэй зарын одоогийн мэдээллийг харуулна", () => {
    const [group] = groupLeadsByListing([lead({ live_listing: { ...row, price: 250_000_000 } })]);
    expect(group.listing?.price).toBe(250_000_000);
  });

  it("зар идэвхгүй болсон бол бүртгэсэн үеийн хуулбарыг харуулна", () => {
    const [group] = groupLeadsByListing([lead({ live_status: "sold", live_listing: { ...row, price: 250_000_000 } })]);
    expect(group.listing?.price).toBe(285_000_000);
  });

  it("зарагдсан зар уншигдах ч идэвхгүй", () => {
    const [group] = groupLeadsByListing([lead({ live_status: "sold" })]);
    expect(group.is_readable).toBe(true);
    expect(group.is_active).toBe(false);
  });

  it("устсан зарын сэжмүүдийг хуулбараар нэгтгэнэ", () => {
    const groups = groupLeadsByListing([
      lead({ id: "l1", listing_id: null, live_status: null }),
      lead({
        id: "l2",
        listing_id: null,
        live_status: null,
        listing_snapshot: { ...snapshotJson, captured_at: "2026-11-08T00:00:00.000Z" },
      }),
      lead({ id: "l3", listing_id: null, live_status: null, listing_snapshot: { ...snapshotJson, title: "Өөр зар" } }),
    ]);
    expect(groups.map((g) => g.lead_count).sort()).toEqual([1, 2]);
    expect(groups.every((g) => g.listing_id === null)).toBe(true);
    expect(new Set(groups.map((g) => g.key)).size).toBe(2);
  });

  it("зар тодорхойгүй сэжмийг алгасна", () => {
    expect(groupLeadsByListing([lead({ listing_id: null, listing_snapshot: null })])).toEqual([]);
  });

  it("хуулбаргүй ч listing_id-тай бол бүлэгт орж, хуулбар нь null", () => {
    const [group] = groupLeadsByListing([lead({ listing_snapshot: null })]);
    expect(group.listing_id).toBe(ID_A);
    expect(group.listing).toBeNull();
  });
});

describe("харуулах туслахууд", () => {
  it("түрээсийн үнийг бөөрөнхийлөхгүй, /сар нэмнэ", () => {
    expect(listingPriceLabel({ price: 285_000_000, deal_type: "sale" })).toBe("285 сая₮");
    expect(listingPriceLabel({ price: 2_000_000, deal_type: "rent" })).toBe("2,000,000₮/сар");
    expect(listingPriceLabel({ price: 1_450_000, deal_type: "rent" })).toBe("1,450,000₮/сар");
  });

  it("0 өрөө, хоосон талбарыг алгасна", () => {
    expect(listingSpecLabel({ type: "Газар", district: "Хан-Уул", rooms: 0, area: 700 })).toBe("Газар · Хан-Уул · 700 м²");
    expect(listingSpecLabel({ type: null, district: null, rooms: 3, area: null })).toBe("3 өрөө");
  });

  it("идэвхтэй зарт шошгогүй, бусад үед тайлбартай", () => {
    expect(listingInactiveLabel("active")).toBeNull();
    expect(listingInactiveLabel("sold")).toBe("Зарагдсан");
    expect(listingInactiveLabel(null)).toBe("Идэвхгүй болсон");
    expect(listingInactiveLabel("withdrawn")).toBe("Идэвхгүй болсон");
  });
});

describe("зарын оролтын баталгаажуулалт", () => {
  const base = {
    contactId: ID_A,
    newContact: null,
    sourceId: null,
    campaignCode: null,
    channelRef: null,
    branchId: null,
    grade: null,
    gradeOverrideReason: null,
    nextStep: null,
    nextStepDate: null,
  };

  it("listingId нь сонголттой, null эсвэл uuid", () => {
    expect("data" in validateLeadInput(base)).toBe(true);
    expect("data" in validateLeadInput({ ...base, listingId: null })).toBe(true);
    expect("data" in validateLeadInput({ ...base, listingId: ID_B })).toBe(true);
    expect("error" in validateLeadInput({ ...base, listingId: "not-a-uuid" })).toBe(true);
  });

  it("setLeadListing-ийн оролт", () => {
    expect("data" in validateSetLeadListing({ leadId: ID_A, listingId: null })).toBe(true);
    expect("data" in validateSetLeadListing({ leadId: ID_A, listingId: ID_B })).toBe(true);
    expect("error" in validateSetLeadListing({ leadId: "x", listingId: ID_B })).toBe(true);
    expect("error" in validateSetLeadListing({ leadId: ID_A, listingId: "x" })).toBe(true);
  });
});
