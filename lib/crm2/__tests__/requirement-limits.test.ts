import { describe, it, expect } from "vitest";

import { requirementFormFrom, requirementInputFromForm } from "@/lib/crm2/contacts-requirements";
import { MUST_HAVE_MAX, REQUIREMENT_LOCATION_MAX } from "@/lib/crm2/limits";
import { requirementCreateSchema } from "@/lib/crm2/schemas";

/**
 * «Бусад зайлшгүй нөхцөл» нь мөр бүрээр нэг нөхцөл тул урт нь МӨРӨӨР
 * хязгаарлагддаг. Өмнө нь 200 тэмдэгт байсан — агент хэдхэн өгүүлбэр бичихэд
 * шаардлага хадгалагдахгүй байв (гомдол 2026-11-18). Хязгаар буурахаас
 * сэргийлж энд барина.
 */
const CONTACT = "11111111-1111-1111-1111-111111111111";

function parse(patch: Partial<ReturnType<typeof requirementFormFrom>>) {
  const form = { ...requirementFormFrom(null), ...patch };
  const input = { contact_id: CONTACT, ...requirementInputFromForm(form) };
  const r = requirementCreateSchema.safeParse(input);
  return r.success ? null : r.error.issues.map((i) => i.message).join(" | ");
}

describe("шаардлагын урт текст", () => {
  it("нэг мөрийн хязгаар 1000-аас багасахгүй", () => {
    expect(MUST_HAVE_MAX).toBeGreaterThanOrEqual(1000);
    expect(REQUIREMENT_LOCATION_MAX).toBeGreaterThanOrEqual(500);
  });

  it("хэдэн өгүүлбэр бичихэд хадгалагдана", () => {
    const text =
      "Зайлшгүй: цэвэр ус, халуун усны тасралтгүй хангамж, хаалттай хашаа, " +
      "подвал агуулахтай, лифттэй, 6-аас дээш давхар, өмнө зүгт харсан, " +
      "СӨХ-ийн төлбөр тодорхой, цонх нь шинэ, дулаалга сайтай. ".repeat(4);
    expect(text.length).toBeGreaterThan(200);
    expect(text.length).toBeLessThanOrEqual(MUST_HAVE_MAX);
    expect(parse({ must_haves: text })).toBeNull();
  });

  it("мөр бүр тусдаа тоологдоно", () => {
    const lines = Array.from({ length: 5 }, (_, i) => `${i + 1}. ` + "нөхцөл ".repeat(100));
    expect(lines[0].length).toBeGreaterThan(200);
    expect(parse({ must_haves: lines.join("\n") })).toBeNull();
  });

  it("хязгаараас хэтэрвэл уртыг ЗААСАН алдаа өгнө", () => {
    const msg = parse({ must_haves: "Б".repeat(MUST_HAVE_MAX + 1) });
    expect(msg).toContain(String(MUST_HAVE_MAX));
    expect(msg).toContain("нэг мөр");
  });

  it("мөрийн тоо 30-аар хязгаарлана", () => {
    const msg = parse({ must_haves: Array.from({ length: 31 }, (_, i) => `нөхцөл ${i}`).join("\n") });
    expect(msg).toContain("30");
  });
});
