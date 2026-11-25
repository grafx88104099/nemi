import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Зуучлалын гэрээний server action (20261125000100): RPC-ийн нэр, аргументын нэр SQL-тэй ижил, клиент
 * талын шалгалт RPC-ээс өмнө, DB алдаа → маягтын талбар. supabase client-ийг mock хийнэ (DB-гүй).
 */

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

const state: {
  user: { id: string } | null;
  rpc: Record<string, RpcResult>;
  rpcCalls: { name: string; args: unknown }[];
  inserts: { table: string; row: unknown }[];
  removed: string[];
  insertError: { message: string; code?: string } | null;
} = { user: null, rpc: {}, rpcCalls: [], inserts: [], removed: [], insertError: null };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      return state.rpc[name] ?? { data: null, error: { message: `unexpected rpc ${name}` } };
    },
    from: (table: string) => ({
      insert: (row: unknown) => {
        state.inserts.push({ table, row });
        return {
          select: () => ({
            single: async () =>
              state.insertError ? { data: null, error: state.insertError } : { data: { id: CONTRACT, number: "B012" }, error: null },
          }),
        };
      },
    }),
    storage: {
      from: () => ({
        createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://storage.test/${p}` }, error: null }),
        remove: async (paths: string[]) => {
          state.removed.push(...paths);
          return { error: null };
        },
      }),
    },
  }),
}));

import { createBrokerageDraft, invalidateBrokerage, registerBrokerage } from "@/lib/crm2/actions/brokerage";
import { addBrokerageFileRow } from "@/lib/crm2/actions/media";
import { CONTRACT_PDF_ONLY_ERROR } from "@/lib/crm2/schemas";
import { addMonthsIso } from "@/lib/crm2/checklist";
import { ubToday } from "@/lib/crm2/datetime";
import { MISSING_ITEM_LABEL } from "@/lib/crm2/labels";

const USER = "6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d";
const CONTRACT = "11111111-2222-4333-8444-555555555555";
const PROP = "0c9e7a51-2b3d-4f6a-8e1c-5d7b9a3f1e20";

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20261125000100_crm2_contract_register.sql"),
  "utf8"
);

/** create function public.<name>(…) параметрийн нэрс. */
function sqlParams(name: string): string[] {
  const m = new RegExp(`create (?:or replace )?function public\\.${name}\\(([^)]*)\\)`).exec(MIGRATION);
  if (!m) throw new Error(`${name} олдсонгүй`);
  return m[1]
    .split(",")
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean);
}

beforeEach(() => {
  state.user = { id: USER };
  state.rpc = {};
  state.rpcCalls = [];
  state.inserts = [];
  state.removed = [];
  state.insertError = null;
  vi.unstubAllGlobals();
});

describe("RPC-ийн аргумент SQL-тэй ижил", () => {
  it("crm2_brokerage_register(p_contract, p_end_date, p_stamp_confirmed), crm2_brokerage_invalidate(p_contract, p_reason)", () => {
    expect(sqlParams("crm2_brokerage_register")).toEqual(["p_contract", "p_end_date", "p_stamp_confirmed"]);
    expect(sqlParams("crm2_brokerage_invalidate")).toEqual(["p_contract", "p_reason"]);
    expect(sqlParams("crm2_can_invalidate_brokerage")).toEqual(["p_contract"]);
  });
});

