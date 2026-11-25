import { describe, expect, it } from "vitest";

import {
  coverAfterRemove,
  indexAtPoint,
  isImageLike,
  keyMoveTarget,
  moveItem,
  pruneSelected,
  restoreRemoved,
  splitPickedFiles,
  toggleSelected,
} from "@/components/crm2/staff/form/MediaTile";
import { pendingBadgeText, queueStatusText, sendNowLabel, sortForList, waitHint } from "@/components/crm2/staff/media/PendingUploads";
import type { QueueItem } from "@/lib/crm2/device/upload-queue";

describe("moveItem", () => {
  it("moves forward and backward", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveItem(["a", "b"], 1, 0)).toEqual(["b", "a"]);
  });

  it("returns the same array for no-op or out-of-range moves", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, -1, 0)).toBe(list);
    expect(moveItem(list, 0, 3)).toBe(list);
  });

  it("does not mutate the input", () => {
    const list = ["a", "b", "c"];
    moveItem(list, 0, 2);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("indexAtPoint", () => {
  // 2-баганат сүлжээ (375px дэлгэц): 160×120 хавтан, 8px завсар.
  const rects = [
    { left: 16, top: 100, width: 160, height: 120 },
    { left: 184, top: 100, width: 160, height: 120 },
    { left: 16, top: 228, width: 160, height: 120 },
    { left: 184, top: 228, width: 160, height: 120 },
  ];

  it("finds the tile under the pointer", () => {
    expect(indexAtPoint(rects, 50, 150)).toBe(0);
    expect(indexAtPoint(rects, 300, 150)).toBe(1);
    expect(indexAtPoint(rects, 300, 300)).toBe(3);
  });

  it("falls back to the nearest tile in gaps and outside the grid", () => {
    expect(indexAtPoint(rects, 180, 150)).toBe(0);
    expect(indexAtPoint(rects, 360, 400)).toBe(3);
    expect(indexAtPoint(rects, 0, 0)).toBe(0);
  });

  it("returns -1 for an empty grid", () => {
    expect(indexAtPoint([], 10, 10)).toBe(-1);
  });
});

describe("keyMoveTarget (keyboard fallback)", () => {
  it("maps ←/→ and ↑/↓ to neighbours", () => {
    expect(keyMoveTarget("ArrowLeft", 2, 5)).toBe(1);
    expect(keyMoveTarget("ArrowRight", 2, 5)).toBe(3);
    expect(keyMoveTarget("ArrowUp", 2, 5)).toBe(1);
    expect(keyMoveTarget("ArrowDown", 2, 5)).toBe(3);
  });

  it("supports Home/End", () => {
    expect(keyMoveTarget("Home", 3, 5)).toBe(0);
    expect(keyMoveTarget("End", 1, 5)).toBe(4);
  });

  it("returns null at the edges, for other keys and bad indexes", () => {
    expect(keyMoveTarget("ArrowLeft", 0, 5)).toBeNull();
    expect(keyMoveTarget("ArrowRight", 4, 5)).toBeNull();
    expect(keyMoveTarget("Home", 0, 5)).toBeNull();
    expect(keyMoveTarget("Enter", 2, 5)).toBeNull();
    expect(keyMoveTarget("ArrowLeft", -1, 5)).toBeNull();
  });
});

describe("selection", () => {
  it("toggles ids", () => {
    const a = toggleSelected(new Set(), "x");
    expect([...a]).toEqual(["x"]);
    expect([...toggleSelected(a, "x")]).toEqual([]);
  });

  it("prunes ids that no longer exist and keeps identity when unchanged", () => {
    const sel = new Set(["a", "b"]);
    expect(pruneSelected(sel, ["a", "b", "c"])).toBe(sel);
    expect([...pruneSelected(sel, ["b"])]).toEqual(["b"]);
  });
});

describe("cover and undo after bulk delete", () => {
  it("keeps the cover when it survives", () => {
    expect(coverAfterRemove(["a", "b", "c"], "b", new Set(["a"]))).toBe("b");
  });

  it("moves the cover to the first remaining image", () => {
    expect(coverAfterRemove(["a", "b", "c"], "a", new Set(["a", "b"]))).toBe("c");
    expect(coverAfterRemove(["a", "b"], null, new Set(["a"]))).toBe("b");
    expect(coverAfterRemove(["a"], "a", new Set(["a"]))).toBeNull();
  });

  it("restores removed items at their original positions", () => {
    const original = ["a", "b", "c", "d", "e"];
    const removed = [
      { item: "b", index: 1 },
      { item: "d", index: 3 },
    ];
    const after = original.filter((x) => x !== "b" && x !== "d");
    expect(restoreRemoved(after, removed)).toEqual(original);
    // Дараа нь нэмсэн файл төгсгөлдөө үлдэнэ.
    expect(restoreRemoved([...after, "f"], [...removed].reverse())).toEqual([...original, "f"]);
  });
});

describe("picked files", () => {
  const f = (name: string, type: string) => ({ name, type });

  it("detects images including HEIC and empty MIME gallery files", () => {
    expect(isImageLike(f("IMG_1.HEIC", ""))).toBe(true);
    expect(isImageLike(f("a.jpg", "image/jpeg"))).toBe(true);
    expect(isImageLike(f("photo", "image/heif"))).toBe(true);
    expect(isImageLike(f("clip.mov", "video/quicktime"))).toBe(false);
    expect(isImageLike(f("clip.mp4", ""))).toBe(false);
  });

  it("splits images from videos and caps images", () => {
    const files = [f("1.jpg", "image/jpeg"), f("v.mp4", "video/mp4"), f("2.heic", ""), f("3.png", "image/png")];
    const r = splitPickedFiles(files, 2);
    expect(r.images.map((x) => x.name)).toEqual(["1.jpg", "2.heic"]);
    expect(r.videos.map((x) => x.name)).toEqual(["v.mp4"]);
    expect(r.dropped).toBe(1);
    expect(splitPickedFiles(files).dropped).toBe(0);
    expect(splitPickedFiles(files, 0).images).toEqual([]);
  });
});

describe("pending uploads", () => {
  let n = 0;
  const item = (patch: Partial<QueueItem> = {}): QueueItem => ({
    id: `q${++n}`,
    blobKey: `b${n}`,
    profileId: "p",
    target: { kind: "media", propertyId: "prop", clientKey: "k", officeId: "o", limits: { maxImageMb: 10, maxVideoMb: 100, maxImages: 30, maxVideos: 3 } },
    status: "queued",
    attempts: 0,
    error: null,
    name: "a.jpg",
    type: "image/jpeg",
    bytes: 1000,
    isVideo: false,
    sealed: false,
    createdAt: n,
    updatedAt: n,
    nextAt: 0,
    ...patch,
  });

  it("labels every status in Mongolian", () => {
    expect(queueStatusText(item())).toBe("Дараалалд");
    expect(queueStatusText(item({ attempts: 2 }))).toBe("Дахин оролдоно…");
    expect(queueStatusText(item({ status: "waiting_wifi" }))).toBe("Wi-Fi холбогдтол хүлээж байна");
    // iPhone: сүлжээг тодорхойлох боломжгүй — «Wi-Fi хүлээж байна» гэж худал хэлэхгүй.
    expect(queueStatusText(item({ status: "waiting_wifi" }), "unknown")).toBe("Сүлжээг тодорхойлж чадсангүй — одоо илгээх үү?");
    expect(queueStatusText(item({ status: "waiting_property" }))).toMatch(/Хөрөнгө/);
    expect(queueStatusText(item({ status: "uploading" }))).toBe("Хуулж байна…");
    expect(queueStatusText(item({ status: "failed", error: "Сүлжээ" }))).toBe("Сүлжээ");
    expect(queueStatusText(item({ status: "failed" }))).toMatch(/Дахин оролдох/);
  });

  it("«Одоо илгээх» товч хэмжээгээ, тайлбар нь сүлжээгээ харуулна", () => {
    expect(sendNowLabel(25 * 1024 * 1024)).toBe("Одоо илгээх (25.0 МБ)");
    expect(sendNowLabel(0)).toBe("Одоо илгээх");
    expect(waitHint("unknown")).toMatch(/Одоо илгээх/);
    expect(waitHint("cellular")).toMatch(/Wi-Fi-д холбогдмогц/);
  });

  it("builds the shell badge text", () => {
    expect(pendingBadgeText([])).toBeNull();
    expect(pendingBadgeText([item({ status: "done" })])).toBeNull();
    expect(pendingBadgeText([item(), item(), item({ status: "uploading" })])?.text).toBe("3 зураг хүлээгдэж байна");
    expect(pendingBadgeText([item(), item({ isVideo: true, type: "video/mp4", status: "waiting_wifi" })])?.text).toBe(
      "2 файл хүлээгдэж байна"
    );
    expect(pendingBadgeText([item(), item({ status: "failed" })])?.text).toBe("1 зураг хүлээгдэж байна · 1 алдаатай");
    expect(pendingBadgeText([item({ status: "failed" })])).toEqual({ text: "1 зураг хуулагдсангүй", failed: 1, pending: 0 });
    const doc = item({
      target: { kind: "brokerage", contractId: "c", fileKind: "contract", officeId: "o", limits: { maxDocMb: 20, maxDocsPerContract: 10 } },
    });
    expect(pendingBadgeText([doc])?.text).toBe("1 файл хүлээгдэж байна");
  });

  it("lists failed first, then uploading, then the rest oldest first", () => {
    const a = item({ createdAt: 1 });
    const b = item({ createdAt: 2, status: "failed" });
    const c = item({ createdAt: 3, status: "uploading" });
    const d = item({ createdAt: 0, status: "waiting_wifi" });
    expect(sortForList([a, b, c, d]).map((x) => x.id)).toEqual([b.id, c.id, d.id, a.id]);
  });
});
