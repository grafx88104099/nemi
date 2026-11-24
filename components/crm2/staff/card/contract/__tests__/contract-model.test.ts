import { describe, expect, it } from "vitest";

import type { ChecklistInput } from "@/lib/crm2/checklist";

import {
  activationPanelState,
  applyCommission,
  approveFileArg,
  commissionRecalc,
  commissionWarning,
  composeSignerNote,
  confirmPrefilled,
  contractAgentPatch,
  contractDirty,
  contractDraftFields,
  contractFormErrors,
  contractMissing,
  editContractField,
  fileCounts,
  initialContractForm,
  initialStep,
  parseAmount,
  parseSignerNote,
  setAutoNumber,
  SIGNER_NOTE_MAX,
  termEndDate,
  type ContractPropertyLike,
  type ContractRowLike,
} from "../contract-model";
import { movePage, needsRender, pagesFor, rotateNext, uploadsFinished } from "../doc-pages-store";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-11-24";

const rentProp: ContractPropertyLike = {
  category: "rent",
  price_total: 2_500_000,
  currency: "MNT",
  price_period: "month",
  price_basis: "total",
  contract_agent_id: null,
  listing_agent_id: ME,
  unconfirmed: [],
};

const settings = {
  "brokerage.default_term_months": 12,
  "brokerage.default_commission": { rent: "rent_x:1", sale: "percent:3" },
};

function row(patch: Partial<ContractRowLike> = {}): ContractRowLike {
  return {
    number: "B010",
    start_date: "2026-11-01",
    end_date: "2027-10-31",
    commission_type: "fixed",
    commission_value: 2_500_000,
    commission_currency: "MNT",
    commission_note: "сарын түрээсийн 1 дахин",
    terms: null,
    no_special_terms: false,
    signer_differs: false,
    signer_note: null,
    responsible_agent_id: OTHER,
    prefilled: [],
    ...patch,
  };
}

function checklist(patch: Partial<ChecklistInput["property"]> = {}): ChecklistInput {
  return {
    property: {
      category: "rent",
      property_type: "apartment",
      project_id: null,
      district: "БЗД",
      location_text: null,
      lat: null,
      area_m2: 60,
      rooms: 2,
      floor: 5,
      building_floors: 12,
      price: 2_500_000,
      price_total: 2_500_000,
      currency: "MNT",
      price_period: "month",
      listing_agent_id: ME,
      contract_agent_id: null,
      photo_agent_id: null,
      last_verified_at: null,
      unconfirmed: ["contract_agent_id"],
      status: "draft",
      listing_id: null,
      source_listing_id: null,
      published_at: null,
      features: [],
      ...patch,
    },
    owner: { id: OTHER, nameUnverified: false, source: "referral" },
    ownerPending: false,
    contract: null,
    imageCount: 1,
    listingAgentPublic: true,
    settings: {
      activationRequired: [],
      minImages: 1,
      requireOwner: true,
      requireFile: true,
      requireSpecialTerms: true,
      requireOwnershipDoc: false,
      activationMode: "auto",
    },
    publicTextRisks: [],
    today: TODAY,
  };
}

describe("termEndDate", () => {
  it("adds months minus one day", () => {
    expect(termEndDate("2026-11-13", 12)).toBe("2027-11-12");
    expect(termEndDate("2026-11-24", 6)).toBe("2027-05-23");
  });
  it("clamps month ends", () => {
    expect(termEndDate("2027-01-31", 1)).toBe("2027-02-27");
    expect(termEndDate("2028-01-31", 1)).toBe("2028-02-28");
  });
  it("rejects bad input", () => {
    expect(termEndDate("2026-13", 12)).toBeNull();
    expect(termEndDate("2026-11-24", 0)).toBeNull();
  });
});

