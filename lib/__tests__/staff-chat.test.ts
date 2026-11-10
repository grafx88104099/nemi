import { describe, expect, it } from "vitest";

import {
  chatTimeLabel,
  filterStaffChats,
  groupMessagesByDay,
  mergeStaffMessages,
  messageDayLabel,
  newStaffMessageId,
  staffChatTitle,
  totalUnread,
  visibleStaffChats,
  type StaffChatThreadMessage,
} from "@/lib/staff-chat";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// 2026-11-09 12:00 Улаанбаатарын цагаар.
const NOW = new Date("2026-11-09T04:00:00Z");

function msg(id: string, created_at: string, status?: StaffChatThreadMessage["status"]): StaffChatThreadMessage {
  return { id, chat_id: "c", sender_id: "s", body: id, created_at, status };
}

describe("groupMessagesByDay", () => {
  it("хоосон жагсаалтад бүлэг үүсгэхгүй", () => {
    expect(groupMessagesByDay([], NOW)).toEqual([]);
  });

  it("UTC биш Улаанбаатарын өдрөөр хуваана", () => {
    // 15:59Z = 23:59 UB, 16:00Z = дараагийн өдрийн 00:00 UB.
    const groups = groupMessagesByDay(
      [msg("a", "2026-11-07T15:59:00Z"), msg("b", "2026-11-07T16:00:00Z"), msg("c", "2026-11-08T03:00:00Z")],
      NOW
    );
    expect(groups.map((g) => g.messages.map((m) => m.id))).toEqual([["a"], ["b", "c"]]);
    expect(groups.map((g) => g.key)).toEqual(["2026.11.07", "2026.11.08"]);
  });

  it("өнөөдөр, өчигдрийн шошго өгнө", () => {
    const groups = groupMessagesByDay([msg("a", "2026-11-08T04:00:00Z"), msg("b", "2026-11-09T01:00:00Z")], NOW);
    expect(groups.map((g) => g.label)).toEqual(["Өчигдөр", "Өнөөдөр"]);
  });
});

describe("messageDayLabel", () => {
  it("энэ жилийнхэд гараг, өмнөх жилийнхэд он харуулна", () => {
    expect(messageDayLabel("2026-11-02T04:00:00Z", NOW)).toBe("11-р сарын 2, даваа");
    expect(messageDayLabel("2025-11-02T04:00:00Z", NOW)).toBe("2025 оны 11-р сарын 2");
  });
});

describe("chatTimeLabel", () => {
  it("огнооны алсаас хамааран товчилно", () => {
    expect(chatTimeLabel("2026-11-09T02:05:00Z", NOW)).toBe("10:05");
    expect(chatTimeLabel("2026-11-08T02:05:00Z", NOW)).toBe("Өчигдөр");
    expect(chatTimeLabel("2026-06-08T02:05:00Z", NOW)).toBe("06.08");
    expect(chatTimeLabel("2025-06-08T02:05:00Z", NOW)).toBe("2025.06.08");
  });
});

describe("totalUnread", () => {
  it("бүх чатын уншаагүйг нэмнэ", () => {
    expect(totalUnread([{ unread_count: 2 }, { unread_count: 0 }, { unread_count: 5 }])).toBe(7);
    expect(totalUnread([])).toBe(0);
  });
});

describe("mergeStaffMessages", () => {
  it("realtime хуулбар оптимист мессежийг давхардуулахгүй, баталгаажуулна", () => {
    const merged = mergeStaffMessages(
      [msg("a", "2026-11-09T01:00:00Z"), msg("b", "2026-11-09T01:01:00Z", "sending")],
      [msg("b", "2026-11-09T01:00:30.123456+00:00")]
    );
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
    expect(merged[1].status).toBeUndefined();
    expect(merged[1].created_at).toBe("2026-11-09T01:00:30.123456+00:00");
  });

  it("сервер цагаар эрэмбэлнэ", () => {
    const merged = mergeStaffMessages([msg("b", "2026-11-09T02:00:00Z")], [msg("a", "2026-11-09T01:00:00Z")]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("илгээгдэж байгаа, амжилтгүй мессеж баталгаажсаны доор үлдэнэ", () => {
    // Клиентийн цаг урагшаа ч, хойшоо ч зөрж болно.
    const merged = mergeStaffMessages(
      [msg("pending", "2026-11-09T00:00:00Z", "sending"), msg("failed", "2026-11-09T00:00:01Z", "failed")],
      [msg("server", "2026-11-09T05:00:00Z")]
    );
    expect(merged.map((m) => m.id)).toEqual(["server", "pending", "failed"]);
  });

  it("анхны массивыг өөрчлөхгүй", () => {
    const current = [msg("a", "2026-11-09T01:00:00Z")];
    mergeStaffMessages(current, [msg("b", "2026-11-09T02:00:00Z")]);
    expect(current).toHaveLength(1);
  });
});

describe("visibleStaffChats", () => {
  const base = { id: "x", kind: "direct" as const, last_message_at: null };

  it("мессежгүй шууд чатыг нуух ч нээлттэйг үлдээнэ", () => {
    expect(visibleStaffChats([base], null)).toEqual([]);
    expect(visibleStaffChats([base], "x")).toEqual([base]);
  });

  it("мессежгүй бүлэг, багийн чатыг харуулна", () => {
    const team = { ...base, kind: "team" as const };
    const group = { ...base, kind: "group" as const };
    expect(visibleStaffChats([team, group], null)).toEqual([team, group]);
  });
});

describe("filterStaffChats, staffChatTitle", () => {
  const chats = [
    { kind: "direct" as const, name: null, other_name: "Болд", last_body: "Сайн уу" },
    { kind: "team" as const, name: "Борлуулалтын баг", other_name: null, last_body: null },
    { kind: "direct" as const, name: null, other_name: null, last_body: "Мэдээ" },
  ];

  it("шууд чатад нөгөө хүний нэр, бусдад чатын нэр", () => {
    expect(chats.map(staffChatTitle)).toEqual(["Болд", "Борлуулалтын баг", "Хэрэглэгч"]);
  });

  it("нэр эсвэл сүүлийн мессежээр том жижиг үсэг ялгахгүй хайна", () => {
    expect(filterStaffChats(chats, "БОЛД")).toEqual([chats[0]]);
    expect(filterStaffChats(chats, "  мэдээ ")).toEqual([chats[2]]);
    expect(filterStaffChats(chats, "   ")).toEqual(chats);
  });
});

describe("newStaffMessageId", () => {
  it("randomUUID-г ашиглана", () => {
    expect(newStaffMessageId()).toMatch(UUID_V4);
  });

  it("randomUUID байхгүй үед хүчинтэй v4 UUID үүсгэнэ", () => {
    const source = { getRandomValues: <T extends ArrayBufferView>(a: T) => crypto.getRandomValues(a as never) as T };
    expect(newStaffMessageId(source as unknown as Crypto)).toMatch(UUID_V4);
  });
});
