import { describe, expect, it } from "vitest";

import {
  PUBLIC_LISTINGS_BUCKET,
  listingPhotoPath,
  orderPublishMedia,
} from "@/lib/crm2/publish-photo-paths";

const PROPERTY = "11111111-1111-4111-8111-111111111111";

type Item = { name: string; sortOrder: number; isCover: boolean };

const names = (list: Item[]) => list.map((x) => x.name);

describe("зарын зургийн зам", () => {
  it("crm2/{хөрөнгө}/{дугаар}-{id}.jpg хэлбэртэй", () => {
    expect(listingPhotoPath(PROPERTY, 0, "abc")).toBe(`crm2/${PROPERTY}/00-abc.jpg`);
    expect(listingPhotoPath(PROPERTY, 7, "abc")).toBe(`crm2/${PROPERTY}/07-abc.jpg`);
  });

  it("дугаарыг хоёр оронгоор гүйцээж, нэрээрээ зөв эрэмбэлэгдэнэ", () => {
    const paths = [0, 1, 2, 9, 10, 29].map((i) => listingPhotoPath(PROPERTY, i, "id"));
    expect([...paths].sort()).toEqual(paths);
  });

  it("хоёроос урт дугаарыг таслахгүй", () => {
    expect(listingPhotoPath(PROPERTY, 100, "id")).toBe(`crm2/${PROPERTY}/100-id.jpg`);
  });

  it("зам нь нийтийн bucket-ийн дотор (эхлэлд bucket нэр ороогүй)", () => {
    expect(PUBLIC_LISTINGS_BUCKET).toBe("listings");
    expect(listingPhotoPath(PROPERTY, 0, "id").startsWith("/")).toBe(false);
    expect(listingPhotoPath(PROPERTY, 0, "id").startsWith(PUBLIC_LISTINGS_BUCKET)).toBe(false);
  });
});

describe("зарын зургийн дараалал", () => {
  it("нүүр зураг эхэнд гарна", () => {
    const media: Item[] = [
      { name: "a", sortOrder: 0, isCover: false },
      { name: "b", sortOrder: 5, isCover: true },
      { name: "c", sortOrder: 1, isCover: false },
    ];
    expect(names(orderPublishMedia(media))).toEqual(["b", "a", "c"]);
  });

  it("нүүр зураггүй бол зөвхөн sortOrder өсөхөөр", () => {
    const media: Item[] = [
      { name: "a", sortOrder: 3, isCover: false },
      { name: "b", sortOrder: 1, isCover: false },
      { name: "c", sortOrder: 2, isCover: false },
    ];
    expect(names(orderPublishMedia(media))).toEqual(["b", "c", "a"]);
  });

  it("ижил sortOrder-той бол өгсөн дараалал хэвээр (тогтвортой)", () => {
    const media: Item[] = [
      { name: "a", sortOrder: 0, isCover: false },
      { name: "b", sortOrder: 0, isCover: false },
      { name: "c", sortOrder: 0, isCover: false },
      { name: "d", sortOrder: 0, isCover: false },
      { name: "e", sortOrder: 0, isCover: false },
      { name: "f", sortOrder: 0, isCover: false },
      { name: "g", sortOrder: 0, isCover: false },
      { name: "h", sortOrder: 0, isCover: false },
      { name: "i", sortOrder: 0, isCover: false },
      { name: "j", sortOrder: 0, isCover: false },
      { name: "k", sortOrder: 0, isCover: false },
      { name: "l", sortOrder: 0, isCover: false },
    ];
    expect(names(orderPublishMedia(media))).toEqual(names(media));
  });

  it("хэд хэдэн нүүр зураг байвал бүгд эхэнд, дотроо sortOrder-оор", () => {
    const media: Item[] = [
      { name: "a", sortOrder: 9, isCover: true },
      { name: "b", sortOrder: 0, isCover: false },
      { name: "c", sortOrder: 2, isCover: true },
    ];
    expect(names(orderPublishMedia(media))).toEqual(["c", "a", "b"]);
  });

  it("эх массивыг өөрчлөхгүй, шинэ массив буцаана", () => {
    const media: Item[] = [
      { name: "a", sortOrder: 2, isCover: false },
      { name: "b", sortOrder: 1, isCover: true },
    ];
    const out = orderPublishMedia(media);
    expect(out).not.toBe(media);
    expect(names(media)).toEqual(["a", "b"]);
    expect(out[0]).toBe(media[1]);
  });

  it("хоосон жагсаалт", () => {
    expect(orderPublishMedia([])).toEqual([]);
  });

  it("сөрөг sortOrder-ыг ч өсөхөөр эрэмбэлнэ", () => {
    const media: Item[] = [
      { name: "a", sortOrder: 1, isCover: false },
      { name: "b", sortOrder: -3, isCover: false },
    ];
    expect(names(orderPublishMedia(media))).toEqual(["b", "a"]);
  });
});
