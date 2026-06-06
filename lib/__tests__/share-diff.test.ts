import { describe, it, expect } from "vitest";

import { diffShares } from "@/lib/share-diff";

describe("diffShares", () => {
  it("шинээр сонгосон агентыг нэмнэ", () => {
    const r = diffShares([], ["a", "b"], ["a", "b", "c"]);
    expect(r.toAdd.sort()).toEqual(["a", "b"]);
    expect(r.toRemove).toEqual([]);
  });

  it("сонголтоос хассан агентыг устгана", () => {
    const r = diffShares(["a", "b"], ["a"], ["a", "b"]);
    expect(r.toAdd).toEqual([]);
    expect(r.toRemove).toEqual(["b"]);
  });

  it("өөрчлөлтгүй үед хоосон буцаана", () => {
    const r = diffShares(["a", "b"], ["b", "a"], ["a", "b"]);
    expect(r.toAdd).toEqual([]);
    expect(r.toRemove).toEqual([]);
  });

  it("allowed бус (өөр оффисын) агентыг нэмэхгүй", () => {
    const r = diffShares([], ["x", "a"], ["a", "b"]);
    expect(r.toAdd).toEqual(["a"]);
    expect(r.toRemove).toEqual([]);
  });

  it("allowed бус мужид байгаа одоогийн хуваалцлыг УСТГАХГҮЙ (санамсаргүй цэвэрлэхээс хамгаална)", () => {
    // 'x' нь allowed жагсаалтад алга — desired-д байхгүй ч устгахгүй.
    const r = diffShares(["x"], [], ["a", "b"]);
    expect(r.toAdd).toEqual([]);
    expect(r.toRemove).toEqual([]);
  });

  it("давхардсан desired-ийг ганцаар тооцно", () => {
    const r = diffShares([], ["a", "a", "b"], ["a", "b"]);
    expect(r.toAdd.sort()).toEqual(["a", "b"]);
  });

  it("нэгэн зэрэг нэмж, хасна", () => {
    const r = diffShares(["a", "b"], ["b", "c"], ["a", "b", "c"]);
    expect(r.toAdd).toEqual(["c"]);
    expect(r.toRemove).toEqual(["a"]);
  });
});
