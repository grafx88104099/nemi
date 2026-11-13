import { describe, expect, it } from "vitest";

import { dedupeCutoffIso, isQuietHours, panelLink, parseHm } from "@/lib/crm/notify";
import { buildPushPayload, isGoneStatus, isPushConfigured, parsePushSubscription, vapidConfig } from "@/lib/crm/push";

describe("dedupeCutoffIso", () => {
  it("цагийн зүсэлт зөв", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    expect(dedupeCutoffIso(now, 24)).toBe("2026-09-14T12:00:00.000Z");
    expect(dedupeCutoffIso(now, 6)).toBe("2026-09-15T06:00:00.000Z");
  });
});

describe("parseHm", () => {
  it("HH:MM → минут", () => {
    expect(parseHm("21:00")).toBe(21 * 60);
    expect(parseHm("09:30")).toBe(9 * 60 + 30);
    expect(parseHm("9:05")).toBe(9 * 60 + 5);
  });

  it("буруу оролтод null", () => {
    expect(parseHm("25:00")).toBeNull();
    expect(parseHm("21:70")).toBeNull();
    expect(parseHm("nope")).toBeNull();
    expect(parseHm(null)).toBeNull();
    expect(parseHm(2100)).toBeNull();
  });
});

describe("isQuietHours (F-653, УБ UTC+8)", () => {
  const quiet = { start: "21:00", end: "09:00" }; // seed-ийн default — шөнө дамнасан

  it("шөнө дамнасан муж: УБ 22:00 (UTC 14:00) — чимээгүй", () => {
    expect(isQuietHours(new Date("2026-09-15T14:00:00Z"), quiet)).toBe(true);
  });

  it("УБ 06:00 (UTC 22:00 өмнөх өдөр) — чимээгүй", () => {
    expect(isQuietHours(new Date("2026-09-14T22:00:00Z"), quiet)).toBe(true);
  });

  it("УБ 12:00 (UTC 04:00) — ажлын цаг", () => {
    expect(isQuietHours(new Date("2026-09-15T04:00:00Z"), quiet)).toBe(false);
  });

  it("яг зааг: УБ 09:00 чимээгүй биш, 21:00 чимээгүй", () => {
    expect(isQuietHours(new Date("2026-09-15T01:00:00Z"), quiet)).toBe(false); // УБ 09:00
    expect(isQuietHours(new Date("2026-09-15T13:00:00Z"), quiet)).toBe(true); // УБ 21:00
  });

  it("энгийн муж (13:00–14:00)", () => {
    const q = { start: "13:00", end: "14:00" };
    expect(isQuietHours(new Date("2026-09-15T05:30:00Z"), q)).toBe(true); // УБ 13:30
    expect(isQuietHours(new Date("2026-09-15T06:30:00Z"), q)).toBe(false); // УБ 14:30
  });

  it("тохиргоогүй/буруу бол чимээгүй биш", () => {
    expect(isQuietHours(new Date(), null)).toBe(false);
    expect(isQuietHours(new Date(), { start: "x", end: "09:00" })).toBe(false);
    expect(isQuietHours(new Date(), { start: "09:00", end: "09:00" })).toBe(false);
  });
});

describe("panelLink — холбоосыг хүлээн авагчийн панельд тааруулах", () => {
  it("оффисын хэрэглэгчид /agent/crm → /office/crm (ижил сегмент)", () => {
    expect(panelLink("/agent/crm/staff/p1", "office_admin")).toBe("/office/crm/staff/p1");
    expect(panelLink("/agent/crm/staff/p1/deals/d1?tab=calls", "admin")).toBe("/office/crm/staff/p1/deals/d1?tab=calls");
    expect(panelLink("/agent/crm", "office_admin")).toBe("/office/crm");
    expect(panelLink("/agent/crm/team/monitor", "office_admin")).toBe("/office/crm/teams");
    expect(panelLink("/office/crm/contacts/c1", "office_admin")).toBe("/office/crm/contacts/c1");
    expect(panelLink("/agent/tasks/t1", "office_admin")).toBe("/agent/tasks/t1");
  });

  it("агентад /office/crm → /agent/crm; зөвхөн оффист байдаг хэсэг ойролцоо хуудас руу", () => {
    expect(panelLink("/office/crm/contacts/c1", "agent")).toBe("/agent/crm/contacts/c1");
    expect(panelLink("/office/crm/staff/p1?tab=agreement", "agent")).toBe("/agent/crm/staff/p1?tab=agreement");
    expect(panelLink("/office/crm", "agent")).toBe("/agent/crm");
    expect(panelLink("/office/crm/teams", "agent")).toBe("/agent/crm/team/monitor");
    expect(panelLink("/office/crm/teams/t1", "agent")).toBe("/agent/crm/team/monitor");
    expect(panelLink("/office/crm/settings/staff", "agent")).toBe("/agent/crm/settings");
    expect(panelLink("/office/crm/notifications", "agent")).toBe("/agent/crm");
    expect(panelLink("/office/crm-other", "agent")).toBe("/office/crm-other");
    expect(panelLink("/agent/crm/staff", null)).toBe("/agent/crm/staff");
  });
});

describe("push — VAPID тохиргоо, захиалга, ачаалал", () => {
  it("VAPID дутуу бол push алгасна (алдаагүй)", () => {
    expect(isPushConfigured({})).toBe(false);
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s" })).toBe(false);
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s", VAPID_SUBJECT: "nemi" })).toBe(false);
    expect(
      vapidConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s", VAPID_SUBJECT: "mailto:a@b.mn" })
    ).toEqual({ publicKey: "p", privateKey: "s", subject: "mailto:a@b.mn" });
  });

  it("хөтчийн захиалгыг шалгана", () => {
    const ok = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
    };
    expect(parsePushSubscription(ok)).toEqual({ endpoint: ok.endpoint, p256dh: ok.keys.p256dh, auth: ok.keys.auth });
    expect(parsePushSubscription({ ...ok, endpoint: "http://insecure" })).toBeNull();
    expect(parsePushSubscription({ endpoint: ok.endpoint, keys: { p256dh: "x", auth: "y" } })).toBeNull();
    expect(parsePushSubscription(null)).toBeNull();
  });

  it("ачаалал тайрагдаж, гадаад холбоос хасагдана", () => {
    const p = JSON.parse(buildPushPayload({ title: "x".repeat(200), body: "b", url: "https://evil.example" }));
    expect(p.title.length).toBe(80);
    expect(p.url).toBe("/");
    expect(JSON.parse(buildPushPayload({ title: "t", body: "b", url: "//evil" })).url).toBe("/");
    expect(JSON.parse(buildPushPayload({ title: "t", body: "b", url: "/agent/crm/staff/1" })).url).toBe("/agent/crm/staff/1");
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(500)).toBe(false);
  });
});