describe("initialContractForm", () => {
  it("prefills dates and MNT monthly rent_x commission for a new contract", () => {
    const f = initialContractForm({ contract: null, property: rentProp, settings, today: TODAY, meId: ME });
    expect(f.start_date).toBe(TODAY);
    expect(f.end_date).toBe("2027-11-23");
    expect(f.commission_type).toBe("fixed");
    expect(f.commission_value).toBe("2500000");
    expect(f.commission_note).toBe("сарын түрээсийн 1 дахин");
    expect(f.prefilled).toEqual(["start_date", "end_date", "commission"]);
    expect(f.contract_agent_id).toBe(ME);
    expect(f.responsible_agent_id).toBe(ME);
  });
  it("does not prefill commission for USD or yearly rent", () => {
    for (const p of [{ ...rentProp, currency: "USD" }, { ...rentProp, price_period: "total" }, { ...rentProp, price_basis: "per_m2" }]) {
      const f = initialContractForm({ contract: null, property: p, settings, today: TODAY, meId: ME });
      expect(f.commission_type).toBe("");
      expect(f.prefilled).not.toContain("commission");
    }
  });
  it("prefills a percent for sale", () => {
    const f = initialContractForm({
      contract: null,
      property: { ...rentProp, category: "sale", price_period: "total", price_total: 300_000_000 },
      settings,
      today: TODAY,
      meId: ME,
    });
    expect([f.commission_type, f.commission_value]).toEqual(["percent", "3"]);
  });
  it("maps an existing draft and keeps its prefilled list", () => {
    const f = initialContractForm({
      contract: row({ prefilled: ["start_date", "bogus"], signer_differs: true, signer_note: "эхнэр нь\nГарын үсэг зурагч: Сараа · 9911 2233" }),
      property: { ...rentProp, contract_agent_id: OTHER },
      settings,
      today: TODAY,
      meId: ME,
    });
    expect(f.number).toBe("B010");
    expect(f.prefilled).toEqual(["start_date"]);
    expect(f.signer_relation).toBe("эхнэр нь");
    expect(f.contract_agent_id).toBe(OTHER);
    expect(f.responsible_agent_id).toBe(OTHER);
  });
});

describe("editing and prefilled", () => {
  const base = initialContractForm({ contract: null, property: rentProp, settings, today: TODAY, meId: ME });
  it("editing a prefilled field removes the key", () => {
    const f = editContractField(base, "commission_value", "3000000");
    expect(f.prefilled).toEqual(["start_date", "end_date"]);
    expect(editContractField(base, "end_date", base.end_date).prefilled).toEqual(base.prefilled);
  });
  it("«Зөв» confirms one key", () => {
    expect(confirmPrefilled(base, "start_date").prefilled).toEqual(["end_date", "commission"]);
  });
  it("auto number clears the paper number", () => {
    const f = setAutoNumber({ ...base, number: "A-1" }, true);
    expect([f.autoNumber, f.number]).toEqual([true, ""]);
  });
});

