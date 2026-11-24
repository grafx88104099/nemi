/**
 * Эзний утсыг харилцагчийн жагсаалтаас эсвэл санах ойгоос (iOS) авах (P6).
 * Утсыг урт шалгахаас ӨМНӨ жигдрүүлнэ; түүхий оролтод maxLength тавихгүй.
 */

import { extractPhones } from "@/lib/crm2/listing-text/phones";
import { isFullPhone, normalizePhone } from "@/lib/crm2/phone";

export const CLIPBOARD_ERROR = "Хуулсан бичвэрийг уншиж чадсангүй — дугаараа гараар оруулна уу";
export const NO_PHONE_IN_CLIPBOARD = "Хуулсан бичвэрт утасны дугаар олдсонгүй";

type ContactsManager = {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
  getProperties?: () => Promise<string[]>;
};

function contactsApi(): ContactsManager | null {
  if (typeof navigator === "undefined" || typeof window === "undefined") return null;
  const c = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  return c && "ContactsManager" in window && typeof c.select === "function" ? c : null;
}

/** Contact Picker API байгаа эсэх (Android Chrome). */
export function canPickContact(): boolean {
  return contactsApi() !== null;
}

/** Утсуудыг жигдрүүлж (normalizePhone), бүтэн дугаартайг нь давхардалгүй буцаана. */
export function normalizePhoneList(raw: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const n = normalizePhone(r ?? "");
    if (n && isFullPhone(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

export type PickedContact = { name: string; phones: string[] };

/** Харилцагч сонгоно. Цуцалсан/дэмжихгүй бол null. phones — жигдрүүлсэн (жишээ «97699112233»). */
export async function pickContact(): Promise<PickedContact | null> {
  const api = contactsApi();
  if (!api) return null;
  try {
    const res = await api.select(["name", "tel"], { multiple: false });
    const c = res?.[0];
    if (!c) return null;
    const name = (c.name ?? []).map((s) => (s ?? "").trim()).find(Boolean) ?? "";
    return { name: name.slice(0, 160), phones: normalizePhoneList(c.tel ?? []) };
  } catch {
    return null;
  }
}

export type ClipboardPhones = { ok: true; phones: string[] } | { ok: false; error: string };

/** Санах ойн бичвэрээс утас гаргана (iOS зам). Бичвэрийг өөрийг нь буцаахгүй. */
export async function pasteFromClipboard(): Promise<ClipboardPhones> {
  let text = "";
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return { ok: false, error: CLIPBOARD_ERROR };
    text = await navigator.clipboard.readText();
  } catch {
    return { ok: false, error: CLIPBOARD_ERROR };
  }
  return phonesFromText(text);
}

/** Цэвэр: бичвэрээс утас (extractPhones + жигдрүүлэлт). */
export function phonesFromText(text: string): ClipboardPhones {
  const found = extractPhones(text ?? "");
  // Ганц дугаар бичсэн (зай/зураастай) бичвэр — extractPhones олохгүй бол бүтнээр нь жигдрүүлнэ.
  const t = (text ?? "").trim();
  const fallback = !found.length && /^[\d\s+\-().]{6,40}$/.test(t) ? [t] : [];
  const phones = normalizePhoneList([...found, ...fallback]);
  return phones.length ? { ok: true, phones } : { ok: false, error: NO_PHONE_IN_CLIPBOARD };
}
