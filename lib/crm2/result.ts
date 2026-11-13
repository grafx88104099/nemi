import type { z } from "zod";

import type { Crm2Result } from "@/lib/crm2/types";

/**
 * Server action-ийн хариу ба DB алдааны текст. DB-ийн guard/RPC алдаа монголоор
 * «CRM: ...» хэлбэртэй — угтварыг хасаад шууд харуулна. Бусад (Postgres/PostgREST
 * англи) алдааг ерөнхий монгол текст болгоно.
 */

export const GENERIC_ERROR = "Хадгалахад алдаа гарлаа. Дахин оролдоно уу.";
export const INPUT_ERROR = "Оролт буруу байна.";
export const NO_ACCESS_ERROR = "Энэ үйлдлийг хийх эрхгүй байна.";
export const NOT_FOUND_ERROR = "Бичлэг олдсонгүй эсвэл засах эрхгүй байна.";
export const AUTH_ERROR = "Нэвтэрнэ үү.";

const CRM_PREFIX = /^\s*CRM:\s*/;

type DbErrorLike = { message?: string | null; code?: string | null; details?: string | null } | null | undefined;

/** «CRM: ...» угтвартай монгол алдааг цэвэрлэнэ; угтваргүй бол null. */
export function crmMessage(message: string | null | undefined): string | null {
  const m = (message ?? "").trim();
  if (!CRM_PREFIX.test(m)) return null;
  const text = m.replace(CRM_PREFIX, "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

/** DB/PostgREST алдааг хэрэглэгчид харуулах монгол текст болгоно. */
export function dbErrorText(error: DbErrorLike): string {
  const crm = crmMessage(error?.message);
  if (crm) return crm;
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").toLowerCase();
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) return NO_ACCESS_ERROR;
  if (code === "23505") return "Ийм бичлэг аль хэдийн байна.";
  if (code === "23514" || code === "22P02" || code === "22003" || code === "22007" || code === "22008") {
    return "Оруулсан утга буруу байна. Талбаруудаа шалгана уу.";
  }
  if (code === "23503") return "Холбоотой бичлэг олдсонгүй.";
  if (code === "23502") return "Заавал бөглөх талбар дутуу байна.";
  if (code === "PGRST116") return NOT_FOUND_ERROR;
  return GENERIC_ERROR;
}

export function ok<T>(data: T): Crm2Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: string): Crm2Result<T> {
  return { ok: false, error };
}

/** DB алдааг лог руу бичээд хариу болгоно. */
export function dbFail<T = never>(where: string, error: DbErrorLike): Crm2Result<T> {
  console.error(`crm2 ${where}:`, error?.message ?? error);
  return fail(dbErrorText(error));
}

/** undefined утгатай түлхүүрийг хасна (PATCH-д зөвхөн өгсөн талбар). */
export function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Zod-ийн эхний алдааны монгол текст (англи анхдагч текстийг ерөнхий болгоно). */
export function zodErrorText(err: z.ZodError): string {
  const msg = err.issues[0]?.message;
  if (!msg) return INPUT_ERROR;
  // Зөвхөн бидний бичсэн (кирилл) мессежийг харуулна.
  return /[Ѐ-ӿ]/.test(msg) ? msg : INPUT_ERROR;
}
