"use server";

import { revalidatePath } from "next/cache";

import { AVATAR_BUCKET, avatarFileNameFromUrl, isOwnAvatarPath } from "@/lib/avatar-upload";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; url: string | null } | { ok: false; error: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Хэрэглэгчийн хавтас дахь `keep`-ээс бусад файлыг устгана. Агентын картын зураг
 * (agents.avatar_url) бүртгэлийн зургаас хуулагдсан байж болно (setSelfAgent) — тэр файлыг
 * хэзээ ч устгахгүй; agents уншиж чадаагүй бол юу ч устгахгүй. Устгалт бүтэлгүйтэх нь
 * хэрэглэгчийн үйлдлийг саатуулахгүй.
 */
async function removeStaleAvatars(supabase: Supabase, userId: string, keep: string | null, scope: string) {
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const [{ data: files, error: listError }, { data: agents, error: agentsError }] = await Promise.all([
    bucket.list(userId, { limit: 100 }),
    supabase.from("agents").select("avatar_url").eq("profile_id", userId),
  ]);
  if (listError || agentsError) {
    console.error(`${scope}: хуучин зургийг цэвэрлэсэнгүй:`, (listError ?? agentsError)?.message);
    return;
  }
  const protectedNames = new Set(
    (agents ?? []).map((a) => avatarFileNameFromUrl(userId, a.avatar_url)).filter((n): n is string => !!n)
  );
  const stale = (files ?? [])
    .filter((f) => f.name !== keep && !protectedNames.has(f.name))
    .map((f) => `${userId}/${f.name}`);
  if (!stale.length) return;
  const { error } = await bucket.remove(stale);
  if (error) console.error(`${scope}: хуучин зураг устгагдсангүй:`, error.message);
}

/**
 * Хөтөч avatars/<uid>/... руу байршуулсны дараа: файл үнэхээр өөрийн хавтсанд байгааг шалгаад
 * profiles.avatar_url-ийг солино, хуучин файлуудыг устгана. Агентын зарын картын зураг
 * (agents.avatar_url) өөрчлөгдөхгүй. Бүх үйлдэл хэрэглэгчийн өөрийн эрхээр (RLS, storage бодлого).
 */
export async function setMyAvatar(path: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Нэвтэрнэ үү." };
  if (typeof path !== "string" || !isOwnAvatarPath(user.id, path)) return { ok: false, error: "Зургийн зам буруу." };

  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const name = path.split("/")[1];
  const { data: files, error: listError } = await bucket.list(user.id, { limit: 100, search: name });
  if (listError) return { ok: false, error: "Зургийг шалгаж чадсангүй." };
  if (!files?.some((f) => f.name === name)) return { ok: false, error: "Зураг байршаагүй байна." };

  const url = bucket.getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  if (error) return { ok: false, error: "Зургийг хадгалж чадсангүй." };

  await removeStaleAvatars(supabase, user.id, name, "setMyAvatar");
  revalidatePath("/account");
  return { ok: true, url };
}

/** Зургийг арилгана (үсгэн товчлол харагдана) — өөрийн хавтас дахь файлуудыг устгана. */
export async function removeMyAvatar(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Нэвтэрнэ үү." };

  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) return { ok: false, error: "Зургийг арилгаж чадсангүй." };

  await removeStaleAvatars(supabase, user.id, null, "removeMyAvatar");
  revalidatePath("/account");
  return { ok: true, url: null };
}
