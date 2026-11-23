import { describe, expect, it } from "vitest";

import { applySuggestion, suggestionsFor } from "@/lib/search/suggest";

const labels = (q: string) => suggestionsFor(q).map((s) => s.label);

describe("suggestionsFor", () => {
  it("латинаар бичсэн дүүргийн эхлэл", () => {
    expect(labels("bay").slice(0, 2).sort()).toEqual(["Баянгол", "Баянзүрх"]);
    expect(labels("songino")).toContain("Сонгинохайрхан");
  });

  it("кирилл эхлэл", () => {
    expect(labels("хан")).toContain("Хан-Уул");
    expect(labels("tur")).toContain("Түрээс");
  });

  it("хоёр үгтэй хэсэг (span 2)", () => {
    const h = suggestionsFor("хан уу").find((s) => s.label === "Хан-Уул");
    expect(h?.span).toBe(2);
    const o = suggestionsFor("орон с").find((s) => s.label === "Орон сууц");
    expect(o?.span).toBe(2);
  });

  it("эрэмбэ: дүүрэг, төрөл, гүйлгээ", () => {
    const l = labels("худ");
    expect(l).toContain("Худалдааны талбай");
    expect(l).toContain("Худалдана");
    expect(l.indexOf("Худалдааны талбай")).toBeLessThan(l.indexOf("Худалдана"));
  });

  it("тоо → өрөө, үнэ, талбай", () => {
    expect(labels("2")).toEqual(["2 өрөө", "2 сая хүртэл"]);
    expect(labels("300")).toEqual(["300 сая хүртэл", "300 м²-аас дээш"]);
    expect(labels("2 өрөө 80")).toEqual(["80 сая хүртэл", "80 м²-аас дээш"]);
  });

  it("аль хэдийн бичсэн утгыг санал болгохгүй, хязгаартай", () => {
    expect(labels("Баянзүрх ба")).not.toContain("Баянзүрх");
    expect(labels("Баянзүрх ба")).toContain("Баянгол");
    expect(labels("Хаус")).not.toContain("Хаус");
    expect(suggestionsFor("б", 2)).toHaveLength(2);
    expect(suggestionsFor("")).toEqual([]);
    expect(suggestionsFor("   ")).toEqual([]);
  });
});

describe("applySuggestion", () => {
  it("сүүлийн үг(с)-ийг солино", () => {
    expect(applySuggestion("2 өрөө bay", { label: "Баянзүрх", span: 1 })).toBe("2 өрөө Баянзүрх ");
    expect(applySuggestion("хан уу", { label: "Хан-Уул", span: 2 })).toBe("Хан-Уул ");
    expect(applySuggestion("зайсан  орон с  ", { label: "Орон сууц", span: 2 })).toBe("зайсан  Орон сууц ");
  });
});
