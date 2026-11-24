import { NextResponse, type NextRequest } from "next/server";

/**
 * Web Share Target-ийн нөөц зам (manifest share_target.action). Хэвийн үед public/sw.js
 * POST-ыг өөрөө барьж IndexedDB-д хадгална; энд ирсэн бол SW хуудсыг удирдаагүй байна.
 * Хуваалцсан бичвэр/файлыг УНШИХГҮЙ, буцааж харуулахгүй — зөвхөн шуурхай бүртгэл рүү
 * «?share=nosw» тэмдэгтэй 303 (GET болгон) чиглүүлнэ; дэлгэц «текстээ наана уу» гэж зөвлөнө.
 */
const NOSW_PATH = "/agent/crm/staff/new?share=nosw";

function toQuickAdd(request: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL(NOSW_PATH, request.nextUrl.origin), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(request: NextRequest) {
  return toQuickAdd(request);
}

export async function POST(request: NextRequest) {
  return toQuickAdd(request);
}
