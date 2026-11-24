import { crm2Session } from "@/lib/crm2/server";
import { getCrm2Context } from "@/lib/crm2/context";
import { readTextCapped } from "@/lib/http/read-capped";
import { UI_EVENT_MAX_BYTES, sameOriginRequest } from "@/lib/crm2/quick-payload";
import { uiEventSchema } from "@/lib/crm2/schemas";
import type { Json } from "@/lib/crm2/types";

/**
 * UI хэмжилтийн beacon (P2): POST JSON ≤ 4 КБ, ижил origin, хэрэглэгчийн session, uiEventSchema.
 * Хэрэглэгчийн client-ээр (RLS: өөрийн профайл, оффис, харах эрхтэй хөрөнгө; DB guard: meta-д зөвхөн
 * код/тоо/туг, давтамжийн хязгаар) оруулна — .select() хийхгүй (уншиж эрхгүй). Хувийн утга хадгалахгүй.
 * Хариу: 204 (амжилт/алгассан), 400, 401, 403, 413.
 */

function noContent() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const raw = await readTextCapped(request, UI_EVENT_MAX_BYTES);
  if (raw == null) return Response.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = uiEventSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const session = await crm2Session();
  if (!session) return Response.json({ code: "auth" }, { status: 401 });
  const ctx = await getCrm2Context();
  if (!ctx?.isMember || !ctx.officeId) return noContent();

  const e = parsed.data;
  // first_input_ms-д тусдаа багана байхгүй — meta-д (DB: тоо < 10 000 000).
  const meta: Record<string, number | boolean> = { ...(e.meta ?? {}) };
  if (e.first_input_ms != null) meta.first_input_ms = e.first_input_ms;
  const { error } = await session.supabase.from("crm2_ui_events").insert({
    office_id: ctx.officeId,
    profile_id: session.userId,
    event: e.event,
    flow: e.flow ?? null,
    property_id: e.property_id ?? null,
    duration_ms: e.duration_ms ?? null,
    taps: e.taps ?? null,
    fields_filled: e.fields_filled ?? null,
    meta: meta as Json,
  });
  // Давтамжийн хязгаар, эрхгүй хөрөнгө г.м. — хэмжилт тул чимээгүй алгасна.
  if (error) console.error("crm2 ui event:", error.code ?? "", error.message);
  return noContent();
}
