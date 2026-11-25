import { describe, expect, it } from "vitest";

import type { ChecklistInput } from "@/lib/crm2/checklist";

import * as model from "../contract-model";
import {
  activationPanelState,
  contractAgentPatch,
  contractFormErrors,
  contractMissing,
  contractPdf,
  effectiveContractOwner,
  endDateChips,
  extraDocs,
  fileCounts,
  initialContractForm,
  legacyContractImages,
  propertyGaps,
  registrantFillsContractAgent,
  STAMP_REQUIRED_TEXT,
  termEndDate,
  type ContractFileCounts,
  type ContractForm,
} from "../contract-model";
import { movePage, needsRender, pagesFor, rotateNext, uploadsFinished } from "../doc-pages-store";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-11-25";

function checklist(patch: Partial<ChecklistInput["property"]> = {}, settings: Partial<ChecklistInput["settings"]> = {}): ChecklistInput {
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
    settings: { activationRequired: [], minImages: 1, requireOwner: true, requireOwnershipDoc: false, ...settings },
    publicTextRisks: [],
    today: TODAY,
  };
}

const OWNER = { id: OTHER, nameUnverified: false, source: "referral" };
const ONE_PDF: ContractFileCounts = { pdf: 1, nonPdf: 0, ownership: 0, other: 0 };
const NO_FILES: ContractFileCounts = { pdf: 0, nonPdf: 0, ownership: 0, other: 0 };
const ready: ContractForm = { end_date: "2027-11-24", stamp_confirmed: true };

