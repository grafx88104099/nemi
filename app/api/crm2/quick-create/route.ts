import { crm2Session, revalidateCrm2 } from "@/lib/crm2/server";
import { dbErrorField } from "@/lib/crm2/result";
import { readTextCapped } from "@/lib/http/read-capped";
import {
  QUICK_CREATE_MAX_BYTES,
  rpcPropertyJson,
  sameOriginRequest,
  toQuickCreateResult,
  validateQuickCreate,
} from "@/lib/crm2/quick-payload";
import type { Json } from "@/lib/crm2/types";

/**
 * Шуурхай бүртгэл (R6) — ЦОРЫН ГАНЦ үүсгэх зам. Server action биш: deploy бүрт action-ID солигддог тул
 * утсан дээр хүлээлгэнд байсан (сүлжээгүй үед хадгалсан) илгээлт шинэ хувилбар дээр ч ажиллана.
 * Давтан илгээлтийг client_key-ээр DB танина (crm2_create_property_quick → replayed).
 *
 * Хариу:
 *   200 Crm2QuickCreateResult · 400 {error, field} оролт · 401 {code:'auth'} · 403 өөр origin ·
 *   413 хэт том · 422 {error, field} DB-ийн татгалзал · 500 бусад.
 * Хувийн утга (утас, нэр, тэмдэглэл) логт ХЭЗЭЭ Ч бичигдэхгүй.
 */

const noStore = { "cache-control": "no-store" };

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return json({ error: "Хүсэлт буруу эх сурвалжаас ирлээ." }, 403);
  const ctype = request.headers.get("content-type") ?? "";
  if (!ctype.toLowerCase().includes("application/json")) return json({ error: "Оролт буруу байна.", field: null }, 415);

  const raw = await readTextCapped(request, QUICK_CREATE_MAX_BYTES);
  if (raw == null) return json({ error: "Бүртгэл хэт том байна.", field: null }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Оролт буруу байна.", field: null }, 400);
  }

  const session = await crm2Session();
  if (!session) return json({ code: "auth", error: "Нэвтэрнэ үү." }, 401);

  const v = validateQuickCreate(body);
  if (!v.ok) return json({ error: v.error, field: v.field }, 400);

  const { data, error } = await session.supabase.rpc("crm2_create_property_quick", {
    p_property: rpcPropertyJson(v.data.property) as Json,
    p_owner: (v.data.owner ?? null) as Json | null,
    p_private: (v.data.private ?? null) as Json | null,
  });
  if (error) {
    console.error("crm2 quick-create:", error.code ?? "", error.message);
    const mapped = dbErrorField(error);
    return json({ error: mapped.text, field: mapped.field }, 422);
  }
  const result = toQuickCreateResult(data);
  if (!result) {
    console.error("crm2 quick-create: unexpected rpc result");
    return json({ error: "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.", field: null }, 500);
  }
  revalidateCrm2();
  return json(result, 200);
}
