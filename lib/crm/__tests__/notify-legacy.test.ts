import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { LEGACY_CRM_NOTIFICATION_TYPES, legacyCrmLink, notificationHref, panelLink } from "@/lib/crm/notify";

const ID = "6f1c2a3b-1111-4111-8111-111111111111";

describe("legacyCrmLink — CRM1-ийн үхсэн холбоос → CRM2", () => {
  it("лид, pipeline, deals → харилцагч/Staff (устсан id-г хаяна)", () => {
    expect(legacyCrmLink(`/agent/crm/leads/${ID}`)).toBe("/agent/crm/contacts");
    expect(legacyCrmLink("/agent/crm/leads")).toBe("/agent/crm/contacts");
    expect(legacyCrmLink(`/agent/crm/pipeline/${ID}`)).toBe("/agent/crm/staff");
    expect(legacyCrmLink(`/office/crm/deals/${ID}`)).toBe("/office/crm/staff");
    expect(legacyCrmLink(`/office/crm/leads/${ID}`)).toBe("/office/crm/contacts");
  });

  it("санхүүгийн хуучин хэсэг → finance", () => {
    expect(legacyCrmLink(`/office/crm/aml/${ID}`)).toBe("/office/crm/finance");
    expect(legacyCrmLink("/office/crm/rentals/invoices")).toBe("/office/crm/finance");
    expect(legacyCrmLink("/office/crm/rentals/monthly?month=2026-09")).toBe("/office/crm/finance");
  });

  it("«Дараагийн алхам хоцорсон» → Миний ажил", () => {
    expect(legacyCrmLink(`/agent/crm/leads/${ID}`, "crm_next_step_overdue")).toBe("/agent/crm/my-work");
    expect(legacyCrmLink(`/agent/crm/pipeline/${ID}`, "crm_next_step_overdue")).toBe("/agent/crm/my-work");
    expect(legacyCrmLink(`/office/crm/deals/${ID}`, "crm_next_step_overdue")).toBe("/office/crm/my-work");
  });

  it("CRM2-ийн холбоосыг өөрчлөхгүй (төрөл нь CRM1 байсан ч)", () => {
    expect(legacyCrmLink(`/agent/crm/staff/${ID}`)).toBe(`/agent/crm/staff/${ID}`);
    expect(legacyCrmLink(`/agent/crm/contacts/${ID}`, "crm_next_step_overdue")).toBe(`/agent/crm/contacts/${ID}`);
    expect(legacyCrmLink("/agent/crm")).toBe("/agent/crm");
    expect(legacyCrmLink("/agent/crm/team")).toBe("/agent/crm/team");
    expect(legacyCrmLink("/messages?c=1")).toBe("/messages?c=1");
    expect(legacyCrmLink("/agent/crm-leads")).toBe("/agent/crm-leads");
  });
});

describe("notificationHref — хонхны холбоос", () => {
  it("агент/сайт: CRM1 → CRM2, бусад хэвээр", () => {
    expect(notificationHref(`/agent/crm/leads/${ID}`, "crm_lead_sla_breach")).toBe("/agent/crm/contacts");
    expect(notificationHref("/agent/crm", "crm_team_added")).toBe("/agent/crm");
    expect(notificationHref(null, "message")).toBeNull();
    expect(notificationHref("", "message")).toBeNull();
  });

  it("оффисын панель: CRM1 → CRM2 → /office/crm", () => {
    expect(notificationHref(`/agent/crm/leads/${ID}`, "crm_next_step_overdue", "office")).toBe("/office/crm/my-work");
    expect(notificationHref(`/agent/crm/pipeline/${ID}`, null, "office")).toBe("/office/crm/staff");
    expect(notificationHref(`/agent/crm/staff/${ID}`, "crm2_request", "office")).toBe(`/office/crm/staff/${ID}`);
  });

  it("panelLink (оффисын мэдэгдлийн хуудас) ч CRM1-ийг тааруулна", () => {
    expect(panelLink(`/agent/crm/leads/${ID}`, "office_admin")).toBe("/office/crm/contacts");
    expect(panelLink(`/office/crm/deals/${ID}`, "agent")).toBe("/agent/crm/staff");
  });
});

describe("цэвэрлэх миграц ба апп ижил CRM1 төрлүүдийг хардаг", () => {
  it("20261125000300_notifications_cleanup.sql-ийн жагсаалт = LEGACY_CRM_NOTIFICATION_TYPES", () => {
    const raw = readFileSync(
      fileURLToPath(new URL("../../../supabase/migrations/20261125000300_notifications_cleanup.sql", import.meta.url)),
      "utf8"
    );
    // Зөвхөн ажиллах SQL (тайлбарын мөрийг хасна).
    const sql = raw.replace(/--[^\n]*/g, "");
    const arrays = [...sql.matchAll(/array\[([^\]]+)\]/g)].map((m) =>
      [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).sort()
    );
    expect(arrays.length).toBe(2); // тоолох + шинэчлэх — хоёулаа ижил
    for (const list of arrays) expect(list).toEqual([...LEGACY_CRM_NOTIFICATION_TYPES].sort());
    // Идэвхтэй CRM2 төрлийг хөндөхгүй, устгахгүй.
    expect(sql).not.toMatch(/crm_team_added|crm_team_lead/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).toMatch(/read_at is null/);
  });
});