describe("registerBrokerage", () => {
  const end = addMonthsIso(ubToday(), 12)!;
  const result = {
    contract_status: "active",
    number: "B012",
    start_date: ubToday(),
    end_date: end,
    property_status: "active",
    property_missing: [],
  };

  it("crm2_brokerage_register-ийг яг эдгээр аргументаар дуудна", async () => {
    state.rpc.crm2_brokerage_register = { data: result, error: null };
    const r = await registerBrokerage({ contract_id: CONTRACT, end_date: end, stamp_confirmed: true });
    expect(r).toEqual({ ok: true, data: result });
    expect(state.rpcCalls).toEqual([
      { name: "crm2_brokerage_register", args: { p_contract: CONTRACT, p_end_date: end, p_stamp_confirmed: true } },
    ]);
  });

  it("тамга тэмдэглээгүй → stamp_confirmed талбар, RPC дуудахгүй", async () => {
    const r = await registerBrokerage({ contract_id: CONTRACT, end_date: end, stamp_confirmed: false });
    expect(r).toMatchObject({ ok: false, field: "stamp_confirmed" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("дуусах огноо өнгөрсөн / 5 жилээс хол / хоосон → end_date, RPC дуудахгүй", async () => {
    for (const end_date of ["2020-01-01", addMonthsIso(ubToday(), 61)!, ""]) {
      const r = await registerBrokerage({ contract_id: CONTRACT, end_date, stamp_confirmed: true });
      expect(r, end_date).toMatchObject({ ok: false, field: "end_date" });
    }
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("DB «гэрээнд дутуу: …» → эхний зүйлийн талбар", async () => {
    state.rpc.crm2_brokerage_register = {
      data: null,
      error: { code: "P0001", message: `CRM: гэрээнд дутуу: ${MISSING_ITEM_LABEL.file}, ${MISSING_ITEM_LABEL.ownership_doc}` },
    };
    const r = await registerBrokerage({ contract_id: CONTRACT, end_date: end, stamp_confirmed: true });
    expect(r).toEqual({
      ok: false,
      field: "file",
      error: `Гэрээнд дутуу: ${MISSING_ITEM_LABEL.file}, ${MISSING_ITEM_LABEL.ownership_doc}`,
    });
  });

  it("нэвтрээгүй бол RPC дуудахгүй", async () => {
    state.user = null;
    const r = await registerBrokerage({ contract_id: CONTRACT, end_date: end, stamp_confirmed: true });
    expect(r.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("invalidateBrokerage («Гэрээ буруу»)", () => {
  it("crm2_brokerage_invalidate(p_contract, p_reason) → хөрөнгийн төлөв", async () => {
    state.rpc.crm2_brokerage_invalidate = { data: { contract_status: "terminated", property_status: "draft" }, error: null };
    const r = await invalidateBrokerage(CONTRACT, "  Тамга харагдахгүй  ");
    expect(r).toEqual({ ok: true, data: { propertyStatus: "draft" } });
    expect(state.rpcCalls).toEqual([{ name: "crm2_brokerage_invalidate", args: { p_contract: CONTRACT, p_reason: "Тамга харагдахгүй" } }]);
  });

  it("шалтгаангүй → reason талбар, RPC дуудахгүй", async () => {
    const r = await invalidateBrokerage(CONTRACT, " ");
    expect(r).toMatchObject({ ok: false, field: "reason" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("эрхгүй (DB) → CRM мессеж", async () => {
    state.rpc.crm2_brokerage_invalidate = {
      data: null,
      error: { code: "P0001", message: "CRM: энэ гэрээг «Гэрээ буруу» гэж буцаах эрхгүй (батлагч эсвэл багийн ахлагч)" },
    };
    const r = await invalidateBrokerage(CONTRACT, "Буруу");
    expect(r).toEqual({ ok: false, field: null, error: "Энэ гэрээг «Гэрээ буруу» гэж буцаах эрхгүй (батлагч эсвэл багийн ахлагч)" });
  });
});

describe("createBrokerageDraft", () => {
  it("зөвхөн property_id ба end_date илгээнэ (дугаар, эхлэх огноо, шимтгэлийг DB тавина/хаяна)", async () => {
    const r = await createBrokerageDraft({
      property_id: PROP,
      end_date: "2027-11-24",
      ...({ number: "260500", start_date: "2026-11-01", commission_type: "percent", commission_value: 3 } as object),
    });
    expect(r).toEqual({ ok: true, data: { id: CONTRACT, number: "B012" } });
    expect(state.inserts).toEqual([{ table: "crm2_brokerage_contracts", row: { property_id: PROP, end_date: "2027-11-24" } }]);
  });

  it("дуусах огноогүй ноорог", async () => {
    await createBrokerageDraft({ property_id: PROP });
    expect(state.inserts).toEqual([{ table: "crm2_brokerage_contracts", row: { property_id: PROP } }]);
  });
});

describe("addBrokerageFileRow: гэрээний PDF-ийн байтыг серверт шалгана («%PDF-»)", () => {
  const OFFICE = "33333333-3333-4333-8333-333333333333";
  const pdfPath = `${OFFICE}/brokerage/${CONTRACT}/a1b2c3.pdf`;
  const serve = (bytes: number[], status = 206) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>)?.Range).toBe("bytes=0-4");
        return new Response(new Uint8Array(bytes), { status });
      })
    );

  it("жинхэнэ PDF → мөр орно", async () => {
    serve([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const r = await addBrokerageFileRow({ contract_id: CONTRACT, storage_path: pdfPath, file_name: "geree.pdf", kind: "contract" });
    expect(r).toEqual({ ok: true, data: { id: CONTRACT } });
    expect(state.inserts).toHaveLength(1);
    expect(state.removed).toEqual([]);
  });

  it(".pdf нэртэй зураг → объектыг устгаж, field 'file' (дахин оролдохгүй), мөр орохгүй", async () => {
    serve([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const r = await addBrokerageFileRow({ contract_id: CONTRACT, storage_path: pdfPath, file_name: "geree.pdf", kind: "contract" });
    expect(r).toEqual({ ok: false, error: CONTRACT_PDF_ONLY_ERROR, field: "file" });
    expect(state.removed).toEqual([pdfPath]);
    expect(state.inserts).toHaveLength(0);
  });

  it("байтыг уншиж чадаагүй → дахин оролдох боломжтой алдаа (талбаргүй), объект үлдэнэ", async () => {
    serve([], 500);
    const r = await addBrokerageFileRow({ contract_id: CONTRACT, storage_path: pdfPath, file_name: "geree.pdf", kind: "contract" });
    expect(r.ok).toBe(false);
    expect(r.ok ? null : (r.field ?? null)).toBeNull();
    expect(state.removed).toEqual([]);
    expect(state.inserts).toHaveLength(0);
  });

  it("гэрээ .jpg замаар → схемийн алдаа (field 'file'); өмчлөлийн зураг шалгахгүй орно", async () => {
    const r = await addBrokerageFileRow({ contract_id: CONTRACT, storage_path: `${OFFICE}/brokerage/${CONTRACT}/a.jpg`, kind: "contract" });
    expect(r).toMatchObject({ ok: false, field: "file" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const own = await addBrokerageFileRow({
      contract_id: CONTRACT,
      storage_path: `${OFFICE}/brokerage/${CONTRACT}/restricted/${PROP}.jpg`,
      kind: "ownership",
    });
    expect(own.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("files_guard «нэг PDF» → field 'file'", async () => {
    serve([0x25, 0x50, 0x44, 0x46, 0x2d]);
    state.insertError = { code: "P0001", message: "CRM: гэрээнд нэг PDF хавсаргана — хуучнаа устгаад солино уу" };
    const r = await addBrokerageFileRow({ contract_id: CONTRACT, storage_path: pdfPath, kind: "contract" });
    expect(r).toEqual({ ok: false, field: "file", error: "Гэрээнд нэг PDF хавсаргана — хуучнаа устгаад солино уу" });
  });
});
