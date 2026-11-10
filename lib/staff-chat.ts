import { fmtDate, fmtDateNum, fmtDayMonth, fmtDayWithWeekday, fmtTime } from "@/lib/format";
import type { Database } from "@/types/database";

/** Оффисын дотоод чатын төрлүүд ба цэвэр функцүүд (клиент, сервер хоёуланд). */

type Functions = Database["public"]["Functions"];

export type StaffChatKind = Database["public"]["Enums"]["staff_chat_kind"];
export type StaffChatListItem = Functions["staff_chat_list"]["Returns"][number];
export type StaffChatDirectoryEntry = Functions["staff_chat_directory"]["Returns"][number];
export type StaffChatPerson = Functions["staff_chat_people"]["Returns"][number];
export type StaffChatMessage = Database["public"]["Tables"]["staff_chat_messages"]["Row"];

/** status байхгүй бол сервер баталгаажуулсан мессеж. */
export type StaffChatThreadMessage = StaffChatMessage & { status?: "sending" | "failed" };

export const STAFF_CHAT_MAX_BODY = 4000;
export const STAFF_CHAT_PAGE_SIZE = 50;

const DAY_MS = 86_400_000;

export type MessageDayGroup<T> = { key: string; label: string; messages: T[] };

function isToday(iso: string, now: Date) {
  return fmtDateNum(iso) === fmtDateNum(now);
}

function isYesterday(iso: string, now: Date) {
  return fmtDateNum(iso) === fmtDateNum(now.getTime() - DAY_MS);
}

function isThisYear(iso: string, now: Date) {
  return fmtDateNum(iso).slice(0, 4) === fmtDateNum(now).slice(0, 4);
}

/** Мессежийн жагсаалтын өдрийн тусгаарлагч: «Өнөөдөр», «Өчигдөр», «11-р сарын 8, ням». */
export function messageDayLabel(iso: string, now: Date = new Date()): string {
  if (isToday(iso, now)) return "Өнөөдөр";
  if (isYesterday(iso, now)) return "Өчигдөр";
  return isThisYear(iso, now) ? fmtDayWithWeekday(iso) : fmtDate(iso);
}

/** Улаанбаатарын цагаар өдөр бүрт бүлэглэнэ; мессежүүд аль хэдийн цагийн дарааллаар ирнэ. */
export function groupMessagesByDay<T extends { created_at: string }>(
  messages: T[],
  now: Date = new Date()
): MessageDayGroup<T>[] {
  const groups: MessageDayGroup<T>[] = [];
  for (const message of messages) {
    const key = fmtDateNum(message.created_at);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.messages.push(message);
    else groups.push({ key, label: messageDayLabel(message.created_at, now), messages: [message] });
  }
  return groups;
}

/** Жагсаалтын мөрийн цаг: өнөөдөр «14:30», өчигдөр, энэ жил «06.08», бусад «2025.06.08». */
export function chatTimeLabel(iso: string, now: Date = new Date()): string {
  if (isToday(iso, now)) return fmtTime(iso);
  if (isYesterday(iso, now)) return "Өчигдөр";
  return isThisYear(iso, now) ? fmtDayMonth(iso) : fmtDateNum(iso);
}

export function totalUnread(chats: { unread_count: number }[]): number {
  return chats.reduce((sum, chat) => sum + chat.unread_count, 0);
}

export function staffChatTitle(chat: Pick<StaffChatListItem, "kind" | "name" | "other_name">): string {
  return chat.kind === "direct" ? (chat.other_name ?? "Хэрэглэгч") : (chat.name ?? "Чат");
}

/** Хоосон шууд чатыг нөгөө талд нь харуулахгүй; нээлттэй байгаа нь л үлдэнэ. */
export function visibleStaffChats<T extends Pick<StaffChatListItem, "id" | "kind" | "last_message_at">>(
  chats: T[],
  activeId: string | null
): T[] {
  return chats.filter((chat) => chat.kind !== "direct" || chat.last_message_at !== null || chat.id === activeId);
}

export function filterStaffChats<T extends Pick<StaffChatListItem, "kind" | "name" | "other_name" | "last_body">>(
  chats: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return chats;
  return chats.filter(
    (chat) => staffChatTitle(chat).toLowerCase().includes(q) || (chat.last_body ?? "").toLowerCase().includes(q)
  );
}

function compareMessages(a: StaffChatThreadMessage, b: StaffChatThreadMessage): number {
  // Клиентийн цаг сервертэй зөрж болох тул илгээгдэж байгаа мессеж үргэлж доор.
  if (!a.status !== !b.status) return a.status ? 1 : -1;
  return Date.parse(a.created_at) - Date.parse(b.created_at) || a.created_at.localeCompare(b.created_at);
}

/** id-гаар нэгтгэнэ: шинэ утга нь хуучнаа дарна, тиймээс realtime давхар мессеж үүсгэхгүй. */
export function mergeStaffMessages(
  current: StaffChatThreadMessage[],
  incoming: StaffChatThreadMessage[]
): StaffChatThreadMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compareMessages);
}

/** crypto.randomUUID зөвхөн HTTPS дээр байдаг; утсаар дотоод сүлжээнээс шалгахад унагахгүй. */
export function newStaffMessageId(source: Pick<Crypto, "getRandomValues"> & Partial<Crypto> = crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
