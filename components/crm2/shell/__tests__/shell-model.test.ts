import { describe, expect, it } from "vitest";

import {
  RECENT_DRAFT_MS,
  STALE_DRAFT_MS,
  STALE_LOG_MAX,
  deviceBadgeText,
  logoutLossText,
  mergeLoggedKeys,
  parseLoggedKeys,
  recentDrafts,
  staleDraftsToLog,
} from "../shell-model";

const now = Date.parse("2026-11-24T12:00:00Z");
const d = (clientKey: string, ageMs: number, status: "editing" | "queued" = "editing", deletedAt: number | null = null) => ({
  clientKey,
  savedAt: now - ageMs,
  status,
  deletedAt,
});

describe("recentDrafts", () => {
  it("12 цагаас доош, editing, устгаагүй — шинэ нь эхэнд", () => {
    const list = [d("a", 3_600_000), d("b", 60_000), d("c", RECENT_DRAFT_MS), d("q", 1000, "queued"), d("x", 1000, "editing", now)];
    expect(recentDrafts(list, now).map((x) => x.clientKey)).toEqual(["b", "a"]);
  });
  it("ирээдүйн хугацаатай (цаг буруу) ноорог орохгүй", () => {
    expect(recentDrafts([d("f", -5000)], now)).toEqual([]);
  });
});

describe("staleDraftsToLog", () => {
  it("24+ цаг илгээгдээгүй, өмнө нь бичигдээгүй л", () => {
    const list = [
      d("old", STALE_DRAFT_MS + 1),
      d("logged", STALE_DRAFT_MS * 2),
      d("young", STALE_DRAFT_MS - 1),
      d("queued", STALE_DRAFT_MS * 3, "queued"),
    ];
    expect(staleDraftsToLog(list, new Set(["logged"]), now).map((x) => x.clientKey)).toEqual(["old"]);
  });
});

describe("logged keys", () => {
  it("давхардалгүй нэгтгэж, сүүлийн N-ийг үлдээнэ", () => {
    expect(mergeLoggedKeys(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    const many = Array.from({ length: STALE_LOG_MAX + 5 }, (_, i) => `k${i}`);
    const merged = mergeLoggedKeys(many, ["z"]);
    expect(merged).toHaveLength(STALE_LOG_MAX);
    expect(merged.at(-1)).toBe("z");
  });
  it("буруу JSON, буруу төрлийг үл тооно", () => {
    expect(parseLoggedKeys(null)).toEqual([]);
    expect(parseLoggedKeys("{")).toEqual([]);
    expect(parseLoggedKeys('{"a":1}')).toEqual([]);
    expect(parseLoggedKeys('["a", 3, "b"]')).toEqual(["a", "b"]);
  });
});

describe("deviceBadgeText", () => {
  it("юу ч үгүй бол null", () => {
    expect(deviceBadgeText({ pending: 0, failed: 0 }, 0)).toBeNull();
  });
  it("алдаатай нь эхэнд, анхаарах нь сүүлд", () => {
    expect(deviceBadgeText({ pending: 3, failed: 1 }, 2)).toBe("1 файл хуулагдсангүй · 3 файл хүлээгдэж байна · 2 бүртгэл анхаарах");
    expect(deviceBadgeText({ pending: 0, failed: 0 }, 1)).toBe("1 бүртгэл анхаарах");
  });
});

describe("logoutLossText", () => {
  it("алдагдах зүйлгүй бол шууд гарна (null)", () => {
    expect(logoutLossText({ photos: 0, submits: 0 })).toBeNull();
    expect(logoutLossText({ photos: -2, submits: Number.NaN })).toBeNull();
  });
  it("«Илгээгдээгүй N зураг / M бүртгэл устна»", () => {
    expect(logoutLossText({ photos: 3, submits: 1 })).toBe("Илгээгдээгүй 3 зураг / 1 бүртгэл устна");
    expect(logoutLossText({ photos: 2, submits: 0 })).toBe("Илгээгдээгүй 2 зураг устна");
    expect(logoutLossText({ photos: 0, submits: 4 })).toBe("Илгээгдээгүй 4 бүртгэл устна");
  });
  it("дуусаагүй ноорог ба гэрээний хуудсыг мөн анхааруулна", () => {
    expect(logoutLossText({ photos: 0, submits: 0, drafts: 0, draftPhotos: 0, pages: 0 })).toBeNull();
    expect(logoutLossText({ photos: 0, submits: 0, drafts: 1, draftPhotos: 10 })).toBe("Утсан дээрх дуусаагүй 1 ноорог (10 зураг) устна");
    expect(logoutLossText({ photos: 0, submits: 0, drafts: 2 })).toBe("Утсан дээрх дуусаагүй 2 ноорог устна");
    expect(logoutLossText({ photos: 0, submits: 0, pages: 3 })).toBe("Илгээгдээгүй 3 гэрээний хуудас устна");
    expect(logoutLossText({ photos: 2, submits: 1, drafts: 1, draftPhotos: 4 })).toBe("Илгээгдээгүй 2 зураг / 1 бүртгэл, дуусаагүй 1 ноорог (4 зураг) устна");
  });
});
