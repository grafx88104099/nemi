import { describe, expect, it } from "vitest";

import { dbErrorField, dbErrorText, firstMissingItem, GENERIC_ERROR } from "@/lib/crm2/result";
import { MISSING_ITEM_LABEL } from "@/lib/crm2/labels";

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
    // Хуучин баганын constraint (хуучин бичлэгт)
    [check("crm2_brokerage_commission", "crm2_brokerage_contracts"), "commission_value"],
    [check("crm2_brokerage_signer_note_chk", "crm2_brokerage_contracts"), "signer_note"],
    // 20261125000100: гэрээ = нэг PDF (crm2_brokerage_files_guard, constraint, unique index), дуусах огноо ≤ 5 жил
    [
      crm(
        "CRM: гэрээг зөвхөн PDF хэлбэрээр оруулна (PMC-ийн тамга, гарын үсэгтэй). Зураг гэрээ гэж тооцогдохгүй — камераар скан хийвэл нэг PDF болно"
      ),
      "file",
    ],
    [crm("CRM: гэрээнд нэг PDF хавсаргана — хуучнаа устгаад солино уу"), "file"],
    [crm("CRM: бүртгэгдсэн гэрээний PDF-ийг солихгүй"), "file"],
    [check("crm2_brokerage_files_contract_pdf", "crm2_brokerage_files"), "file"],
    [
      { code: "23505", message: 'duplicate key value violates unique constraint "crm2_brokerage_files_one_pdf"' },
      "file",
    ],
    [crm("CRM: дуусах огноо 5 жилээс хол байж болохгүй"), "end_date"],
    [crm("CRM: файл хэт том (20 МБ-аас ихгүй)"), "file"],
    [crm("CRM: нэг гэрээнд 20 хүртэл файл хадгална"), "file"],
    // Хуулалт дуусаагүй (уралдаан) — дахин оролдох боломжтой тул талбаргүй.
    [crm("CRM: файл хуулагдаагүй байна — эхлээд файлаа байршуулна уу"), null],
    // Нийтлэх (20261124000600)
    [crm("CRM: гарчиг/тайлбарт утасны дугаар байна"), "description"],
    [crm("CRM: нийтлэх боломжгүй — Нийтлэх бичвэрт утасны дугаар байна: Давуу тал"), "description"],
  ])("%o → %s", (error, field) => {
    expect(dbErrorField(error).field).toBe(field);
  });

  it("«дутуу:» жагсаалтын эхний зүйлийн талбар (crm2_brokerage_register)", () => {
    const missing = (...codes: string[]) =>
      crm(`CRM: гэрээнд дутуу: ${codes.map((c) => MISSING_ITEM_LABEL[c]).join(", ")}`);
    expect(dbErrorField(missing("end_date", "file")).field).toBe("end_date");
    expect(dbErrorField(missing("end_date_past", "owner")).field).toBe("end_date");
    expect(dbErrorField(missing("owner", "file")).field).toBe("owner");
    expect(dbErrorField(missing("owner_name")).field).toBe("owner.full_name");
    // Нэр өөрөө таслалтай («гэрээний PDF (PMC-ийн тамга, гарын үсэгтэй)») — эхний зүйлийг бүтнээр нь таньна.
    expect(dbErrorField(missing("file", "stamp_unconfirmed")).field).toBe("file");
    expect(dbErrorField(missing("file_not_pdf", "stamp_unconfirmed")).field).toBe("file");
    expect(dbErrorField(missing("stamp_unconfirmed")).field).toBe("stamp_confirmed");
    expect(dbErrorField(missing("ownership_doc", "stamp_unconfirmed")).field).toBe("ownership_doc");
    // «дутуу:» жагсаалт DB_ERROR_FIELDS-ийн «зөвхөн PDF»-ээс түрүүлнэ; текст нь CRM мессеж хэвээр.
    const r = dbErrorField(missing("file_not_pdf"));
    expect(r).toEqual({ field: "file", text: `Гэрээнд дутуу: ${MISSING_ITEM_LABEL.file_not_pdf}` });
    // Хуучин мессеж (20261124000300): нэр нь хэвээр тул танигдана.
    expect(dbErrorField(crm("CRM: гэрээнд дутуу: эхлэх огноо")).field).toBe("start_date");
    expect(dbErrorField(crm("CRM: гэрээнд дутуу: гэрээ байгуулсан агентыг баталгаажуулаагүй")).field).toBe("contract_agent_id");
  });

  it("firstMissingItem: урт нэр эхэнд, таслалтай нэр", () => {
    expect(firstMissingItem(MISSING_ITEM_LABEL.end_date_past)).toBe("end_date_past");
    expect(firstMissingItem(`${MISSING_ITEM_LABEL.end_date}, ${MISSING_ITEM_LABEL.file}`)).toBe("end_date");
    expect(firstMissingItem(`${MISSING_ITEM_LABEL.file}, ${MISSING_ITEM_LABEL.stamp_unconfirmed}`)).toBe("file");
    expect(firstMissingItem("PMC-ийн тамга")).toBeNull();
    expect(firstMissingItem("")).toBeNull();
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
