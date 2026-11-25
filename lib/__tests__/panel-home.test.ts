import { describe, expect, it } from "vitest";

import { panelHomeFor } from "@/lib/panel-home";

describe("panelHomeFor — алдаа/404-ийн «буцах» холбоос", () => {
  it("агентын панель (суулгасан апп) → /agent/crm", () => {
    expect(panelHomeFor("/agent/chat/x")?.href).toBe("/agent/crm");
    expect(panelHomeFor("/agent")?.href).toBe("/agent/crm");
    expect(panelHomeFor("/agent/crm/staff/typo")?.href).toBe("/agent/crm");
  });

  it("оффисын панель → /office/crm", () => {
    expect(panelHomeFor("/office/tasks")?.href).toBe("/office/crm");
    expect(panelHomeFor("/office")?.href).toBe("/office/crm");
  });

  it("нийтийн сайт, төстэй угтвар — null (нийтийн нүүр хэвээр)", () => {
    expect(panelHomeFor("/agents/123")).toBeNull();
    expect(panelHomeFor("/offices")).toBeNull();
    expect(panelHomeFor("/listings")).toBeNull();
    expect(panelHomeFor(null)).toBeNull();
  });
});