describe("termEndDate", () => {
  it("adds months minus one day", () => {
    expect(termEndDate("2026-11-13", 12)).toBe("2027-11-12");
    expect(termEndDate("2026-11-25", 6)).toBe("2027-05-24");
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

describe("end date chips", () => {
  it("6/12/24 plus the office term, ascending, at most 60 months", () => {
    expect(endDateChips(12)).toEqual([6, 12, 24]);
    expect(endDateChips(18)).toEqual([6, 12, 18, 24]);
    expect(endDateChips(60)).toEqual([6, 12, 24, 60]);
    expect(endDateChips(72)).toEqual([6, 12, 24]);
  });
});

describe("initialContractForm", () => {
  it("new contract: today + term − 1 day, stamp unticked", () => {
    expect(initialContractForm({ contract: null, today: TODAY, termMonths: 12 })).toEqual({ end_date: "2027-11-24", stamp_confirmed: false });
  });
  it("keeps a draft end date from tomorrow on, otherwise the default", () => {
    expect(initialContractForm({ contract: { end_date: "2027-03-01" }, today: TODAY, termMonths: 12 }).end_date).toBe("2027-03-01");
    expect(initialContractForm({ contract: { end_date: TODAY }, today: TODAY, termMonths: 12 }).end_date).toBe("2027-11-24");
    expect(initialContractForm({ contract: { end_date: "2026-01-01" }, today: TODAY, termMonths: 6 }).end_date).toBe("2027-05-24");
    expect(initialContractForm({ contract: { end_date: null }, today: TODAY, termMonths: 12 }).stamp_confirmed).toBe(false);
  });
});

describe("contractFormErrors", () => {
  it("valid end date and ticked stamp → no errors", () => {
    expect(contractFormErrors(ready, TODAY)).toEqual({});
    expect(contractFormErrors({ ...ready, end_date: TODAY }, TODAY)).toEqual({});
    expect(contractFormErrors({ ...ready, end_date: "2031-11-25" }, TODAY)).toEqual({});
  });
  it("end date: required, not before today, not beyond +60 months, well formed", () => {
    expect(contractFormErrors({ ...ready, end_date: "" }, TODAY).end_date).toBe("Дуусах огноо оруулна уу.");
    expect(contractFormErrors({ ...ready, end_date: "2026-11-24" }, TODAY).end_date).toMatch(/өнөөдрөөс өмнө/);
    expect(contractFormErrors({ ...ready, end_date: "2031-11-26" }, TODAY).end_date).toMatch(/5 жилээс хол/);
    expect(contractFormErrors({ ...ready, end_date: "2027-02-30" }, TODAY).end_date).toMatch(/буруу/);
  });
  it("stamp must be ticked", () => {
    expect(contractFormErrors({ ...ready, stamp_confirmed: false }, TODAY)).toEqual({ stamp_confirmed: STAMP_REQUIRED_TEXT });
  });
});

describe("contractMissing (≙ crm2_brokerage_missing + stamp_unconfirmed)", () => {
  const opts = (files: ContractFileCounts, owner: Parameters<typeof contractMissing>[2]["owner"] = OWNER) => ({
    status: "draft" as const,
    owner,
    files,
  });
  it("complete: one PDF, owner, end date, ticked stamp", () => {
    expect(contractMissing(checklist(), ready, opts(ONE_PDF))).toEqual([]);
  });
  it("no PDF → file; the stamp comes last like the RPC", () => {
    expect(contractMissing(checklist(), { ...ready, stamp_confirmed: false }, opts(NO_FILES))).toEqual(["file", "stamp_unconfirmed"]);
  });
  it("JPEG-only legacy contract → file + file_not_pdf", () => {
    expect(contractMissing(checklist(), ready, opts({ ...NO_FILES, nonPdf: 2 }))).toEqual(["file", "file_not_pdf"]);
    expect(contractMissing(checklist(), ready, opts({ ...ONE_PDF, nonPdf: 1 }))).toEqual(["file_not_pdf"]);
  });
  it("DB order: end date → owner → owner name → file → file_not_pdf → ownership doc → stamp", () => {
    const input = { ...checklist({}, { requireOwnershipDoc: true }), owner: null };
    expect(contractMissing(input, { end_date: "", stamp_confirmed: false }, opts({ ...NO_FILES, nonPdf: 1 }, null))).toEqual([
      "end_date",
      "owner",
      "file",
      "file_not_pdf",
      "ownership_doc",
      "stamp_unconfirmed",
    ]);
    expect(
      contractMissing(checklist(), { end_date: "2026-11-01", stamp_confirmed: true }, opts(ONE_PDF, { ...OWNER, nameUnverified: true }))
    ).toEqual(["end_date_past", "owner_name"]);
  });
  it("owner is optional when the office allows it; hidden owner is left to the DB", () => {
    const noOwner = { ...checklist({}, { requireOwner: false }), owner: null };
    expect(contractMissing(noOwner, ready, opts(ONE_PDF, null))).toEqual([]);
    const hidden = { ...checklist(), owner: "hidden" as const };
    expect(contractMissing(hidden, ready, opts(ONE_PDF, "hidden"))).toEqual([]);
  });
  it("no longer asks for commission, special terms, signer, start date or confirmed defaults", () => {
    const out = contractMissing(checklist(), { end_date: "", stamp_confirmed: false }, opts(NO_FILES));
    for (const gone of ["commission", "special_terms", "signer_authority", "defaults_unconfirmed", "start_date", "role_unconfirmed", "owner_source"]) {
      expect(out).not.toContain(gone);
    }
  });
});

describe("contract files", () => {
  const files = [
    { id: "a", kind: "contract", mime_type: "image/jpeg" },
    { id: "b", kind: null, mime_type: "application/pdf" },
    { id: "c", kind: "ownership", mime_type: "application/pdf" },
    { id: "d", kind: "id", mime_type: "image/png" },
    { id: "e", kind: "other", mime_type: "application/pdf" },
  ];
  it("a JPEG of kind contract is not the contract; an ownership PDF is not the contract", () => {
    expect(fileCounts(files)).toEqual({ pdf: 1, nonPdf: 1, ownership: 1, other: 2 });
    expect(fileCounts([{ kind: "ownership", mime_type: "application/pdf" }]).pdf).toBe(0);
    expect(fileCounts(null)).toEqual(NO_FILES);
  });
  it("splits the PDF, legacy images and extra documents", () => {
    expect(contractPdf(files)?.id).toBe("b");
    expect(contractPdf([files[0], files[2]])).toBeNull();
    expect(legacyContractImages(files).map((f) => f.id)).toEqual(["a"]);
    expect(extraDocs(files).map((f) => f.id)).toEqual(["c", "d", "e"]);
  });
});

describe("contract agent", () => {
  it("writes only an explicit change; the register RPC fills or confirms otherwise", () => {
    expect(contractAgentPatch(null, { contract_agent_id: null, unconfirmed: ["contract_agent_id"] })).toBeNull();
    expect(contractAgentPatch(ME, { contract_agent_id: ME, unconfirmed: ["contract_agent_id"] })).toBeNull();
    expect(contractAgentPatch(OTHER, { contract_agent_id: ME, unconfirmed: [] })).toEqual({ contract_agent_id: OTHER });
    expect(contractAgentPatch(OTHER, { contract_agent_id: null, unconfirmed: ["price", "contract_agent_id"] })).toEqual({
      contract_agent_id: OTHER,
      unconfirmed: ["price"],
    });
  });
});

describe("property gaps (non-blocking)", () => {
  it("lists what keeps the property from activating, without the contract itself", () => {
    const input = checklist({ price: null }, { activationRequired: ["price", "contract_agent_id"] });
    const gaps = propertyGaps(input, ME);
    expect(gaps.map((g) => g.key)).toEqual(["price"]);
    expect(gaps[0].target.sheet).toBe("price");
    expect(gaps[0].label).toBeTruthy();
  });
  it("the contract agent counts once registration confirms it", () => {
    const input = checklist({}, { activationRequired: ["contract_agent_id"] });
    expect(propertyGaps(input, ME)).toEqual([]);
    expect(propertyGaps(input, null).map((g) => g.key)).toEqual(["contract_agent_id"]);
  });
  it("nothing missing → empty", () => {
    expect(propertyGaps(checklist(), ME)).toEqual([]);
  });
  it("registered contract: the real property values, no substitution", () => {
    const input = checklist({}, { activationRequired: ["contract_agent_id"] });
    expect(propertyGaps(input, ME, { registering: false }).map((g) => g.key)).toEqual(["contract_agent_id"]);
    expect(propertyGaps(checklist({ contract_agent_id: ME, unconfirmed: [] }, { activationRequired: ["contract_agent_id"] }), null, { registering: false })).toEqual([]);
  });
});

describe("registrantFillsContractAgent (≙ crm2_brokerage_register v_fill)", () => {
  const prop = { contract_agent_id: null, listing_agent_id: ME, photo_agent_id: null };
  it("fills an empty contract agent with an active staff registrant", () => {
    expect(registrantFillsContractAgent(prop, { id: ME, isStaff: true }, true)).toBe(true);
    expect(registrantFillsContractAgent(prop, { id: OTHER, isStaff: true }, false)).toBe(true);
  });
  it("not when already set, not for non-staff, not for the listing/photo agent when one-role-per-agent", () => {
    expect(registrantFillsContractAgent({ ...prop, contract_agent_id: OTHER }, { id: ME, isStaff: true }, true)).toBe(false);
    expect(registrantFillsContractAgent(prop, { id: ME, isStaff: false }, true)).toBe(false);
    expect(registrantFillsContractAgent(prop, { id: ME, isStaff: true }, false)).toBe(false);
    expect(registrantFillsContractAgent({ ...prop, listing_agent_id: null, photo_agent_id: ME }, { id: ME, isStaff: true }, false)).toBe(false);
  });
});

describe("effectiveContractOwner (≙ coalesce(гэрээний эзэн, хөрөнгийн эзэн))", () => {
  const propOwner = { id: OTHER, name: "Y" };
  const x = { id: ME, name: "X" };
  it("property owner when the draft has none", () => {
    expect(effectiveContractOwner(propOwner, null)).toEqual({ owner: propOwner, fromContract: false });
    expect(effectiveContractOwner(propOwner, { owner_contact_id: null, owner: null })).toEqual({ owner: propOwner, fromContract: false });
    expect(effectiveContractOwner("hidden", { owner_contact_id: null, owner: null }).owner).toBe("hidden");
  });
  it("the contract's own owner (renewal inherits it), hidden when not visible", () => {
    expect(effectiveContractOwner(propOwner, { owner_contact_id: ME, owner: x })).toEqual({ owner: x, fromContract: true });
    expect(effectiveContractOwner(null, { owner_contact_id: ME, owner: x })).toEqual({ owner: x, fromContract: true });
    expect(effectiveContractOwner(propOwner, { owner_contact_id: ME, owner: null })).toEqual({ owner: "hidden", fromContract: true });
  });
  it("feeds contractMissing: an unverified contract owner blocks even when the property owner is fine", () => {
    const eff = effectiveContractOwner(OWNER, { owner_contact_id: ME, owner: { id: ME, nameUnverified: true, source: "referral" } });
    expect(contractMissing(checklist(), ready, { status: "draft", owner: eff.owner, files: ONE_PDF })).toEqual(["owner_name"]);
    // Хөрөнгөд эзэнгүй ч гэрээнд эзэн бий → 'owner' дутуу биш (RPC хүлээж авна).
    const eff2 = effectiveContractOwner(null, { owner_contact_id: ME, owner: { id: ME, nameUnverified: false, source: null } });
    expect(contractMissing({ ...checklist(), owner: null }, ready, { status: "draft", owner: eff2.owner, files: ONE_PDF })).toEqual([]);
  });
});

describe("contractMissing: restricted ownership documents", () => {
  it("unknown count (no restricted view) is left to the DB", () => {
    const input = checklist({}, { requireOwnershipDoc: true });
    expect(contractMissing(input, ready, { status: "draft", owner: OWNER, files: ONE_PDF })).toEqual(["ownership_doc"]);
    expect(contractMissing(input, ready, { status: "draft", owner: OWNER, files: ONE_PDF, ownershipKnown: false })).toEqual([]);
    expect(contractMissing(input, ready, { status: "draft", owner: OWNER, files: { ...ONE_PDF, ownership: 1 } })).toEqual([]);
  });
});

describe("activation panel", () => {
  const ok = { ok: true, missing: [] as string[] };
  it("registered contract with gaps → blocked list", () => {
    expect(
      activationPanelState({ propertyStatus: "draft", hasActiveContract: true, check: { ok: false, missing: ["district", "images"] } })
    ).toEqual({ kind: "blocked", missing: ["district", "images"] });
  });
  it("complete but still draft → «Идэвхжүүлэх» fallback", () => {
    expect(activationPanelState({ propertyStatus: "draft", hasActiveContract: true, check: ok })).toEqual({ kind: "ready" });
  });
  it("hidden for active properties, without a contract or without a check", () => {
    expect(activationPanelState({ propertyStatus: "active", hasActiveContract: true, check: ok }).kind).toBe("hidden");
    expect(activationPanelState({ propertyStatus: "draft", hasActiveContract: false, check: ok }).kind).toBe("hidden");
    expect(activationPanelState({ propertyStatus: "draft", hasActiveContract: true, check: null }).kind).toBe("hidden");
  });
  it("contract_ended: shown only for a renewal registered after it ended (the DB auto path)", () => {
    const blocked = { ok: false, missing: ["images"] };
    const renewal = { statusChangedAt: "2026-11-20T00:00:00Z", activeRegisteredAt: "2026-11-25T03:00:00Z" };
    expect(activationPanelState({ propertyStatus: "contract_ended", hasActiveContract: true, check: blocked, ...renewal })).toEqual({
      kind: "blocked",
      missing: ["images"],
    });
    // Хүчинтэй гэрээтэй байхад гараар дуусгасан — DB автоматаар сэргээхгүй, самбар ч гарахгүй.
    const manual = { statusChangedAt: "2026-11-25T05:00:00Z", activeRegisteredAt: "2026-11-01T03:00:00Z" };
    expect(activationPanelState({ propertyStatus: "contract_ended", hasActiveContract: true, check: blocked, ...manual }).kind).toBe("hidden");
    expect(activationPanelState({ propertyStatus: "contract_ended", hasActiveContract: true, check: ok }).kind).toBe("hidden");
    expect(activationPanelState({ propertyStatus: "suspended", hasActiveContract: true, check: ok, ...renewal }).kind).toBe("hidden");
  });
});

describe("retired approval-era helpers", () => {
  it("prefill, commission, signer and approve helpers are gone", () => {
    for (const name of [
      "editContractField",
      "confirmPrefilled",
      "setAutoNumber",
      "applyCommission",
      "commissionRecalc",
      "commissionWarning",
      "composeSignerNote",
      "parseSignerNote",
      "contractDraftFields",
      "contractDirty",
      "needsFileCheck",
      "approveFileArg",
      "initialStep",
      "STEP1_MISSING",
    ]) {
      expect(name in model).toBe(false);
    }
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
  it("deletes pages only after the PDF uploaded", () => {
    expect(uploadsFinished([], [])).toBe("none");
    expect(uploadsFinished(["1"], [{ id: "1", status: "uploading" }])).toBe("pending");
    expect(uploadsFinished(["1", "2"], [{ id: "1", status: "done" }, { id: "2", status: "failed" }])).toBe("failed");
    expect(uploadsFinished(["1", "2"], [{ id: "1", status: "done" }])).toBe("done");
  });
});
