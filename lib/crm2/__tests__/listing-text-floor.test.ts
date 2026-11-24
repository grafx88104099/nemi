import { describe, expect, it } from "vitest";

import { describeFloor, formatFloorText, parseFloorText } from "@/lib/crm2/listing-text/floor";
import { findFloorInText } from "@/lib/crm2/listing-text/floor";

describe("parseFloorText", () => {
  const ok: [string, number, number | null][] = [
    ["12/18", 12, 18],
    ["12-18", 12, 18],
    ["12 / 18", 12, 18],
    ["12*18", 12, 18],
    ["12 18", 12, 18],
    ["12.18", 12, 18],
    ["12\\18", 12, 18],
    ["12", 12, null],
    ["-1", -1, null],
    ["-1/5", -1, 5],
    ["0", 0, null],
    ["  7/9  ", 7, 9],
    ["12/", 12, null],
    ["300/300", 300, 300],
  ];
  it.each(ok)("%s", (s, floor, buildingFloors) => {
    expect(parseFloorText(s)).toEqual({ floor, buildingFloors });
  });

  const bad = ["", "/", "abc", "12/18/20", "18/12", "301", "-11", "5/0", "5/301", "12,5", "1 2 3", "12a"];
  it.each(bad)("%j → null", (s) => {
    expect(parseFloorText(s)).toBeNull();
  });
});

describe("describeFloor / formatFloorText", () => {
  it("«12-р давхар / 18 давхартай»", () => {
    expect(describeFloor(12, 18)).toBe("12-р давхар / 18 давхартай");
    expect(describeFloor(12)).toBe("12-р давхар");
    expect(describeFloor(null, 18)).toBe("18 давхартай");
    expect(describeFloor(-1, 9)).toBe("Газар доорх 1-р давхар / 9 давхартай");
    expect(describeFloor(0)).toBe("Цокол давхар");
  });
  it("бичвэр рүү буцааж", () => {
    expect(formatFloorText(12, 18)).toBe("12/18");
    expect(formatFloorText(12, null)).toBe("12");
    expect(formatFloorText(null, null)).toBe("");
    const v = parseFloorText(formatFloorText(4, 16));
    expect(v).toEqual({ floor: 4, buildingFloors: 16 });
  });
});

describe("findFloorInText (чөлөөт бичвэр)", () => {
  it("«14/16 давхар», «давхар: 3/5»", () => {
    expect(findFloorInText("14/16 давхар")).toMatchObject({ floor: 14, buildingFloors: 16, floorConfidence: "high" });
    expect(findFloorInText("давхар: 3/5")).toMatchObject({ floor: 3, buildingFloors: 5 });
  });
  it("«9 давхарын 6 давхарт», «23 давхар барилгын 3-р давхарт»", () => {
    expect(findFloorInText("9 давхарын 6 давхарт")).toMatchObject({ floor: 6, buildingFloors: 9 });
    expect(findFloorInText("23 давхар барилгын 3-р давхарт")).toMatchObject({ floor: 3, buildingFloors: 23 });
  });
  it("«-т» → давхар, «-тай» → барилга", () => {
    expect(findFloorInText("10 давхарт")).toMatchObject({ floor: 10, floorConfidence: "high" });
    expect(findFloorInText("16 давхартай байр")).toMatchObject({ buildingFloors: 16 });
    expect(findFloorInText("16 давхартай байр").floor).toBeUndefined();
  });
  it("нүцгэн «3 давхар» → low, барилгагүй", () => {
    const f = findFloorInText("2 өрөө 3 давхар");
    expect(f).toMatchObject({ floor: 3, floorConfidence: "low" });
    expect(f.buildingFloors).toBeUndefined();
  });
  it("«24/7 харуул», он сар биш", () => {
    expect(findFloorInText("24/7 харуул хамгаалалт")).toEqual({});
    expect(findFloorInText("2026/11/24 чөлөөлөгдөнө")).toEqual({});
  });
  it("давхар > барилга бол барилгыг хаяж, low", () => {
    const f = findFloorInText("12 давхарт, 9 давхартай");
    expect(f.floor).toBe(12);
    expect(f.buildingFloors).toBeUndefined();
    expect(f.floorConfidence).toBe("low");
  });
});
