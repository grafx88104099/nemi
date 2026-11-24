import { describe, expect, it } from "vitest";

import { dbErrorField, dbErrorText, GENERIC_ERROR } from "@/lib/crm2/result";

/** Postgres check constraint-ийн мессеж (PostgREST code 23514). */
const check = (constraint: string, table = "crm2_properties") => ({
  code: "23514",
  message: `new row for relation "${table}" violates check constraint "${constraint}"`,
});
const crm = (message: string) => ({ code: "P0001", message });

describe("dbErrorField: DB алдаа → маягтын талбар", () => {
  it.each([
    // Хөрөнгийн guard (prod тодорхойлолтын мессеж)
    [crm("CRM: дүүрэг жагсаалтад алга (Хан Уул)"), "district"],
    [crm("CRM: тохиргоонд бүртгэлгүй онцлог байна"), "features"],
    [crm("CRM: нэг агент хэд хэдэн үүрэг давхар авахгүй (тохиргоо)"), "contract_agent_id"],
    [crm("CRM: томилогдсон үүрэгт агентыг багийн ахлагч эсвэл менежер солино"), "listing_agent_id"],
    [check("crm2_properties_floor"), "floor"],
    [check("crm2_properties_per_m2"), "area_m2"],
    [check("crm2_properties_pin"), "lat"],
    [check("crm2_properties_parking_spaces_chk"), "parking_spaces"],
    // Харилцагч (20261124000300 crm2_contacts_guard)
    [crm("CRM: эх сурвалж жагсаалтад алга (tiktok)"), "owner.source"],
    // Зуучлалын гэрээ
    [crm("CRM: «А-12» дугаартай гэрээ аль хэдийн бүртгэлтэй"), "number"],
    [crm("CRM: гэрээний дугаар хоосон байж болохгүй"), "number"],
    [check("crm2_brokerage_dates", "crm2_brokerage_contracts"), "end_date"],
    [check("crm2_brokerage_commission", "crm2_brokerage_contracts"), "commission_value"],
    [check("crm2_brokerage_signer_note_chk", "crm2_brokerage_contracts"), "signer_note"],
    [crm("CRM: гэрээний файлыг шалгаснаа баталгаажуулна уу"), "file_checked"],
    // Нийтлэх (20261124000600)
    [crm("CRM: гарчиг/тайлбарт утасны дугаар байна"), "description"],
    [crm("CRM: нийтлэх боломжгүй — Нийтлэх бичвэрт утасны дугаар байна: Давуу тал"), "description"],
  ])("%o → %s", (error, field) => {
    expect(dbErrorField(error).field).toBe(field);
  });

  it("«дутуу:» жагсаалтын эхний зүйлийн талбар", () => {
    expect(dbErrorField(crm("CRM: гэрээнд дутуу: гарын үсэг зурах эрхийн тайлбар, гэрээний файл")).field).toBe("signer_note");
    expect(dbErrorField(crm("CRM: гэрээнд дутуу: шимтгэл")).field).toBe("commission_value");
    expect(dbErrorField(crm("CRM: гэрээнд дутуу: онцгой нөхцөл (эсвэл «онцгой нөхцөлгүй»)")).field).toBe("terms");
    expect(dbErrorField(crm("CRM: гэрээнд дутуу: эхлэх огноо")).field).toBe("start_date");
    expect(dbErrorField(crm("CRM: гэрээнд дутуу: гэрээ байгуулсан агентыг баталгаажуулаагүй")).field).toBe("contract_agent_id");
  });

  it("текст: CRM мессеж хэвээр, constraint → монгол тайлбар", () => {
    expect(dbErrorField(crm("CRM: дүүрэг жагсаалтад алга (Х)")).text).toBe("Дүүрэг жагсаалтад алга (Х)");
    expect(dbErrorField(check("crm2_properties_floor")).text).toBe("Давхар барилгын давхраас их байж болохгүй.");
  });

  it("мэдэгдэхгүй мессеж → field null, dbErrorText хэвээр", () => {
    const unknown = { code: "XX000", message: "something broke" };
    expect(dbErrorField(unknown)).toEqual({ field: null, text: dbErrorText(unknown) });
    expect(dbErrorField(unknown).text).toBe(GENERIC_ERROR);
    const rls = { code: "42501", message: "new row violates row-level security policy" };
    expect(dbErrorField(rls)).toEqual({ field: null, text: dbErrorText(rls) });
    expect(dbErrorField(null)).toEqual({ field: null, text: GENERIC_ERROR });
    expect(dbErrorField(crm("CRM: энэ хөрөнгийг засах эрхгүй")).field).toBeNull();
  });
});
