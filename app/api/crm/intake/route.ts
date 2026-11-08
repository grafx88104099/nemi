import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { ingestLead, officeRegistrar } from "@/lib/crm/lead-intake";
import { LEAD_SOURCE_CODES } from "@/lib/constants-crm";

/**
 * Дижитал сувгаас сэжим шууд хүлээн авах (PRO-001 v2.1 §6.4, §6.28.1):
 * вэб маягт, аяны хуудас, гадны интеграц POST хийнэ → давхардал шалгаад
 * сэжим үүсгэж, эзэмшигч оноож, эхний холболтын хугацаа эхэлнэ.
 *
 * Хамгаалалт: `Authorization: Bearer <CRM_INTAKE_SECRET>`. Нууц тохируулаагүй
 * бол endpoint хаалттай (503). Хариуд хувийн мэдээлэл буцаахгүй.
 */

const bodySchema = z
  .object({
    office_id: z.uuid(),
    name: z.string().trim().max(255).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    email: z.string().trim().max(255).optional().nullable(),
    source_code: z.enum(LEAD_SOURCE_CODES).optional(),
    source_detail: z.string().trim().max(500).optional().nullable(),
    campaign_code: z.string().trim().max(100).optional().nullable(),
    channel_ref: z.string().trim().max(200).optional().nullable(),
    contact_type: z.enum(["buyer", "tenant", "seller", "landlord"]).optional(),
    received_at: z.string().optional().nullable(),
  })
  .strict();

function authorized(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRM_INTAKE_SECRET;
  if (!secret) return { ok: false, status: 503, error: "intake_disabled" };
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  const auth = authorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const b = parsed.data;
  if (!b.phone && !b.email) {
    return NextResponse.json({ ok: false, error: "contact_required" }, { status: 400 });
  }
  const receivedAt = b.received_at && !Number.isNaN(Date.parse(b.received_at)) ? new Date(b.received_at) : new Date();
  if (receivedAt.getTime() > Date.now() + 5 * 60000) {
    return NextResponse.json({ ok: false, error: "received_at_in_future" }, { status: 400 });
  }
  const sourceCode = b.source_code ?? "digital";
  if (sourceCode === "other" && !b.source_detail) {
    return NextResponse.json({ ok: false, error: "source_detail_required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const registrar = await officeRegistrar(admin, b.office_id);
  if (!registrar) return NextResponse.json({ ok: false, error: "office_not_found" }, { status: 404 });

  const res = await ingestLead({
    officeId: b.office_id,
    fullName: b.name ?? null,
    phone: b.phone ?? null,
    email: b.email ?? null,
    sourceCode,
    sourceDetail: b.source_detail ?? "Цахим маягтаар ирсэн",
    campaignCode: b.campaign_code ?? null,
    channelRef: b.channel_ref ?? null,
    registrarId: registrar,
    contactType: b.contact_type,
    receivedAt,
  });
  if (res.error || !res.leadId) {
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 422 });
  }
  return NextResponse.json({ ok: true, lead_id: res.leadId, duplicate: Boolean(res.existing) }, { status: res.existing ? 200 : 201 });
}
