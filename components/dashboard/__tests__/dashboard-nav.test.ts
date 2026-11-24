import { describe, expect, it } from "vitest";

import { agentNavItems } from "@/components/dashboard/DashboardNav";

const CHAT = "33333333-3333-4333-8333-333333333333";
const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("агентын дээд цэс — «Багийн чат»", () => {
  it("багийн гишүүнд «Чат»-ын өмнө, өөрийн багийн яриа руу", () => {
    const items = agentNavItems({ crm: true, teamChatId: CHAT });
    expect(labels(items)).toEqual([
      "Тойм",
      "Миний ажил",
      "CRM",
      "Миний зар",
      "Төслүүд",
      "Багийн чат",
      "Чат",
      "Миний профайл",
    ]);
    const team = items.find((i) => i.label === "Багийн чат")!;
    expect(team.href).toBe(`/agent/chat/${CHAT}`);
    expect(team.unread).toEqual({ chatId: CHAT });
    expect(items.find((i) => i.label === "Чат")!.unread).toEqual({ all: true });
  });

  it("багийн яриан дээр зөвхөн «Багийн чат» идэвхтэй; бусад ярианд «Чат»", () => {
    const items = agentNavItems({ crm: true, teamChatId: CHAT });
    const active = (p: string) => labels(items.filter((i) => i.active(p)));
    expect(active(`/agent/chat/${CHAT}`)).toEqual(["Багийн чат"]);
    expect(active("/agent/chat/44444444-4444-4444-8444-444444444444")).toEqual(["Чат"]);
    expect(active("/agent/chat")).toEqual(["Чат"]);
    // Угтвар давхцах өөр id «Багийн чат»-ыг идэвхжүүлэхгүй.
    expect(active(`/agent/chat/${CHAT}0`)).toEqual(["Чат"]);
  });

  it("багийн чатгүй бол цэс өмнөхтэй ижил", () => {
    expect(labels(agentNavItems({ crm: true, teamChatId: null }))).not.toContain("Багийн чат");
    expect(labels(agentNavItems({ crm: false, teamChatId: null }))).toEqual([
      "Тойм",
      "Миний зар",
      "Төслүүд",
      "Даалгавар",
      "Чат",
      "Миний профайл",
    ]);
  });
});