describe("commission recalc and warnings", () => {
  const base = initialContractForm({ contract: null, property: rentProp, settings, today: TODAY, meId: ME });
  it("offers a recalc when the rent changed", () => {
    const r = commissionRecalc(base, { ...rentProp, price_total: 3_000_000 }, settings);
    expect(r?.commission_value).toBe(3_000_000);
    expect(commissionRecalc(base, rentProp, settings)).toBeNull();
    const applied = applyCommission(confirmPrefilled(base, "commission"), r!);
    expect(applied.commission_value).toBe("3000000");
    expect(applied.prefilled).toContain("commission");
  });
  it("no recalc for a hand-written commission", () => {
    const f = { ...base, commission_note: "тохиролцсон" };
    expect(commissionRecalc(f, { ...rentProp, price_total: 3_000_000 }, settings)).toBeNull();
  });
  it("warns on suspicious percent", () => {
    expect(commissionWarning({ ...base, commission_type: "percent", commission_value: "100" }, "rent")).toMatch(/100%/);
    expect(commissionWarning({ ...base, commission_type: "percent", commission_value: "3" }, "sale")).toBeNull();
  });
  it("parses amounts", () => {
    expect(parseAmount("1 500 000")).toBe(1_500_000);
    expect(parseAmount("2,5")).toBe(2.5);
    expect(parseAmount("1,500,000")).toBe(1_500_000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("signer note", () => {
  it("round-trips relation, name and phone", () => {
    const note = composeSignerNote("Хүү нь, итгэмжлэлээр", { name: "Бат", phone: "99112233" });
    expect(note).toBe("Хүү нь, итгэмжлэлээр\nГарын үсэг зурагч: Бат · 9911 2233");
    expect(parseSignerNote(note)).toEqual({ relation: "Хүү нь, итгэмжлэлээр", signer: { name: "Бат", phone: "99112233" } });
  });
  it("ignores an incomplete phone and keeps the 500 limit", () => {
    expect(composeSignerNote("эхнэр", { name: "", phone: "9911" })).toBe("эхнэр");
    const long = composeSignerNote("а".repeat(600), { name: "Бат", phone: "99112233" })!;
    expect(long.length).toBeLessThanOrEqual(SIGNER_NOTE_MAX);
    expect(long.endsWith("Бат · 9911 2233")).toBe(true);
    expect(composeSignerNote("  ", null)).toBeNull();
  });
  it("plain notes stay as relation", () => {
    expect(parseSignerNote("ах нь")).toEqual({ relation: "ах нь", signer: null });
  });
});

describe("validation and payload", () => {
  const base = initialContractForm({ contract: null, property: rentProp, settings, today: TODAY, meId: ME });
  it("requires a paper number or system number for a new contract", () => {
    expect(contractFormErrors(base, { isNew: true }).number).toBeTruthy();
    expect(contractFormErrors({ ...base, autoNumber: true }, { isNew: true }).number).toBeUndefined();
    expect(contractFormErrors(base, { isNew: false }).number).toBeUndefined();
  });
  it("catches end before start, percent >100 and missing signer authority", () => {
    const e = contractFormErrors(
      { ...base, autoNumber: true, end_date: "2026-01-01", commission_type: "percent", commission_value: "120", signer_differs: true },
      { isNew: true }
    );
    expect(Object.keys(e).sort()).toEqual(["commission_value", "end_date", "signer_note"]);
  });
  it("builds the draft fields", () => {
    const f = contractDraftFields({ ...base, autoNumber: true, signer_differs: true, signer_relation: "эхнэр" }, {
      ownerContactId: OTHER,
      signer: { name: "", phone: "88112233" },
    });
    expect(f.number).toBe("");
    expect(f.commission_value).toBe(2_500_000);
    expect(f.commission_currency).toBe("MNT");
    expect(f.signer_note).toBe("эхнэр\nГарын үсэг зурагч: 8811 2233");
    expect(f.owner_contact_id).toBe(OTHER);
    expect(contractDraftFields({ ...base, commission_type: "percent" }, { ownerContactId: null, signer: null }).commission_currency).toBeUndefined();
  });
  it("writes the contract agent only when changed or unconfirmed", () => {
    expect(contractAgentPatch(base, { contract_agent_id: ME, unconfirmed: [] })).toBeNull();
    expect(contractAgentPatch(base, { contract_agent_id: null, unconfirmed: [] })).toEqual({ contract_agent_id: ME });
    expect(contractAgentPatch(base, { contract_agent_id: ME, unconfirmed: ["price", "contract_agent_id"] })).toEqual({
      contract_agent_id: ME,
      unconfirmed: ["price"],
    });
  });
  it("dirty compares saved payloads, not text formatting", () => {
    const saved = initialContractForm({ contract: row(), property: { ...rentProp, contract_agent_id: ME }, settings, today: TODAY, meId: ME });
    const agent = { property: { contract_agent_id: ME, unconfirmed: [] }, canEdit: true };
    expect(contractDirty({ ...saved, commission_value: "2 500 000" }, saved, null, null, agent)).toBe(false);
    expect(contractDirty({ ...saved, terms: "x" }, saved, null, null, agent)).toBe(true);
    expect(contractDirty(saved, saved, null, null, { property: { contract_agent_id: ME, unconfirmed: ["contract_agent_id"] }, canEdit: true })).toBe(true);
    expect(contractDirty(saved, saved, null, null, { property: { contract_agent_id: null, unconfirmed: [] }, canEdit: false })).toBe(false);
  });
});

describe("contractMissing", () => {
  const base = initialContractForm({ contract: null, property: rentProp, settings, today: TODAY, meId: ME });
  const opts = {
    status: "draft" as const,
    owner: { id: OTHER, nameUnverified: false, source: "referral" },
    files: { contract: 0, ownership: 0, other: 0 },
    fileAtOffice: false,
    signerNote: null,
  };
  it("lists prefilled, special terms and file; the contract agent counts as confirmed on save", () => {
    expect(contractMissing(checklist(), base, opts)).toEqual(["file", "special_terms", "defaults_unconfirmed"]);
  });
  it("file_at_office never satisfies the file", () => {
    const f = { ...base, prefilled: [], no_special_terms: true };
    expect(contractMissing(checklist(), f, { ...opts, fileAtOffice: true })).toEqual(["file"]);
    expect(contractMissing(checklist(), f, { ...opts, files: { contract: 1, ownership: 0, other: 0 } })).toEqual([]);
    // Өмчлөлийн баримт гэрээний файлын оронд тооцогдохгүй.
    expect(contractMissing(checklist(), f, { ...opts, files: { contract: 0, ownership: 1, other: 1 } })).toEqual(["file"]);
  });
  it("requires owner source in the UI and signer authority", () => {
    const f = { ...base, prefilled: [], no_special_terms: true, signer_differs: true };
    const out = contractMissing(checklist(), f, {
      ...opts,
      owner: { id: OTHER, nameUnverified: true, source: null },
      files: { contract: 1, ownership: 0, other: 0 },
    });
    expect(out).toEqual(["owner_name", "owner_source", "signer_authority"]);
  });
  it("keeps role_unconfirmed when the user cannot write the property", () => {
    const f = { ...base, prefilled: [], no_special_terms: true };
    const out = contractMissing(checklist(), f, { ...opts, files: { contract: 1, ownership: 0, other: 0 }, confirmsAgent: false });
    expect(out).toEqual(["role_unconfirmed"]);
  });
  it("counts file kinds", () => {
    expect(fileCounts([{ kind: "contract" }, { kind: null }, { kind: "ownership" }, { kind: "id" }, { kind: "other" }])).toEqual({
      contract: 2,
      ownership: 1,
      other: 2,
    });
  });
  it("picks the first step", () => {
    expect(initialStep(false, [])).toBe(1);
    expect(initialStep(true, ["file"])).toBe(2);
    expect(initialStep(true, ["commission", "file"])).toBe(1);
  });
});

describe("approve and activation", () => {
  it("file_checked only when required", () => {
    expect(approveFileArg(true, true)).toBe(true);
    expect(approveFileArg(true, false)).toBe(false);
    expect(approveFileArg(false, true)).toBeUndefined();
  });
  const ok = { ok: true, missing: [] as string[] };
  it("manual mode offers «Идэвхжүүлэх»", () => {
    expect(activationPanelState({ propertyStatus: "draft", hasActiveContract: true, activateOnStart: false, mode: "manual", check: ok })).toEqual({
      kind: "ready",
    });
    expect(activationPanelState({ propertyStatus: "draft", hasActiveContract: true, activateOnStart: false, mode: "auto", check: ok }).kind).toBe("auto");
  });
  it("blocked shows the missing list", () => {
    expect(
      activationPanelState({
        propertyStatus: "draft",
        hasActiveContract: true,
        activateOnStart: false,
        mode: "manual",
        check: { ok: false, missing: ["district", "images"] },
      })
    ).toEqual({ kind: "blocked", missing: ["district", "images"] });
  });
  it("hidden for active properties, scheduled on start", () => {
    expect(activationPanelState({ propertyStatus: "active", hasActiveContract: true, activateOnStart: false, mode: "manual", check: ok }).kind).toBe("hidden");
    expect(activationPanelState({ propertyStatus: "draft", hasActiveContract: false, activateOnStart: false, mode: "manual", check: ok }).kind).toBe("hidden");
    expect(activationPanelState({ propertyStatus: "draft", hasActiveContract: true, activateOnStart: true, mode: "manual", check: ok }).kind).toBe("scheduled");
  });
});

describe("doc pages helpers", () => {
  it("rotates in 90° steps", () => {
    expect([rotateNext(0), rotateNext(90), rotateNext(180), rotateNext(270)]).toEqual([90, 180, 270, 0]);
  });
  it("moves pages", () => {
    expect(movePage(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(movePage(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
  it("renders only when changed", () => {
    expect(needsRender({ rotate: 0, enhance: false, crop: null })).toBe(false);
    expect(needsRender({ rotate: 90, enhance: false, crop: null })).toBe(true);
    expect(needsRender({ rotate: 0, enhance: false, crop: { x: 0.04, y: 0.04, w: 0.92, h: 0.92 } })).toBe(true);
  });
  it("never mixes pages of another contract", () => {
    const rec = { v: 1 as const, contractId: "a", pages: [{ id: "p", blobKey: "b", w: 1, h: 1, rotate: 0 as const, enhance: false, crop: null }], queuedIds: [] };
    expect(pagesFor(rec, "a").pages).toHaveLength(1);
    expect(pagesFor(rec, "b").pages).toHaveLength(0);
    expect(pagesFor(null, "b")).toEqual({ v: 1, contractId: "b", pages: [], queuedIds: [] });
  });
  it("deletes pages only after every PDF uploaded", () => {
    expect(uploadsFinished([], [])).toBe("none");
    expect(uploadsFinished(["1"], [{ id: "1", status: "uploading" }])).toBe("pending");
    expect(uploadsFinished(["1", "2"], [{ id: "1", status: "done" }, { id: "2", status: "failed" }])).toBe("failed");
    expect(uploadsFinished(["1", "2"], [{ id: "1", status: "done" }])).toBe("done");
  });
});
