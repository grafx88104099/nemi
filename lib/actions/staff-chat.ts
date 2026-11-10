"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { STAFF_CHAT_MAX_BODY, type StaffChatMessage } from "@/lib/staff-chat";

/**
 * Оффисын дотоод чат. Гишүүнчлэл, оффисын хилийг RLS ба definer RPC шийднэ.
 * revalidatePath дуудахгүй: жагсаалт, яриа хоёр realtime-аар шинэчлэгдэнэ.
 */

const FALLBACK_ERR = "Чатын үйлдэл амжилтгүй боллоо. Дахин оролдоно уу.";
const INPUT_ERR = "Оролт буруу байна.";
const RPC_PREFIX = "Чат: ";
const UNIQUE_VIOLATION = "23505";
const RLS_VIOLATION = "42501";

const uuid = z.string().uuid();
const memberIds = z.array(uuid).min(1, "Дор хаяж нэг гишүүн сонгоно уу").max(100, "Нэг удаад 100 хүртэл хүн сонгоно уу");

type Result = { ok: boolean; error?: string };

function firstIssue(err: z.ZodError): string {
  const msg = err.issues[0]?.message;
  return msg && !msg.startsWith("Invalid") && !msg.startsWith("Expected") ? msg : INPUT_ERR;
}

function rpcError(fn: string, message: string): string {
  console.error(`${fn}:`, message);
  if (!message.startsWith(RPC_PREFIX)) return FALLBACK_ERR;
  const text = message.slice(RPC_PREFIX.length).trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : FALLBACK_ERR;
}

/** Хоёр хүний чатыг нээнэ, байхгүй бол үүсгэнэ. */
export async function openDirectChat(profileId: string): Promise<Result & { id?: string }> {
  if (!uuid.safeParse(profileId).success) return { ok: false, error: INPUT_ERR };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_chat_open_direct", { p_other: profileId });
  if (error) return { ok: false, error: rpcError("openDirectChat", error.message) };
  return { ok: true, id: data };
}

const createGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Бүлгийн нэр оруулна уу").max(80, "Бүлгийн нэр 80 тэмдэгтээс хэтрэхгүй"),
    memberIds,
  })
  .strict();

export async function createGroupChat(raw: { name: string; memberIds: string[] }): Promise<Result & { id?: string }> {
  const parsed = createGroupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_chat_create_group", {
    p_name: parsed.data.name,
    p_members: parsed.data.memberIds,
  });
  if (error) return { ok: false, error: rpcError("createGroupChat", error.message) };
  return { ok: true, id: data };
}

const addMembersSchema = z.object({ chatId: uuid, memberIds }).strict();

export async function addGroupMembers(raw: { chatId: string; memberIds: string[] }): Promise<Result> {
  const parsed = addMembersSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_chat_add_members", {
    p_chat: parsed.data.chatId,
    p_members: parsed.data.memberIds,
  });
  if (error) return { ok: false, error: rpcError("addGroupMembers", error.message) };
  return { ok: true };
}

export async function leaveGroupChat(chatId: string): Promise<Result> {
  if (!uuid.safeParse(chatId).success) return { ok: false, error: INPUT_ERR };

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_chat_leave", { p_chat: chatId });
  if (error) return { ok: false, error: rpcError("leaveGroupChat", error.message) };
  return { ok: true };
}

export async function markChatRead(chatId: string): Promise<Result> {
  if (!uuid.safeParse(chatId).success) return { ok: false, error: INPUT_ERR };

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_chat_mark_read", { p_chat: chatId });
  if (error) return { ok: false, error: rpcError("markChatRead", error.message) };
  return { ok: true };
}

const sendSchema = z
  .object({
    id: uuid,
    chatId: uuid,
    body: z
      .string()
      .trim()
      .min(1, "Мессеж бичнэ үү")
      .max(STAFF_CHAT_MAX_BODY, `Мессеж ${STAFF_CHAT_MAX_BODY} тэмдэгтээс хэтрэхгүй`),
  })
  .strict();

const MESSAGE_COLUMNS = "id, chat_id, sender_id, body, created_at";

/**
 * id-г клиент үүсгэнэ: realtime-аар ирэх хуулбар оптимист мессежтэй нэг id-тай тул
 * давхардахгүй, дахин илгээхэд аль хэдийн хадгалагдсан мессеж хоёр дахь удаа орохгүй.
 */
export async function sendStaffMessage(raw: {
  id: string;
  chatId: string;
  body: string;
}): Promise<Result & { message?: StaffChatMessage }> {
  const parsed = sendSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, chatId, body } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Нэвтэрнэ үү." };

  const { data, error } = await supabase
    .from("staff_chat_messages")
    .insert({ id, chat_id: chatId, sender_id: user.id, body })
    .select(MESSAGE_COLUMNS)
    .single();
  if (!error) return { ok: true, message: data };

  if (error.code === UNIQUE_VIOLATION) {
    const { data: existing } = await supabase
      .from("staff_chat_messages")
      .select(MESSAGE_COLUMNS)
      .eq("id", id)
      .eq("sender_id", user.id)
      .maybeSingle();
    if (existing) return { ok: true, message: existing };
  }

  console.error("sendStaffMessage:", error.message);
  return {
    ok: false,
    error: error.code === RLS_VIOLATION ? "Та энэ чатын гишүүн биш байна." : "Мессеж илгээгдсэнгүй.",
  };
}
