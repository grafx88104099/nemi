import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 20261125000200_security_hardening.sql §7 — хуучин CRM v1 / Concierge эрх хасах жагсаалт.
 * crm_listing_agreements-ийг (20261124000800 — эзний шийдвэр хүлээгдэж буй) хөндөхгүй:
 * хүснэгт нь ч, түүний INSERT/UPDATE бодлогын crm_can_edit_property(uuid) ч жагсаалтад орохгүй
 * (функцийн эрхийг хасвал бодлого «permission denied» болж 000800-г далдуур хэрэгжүүлнэ).
 */
const sql = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20261125000200_security_hardening.sql", import.meta.url)),
  "utf8"
);
const seg = sql.slice(sql.indexOf("foreach v_fn in array array["), sql.indexOf("legacy revoke"));
const fnSeg = seg.slice(0, seg.indexOf("foreach v_rel in array array["));
const relSeg = seg.slice(seg.indexOf("foreach v_rel in array array["));
const fns = [...fnSeg.matchAll(/^\s*'public\.([a-z0-9_]+)\([^']*\)'/gm)].map((m) => m[1]);
const rels = [...relSeg.matchAll(/^\s*'public\.([a-z0-9_]+)'/gm)].map((m) => m[1]);

describe("security_hardening legacy revoke list", () => {
  it("parses the function and relation lists", () => {
    expect(fns.length).toBe(118);
    expect(rels.length).toBe(134);
  });

  it("leaves crm_listing_agreements and its policy helper alone", () => {
    expect(rels).not.toContain("crm_listing_agreements");
    expect(fns).not.toContain("crm_can_edit_property");
  });

  it("keeps helpers that live CRM2 code paths rely on", () => {
    for (const keep of ["crm_offboarding_blockers", "crm_is_panel_admin", "crm_office_id", "crm2_assert_work_staff"]) {
      expect(fns).not.toContain(keep);
    }
  });
});
