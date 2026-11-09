import { describe, expect, it, vi } from "vitest";

import { ingestLead } from "@/lib/crm/lead-intake";

const ID_LISTING = "6f1c2f6e-3b1a-4c55-9a44-0d6f6f6f6f6a";

const fake = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake.admin }));
vi.mock("@/lib/crm/notify", () => ({ notifyCrm: vi.fn() }));

function chain(result: unknown) {
  const builder: Record<string, unknown> = {
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  for (const method of ["select", "eq", "in", "is", "limit", "order"]) builder[method] = () => builder;
  return builder;
}

const listingRow = {
  id: ID_LISTING,
  title: "Зайсан 3 өрөө",
  price: 285_000_000,
  deal_type: "sale",
  district: "Хан-Уул",
  type: "Орон сууц",
  rooms: 3,
  area: 85,
  photo: null,
};

function setup(openLead: { listing_id: string | null; listing_snapshot: unknown }) {
  const update = vi.fn((values: Record<string, unknown>) => chain({ error: null, values }));
  const fetchListing = vi.fn(() => chain({ data: listingRow, error: null }));
  fake.admin = {
    from: (table: string) => {
      if (table === "crm_lookups") return chain({ data: { id: "source" } });
      if (table === "crm_contact_phones") {
        return chain({ data: [{ contact_id: "contact", contact: { merged_into_id: null } }] });
      }
      if (table === "listings") return fetchListing();
      if (table === "crm_leads") return { ...chain({ data: { id: "lead", owner_id: null, ...openLead } }), update };
      throw new Error(`Хүлээгээгүй хүснэгт: ${table}`);
    },
  };
  return { update, fetchListing };
}

function ingest(channelRef: string) {
  return ingestLead({
    officeId: "office",
    fullName: "Бат Болд",
    phone: "99112233",
    email: null,
    sourceCode: "listing_inquiry",
    sourceDetail: null,
    channelRef,
    registrarId: "registrar",
  });
}

describe("ingestLead: нээлттэй сэжимд зар холбох", () => {
  it("зар холбогдоогүй сэжимд хандалтын зарыг холбоно", async () => {
    const { update } = setup({ listing_id: null, listing_snapshot: null });
    await expect(ingest(`listing:${ID_LISTING}`)).resolves.toMatchObject({ leadId: "lead", existing: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({
      listing_id: ID_LISTING,
      listing_snapshot: { title: "Зайсан 3 өрөө", price: 285_000_000 },
    });
  });

  it("зартай сэжимийг өөрчлөхгүй", async () => {
    const { update, fetchListing } = setup({ listing_id: "other", listing_snapshot: { title: "Өөр" } });
    await ingest(`listing:${ID_LISTING}`);
    expect(fetchListing).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("устсан зарын хуулбартай сэжимийг өөрчлөхгүй", async () => {
    const { update } = setup({ listing_id: null, listing_snapshot: { title: "Устсан" } });
    await ingest(`listing:${ID_LISTING}`);
    expect(update).not.toHaveBeenCalled();
  });

  it("зарын лавлагаагүй хандалтад өөрчлөхгүй", async () => {
    const { update, fetchListing } = setup({ listing_id: null, listing_snapshot: null });
    await ingest(`agent:${ID_LISTING}`);
    expect(fetchListing).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
