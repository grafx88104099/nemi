import { describe, expect, it } from "vitest";

import {
  DEACTIVATE_CONFIRM_TEXT,
  agentStatusToast,
  isMissingRpc,
  isMissingTable,
  legacyStatusNotice,
  mapAgentStatusError,
  parseCrmChange,
} from "@/lib/office/agent-status";

describe("office agent status helpers", () => {
  it("баталгаажуулах текст CRM, ахлагч, чатыг дурдана", () => {
    expect(DEACTIVATE_CONFIRM_TEXT).toMatch(/CRM-д нэвтрэх эрх хаагдана/);
    expect(DEACTIVATE_CONFIRM_TEXT).toMatch(/ахлагч/);
    expect(DEACTIVATE_CONFIRM_TEXT).toMatch(/чат/);
  });

  it("RPC-ийн crm талбарыг уншина", () => {
    expect(parseCrmChange({ crm: "deactivated" })).toBe("deactivated");
    expect(parseCrmChange({ crm: "restored" })).toBe("restored");
    expect(parseCrmChange({ crm: "added" })).toBe("added");
    expect(parseCrmChange({ crm: "weird" })).toBe("none");
    expect(parseCrmChange(null)).toBe("none");
  });

  it("toast нь CRM-ийн өөрчлөлтийг хэлнэ", () => {
    expect(agentStatusToast("rejected", "deactivated")).toMatch(/CRM-ийн эрх хаагдлаа/);
    expect(agentStatusToast("rejected", "none")).toBe("Агент идэвхгүй боллоо");
    expect(agentStatusToast("active", "restored")).toMatch(/сэргэлээ/);
    expect(agentStatusToast("active", "added")).toMatch(/CRM-д нэмэгдлээ/);
    expect(agentStatusToast("active", "none")).toBe("Агент идэвхжлээ");
  });

  it("DB алдааг монгол текст болгоно", () => {
    expect(mapAgentStatusError("CRM: хүлээлцэх дуусаагүй — энэ ажилтанд 2 нээлттэй бичлэг байна")).toBe(
      "хүлээлцэх дуусаагүй — энэ ажилтанд 2 нээлттэй бичлэг байна"
    );
    expect(mapAgentStatusError("Танд энэ агентыг удирдах эрх алга.")).toBe("Танд энэ агентыг удирдах эрх алга.");
    expect(mapAgentStatusError("permission denied for function office_set_agent_status")).toBe("Танд энэ агентыг удирдах эрх алга.");
    expect(mapAgentStatusError("canceling statement due to lock timeout")).toMatch(/завгүй/);
    expect(mapAgentStatusError("Could not find the function public.office_set_agent_status in the schema cache")).toMatch(/шинэчлэгдэж/);
    expect(mapAgentStatusError("")).toMatch(/чадсангүй/);
    expect(mapAgentStatusError("random english")).toMatch(/чадсангүй/);
  });
});

describe("миграц тавигдаагүй үеийн зөөлөн буцаалт (код түрүүлж deploy)", () => {
  it("isMissingRpc: PGRST202 / «could not find the function»", () => {
    expect(isMissingRpc({ code: "PGRST202", message: "x" })).toBe(true);
    expect(isMissingRpc({ message: "Could not find the function public.office_set_agent_status(p_agent, p_status)" })).toBe(true);
    expect(isMissingRpc({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRpc(null)).toBe(false);
  });

  it("isMissingTable: PGRST205 / 42P01", () => {
    expect(isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.office_agent_audit'" })).toBe(true);
    expect(isMissingTable({ code: "42P01", message: 'relation "office_agent_audit" does not exist' })).toBe(true);
    expect(isMissingTable({ code: "23514", message: "check constraint" })).toBe(false);
    expect(isMissingTable(undefined)).toBe(false);
  });

  it("legacyStatusNotice: «Идэвхгүй» нь «Хүсэлт татгалзагдсан» биш", () => {
    expect(legacyStatusNotice("active", "rejected").title).toBe("Бүртгэл идэвхгүй боллоо");
    expect(legacyStatusNotice("pending", "rejected").title).toBe("Хүсэлт татгалзагдсан");
    expect(legacyStatusNotice("pending", "active").title).toBe("Та баталгаажлаа");
    expect(legacyStatusNotice("rejected", "active").title).toBe("Бүртгэл дахин идэвхжлээ");
  });
});
