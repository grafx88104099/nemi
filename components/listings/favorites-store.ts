/**
 * Хадгалсан зарын НЭГ клиент store — картын зүрх (CardSaveButton) ба зарын
 * хуудасны FavoriteButton хоёулаа эндээс уншина.
 *
 *  - Нэвтэрсэн: favorites хүснэгт (toggleFavorite server action).
 *  - Нэвтрээгүй: энэ хөтчийн localStorage (lib/guest-favorites).
 *
 * signedIn-ийг ЗӨВХӨН getUser() session-ийг баталгаажуулсны дараа true болгоно —
 * cookie-д session байгаа нь (getSession) хангалтгүй.
 *
 * ЗӨВХӨН "use client" файлаас импортлоно (window, localStorage, browser client).
 */
import { useCallback, useSyncExternalStore, useTransition } from "react";

import { createClient } from "@/lib/supabase/client";
import { mergeGuestFavorites, removeFavorites, toggleFavorite } from "@/lib/actions/favorites";
import {
  GUEST_FAVS_KEY,
  clearGuestFavorites,
  readGuestFavorites,
  toggleGuestFavorite,
  writeGuestFavorites,
} from "@/lib/guest-favorites";
import { currentPath, loginHref } from "@/lib/nav";
import { toast } from "@/components/ui/toast";

export type FavoritesState = {
  status: "idle" | "loading" | "ready";
  signedIn: boolean;
  userId: string | null;
  ids: ReadonlySet<string>;
};

export type ToggleResult = { saved: boolean; guest: boolean };

const IDLE: FavoritesState = { status: "idle", signedIn: false, userId: null, ids: new Set<string>() };

let state: FavoritesState = IDLE;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(next: FavoritesState) {
  state = next;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => IDLE;

function guestState(): FavoritesState {
  return { status: "ready", signedIn: false, userId: null, ids: new Set(readGuestFavorites()) };
}

function hasSupabaseEnv() {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

// ── Бүртгэл (нэг удаа) ────────────────────────────────────────────────────
let listenersRegistered = false;

function registerOnce(supabase: ReturnType<typeof createClient>) {
  if (listenersRegistered || typeof window === "undefined") return;
  listenersRegistered = true;

  supabase.auth.onAuthStateChange((evt, session) => {
    // Callback дотор supabase.auth.* дуудвал lock deadlock болно → хойшлуулна.
    // Табын фокус дээр дахин ирэх SIGNED_IN-д refresh хийхгүй — зөвхөн бодит
    // хэрэглэгч солигдох эсвэл гарах үед.
    setTimeout(() => {
      if (evt === "SIGNED_OUT" && state.signedIn) void refreshFavorites({ force: true });
      else if (evt === "SIGNED_IN" && (session?.user.id ?? null) !== state.userId) {
        void refreshFavorites({ force: true });
      }
    }, 0);
  });

  // Өөр табд зочны жагсаалт өөрчлөгдвөл (нэвтрээгүй үед) шинэчилнэ.
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== GUEST_FAVS_KEY) return;
    if (state.status !== "ready" || state.signedIn) return;
    setState(guestState());
  });
}

// ── Ачаалах / шинэчлэх ────────────────────────────────────────────────────
let inflight: Promise<void> | null = null;
let queued = false;

/**
 * Төлөвийг шинэчилнэ (нэг зэрэг нэг л хүсэлт). `force` — ажиллаж байгаа
 * хүсэлтийн дараа дахин нэг удаа ажиллана (auth өөрчлөлт).
 */
export function refreshFavorites(opts: { force?: boolean } = {}): Promise<void> {
  if (inflight) {
    if (opts.force) queued = true;
    return inflight;
  }
  inflight = (async () => {
    do {
      queued = false;
      await load();
    } while (queued);
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function load(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!hasSupabaseEnv()) {
    setState(guestState());
    return;
  }
  if (state.status === "idle") setState({ ...state, status: "loading" });

  try {
    const supabase = createClient();
    registerOnce(supabase);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setState(guestState());
      return;
    }
    // Cookie-ийн session-д итгэхгүй — серверээр баталгаажуулна.
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      setState(guestState());
      return;
    }

    const guest = readGuestFavorites();
    if (guest.length) await mergeGuest(guest);

    const { data, error: e2 } = await supabase
      .from("favorites")
      .select("listing_id")
      .eq("user_id", user.id)
      .limit(1000);
    const ids =
      e2 && state.userId === user.id ? state.ids : new Set((data ?? []).map((r) => r.listing_id.toLowerCase()));
    setState({ status: "ready", signedIn: true, userId: user.id, ids });
  } catch {
    setState(guestState());
  }
}

async function mergeGuest(guest: string[]) {
  try {
    const r = await mergeGuestFavorites(guest);
    // Амжилтгүй бол localStorage-ийг хадгална — дараагийн mount-д дахин оролдоно.
    if (!r.ok) return;
    clearGuestFavorites();
    if (r.inserted.length) {
      const inserted = r.inserted;
      toast.success(`Энэ төхөөрөмж дээр хадгалсан ${inserted.length} зарыг бүртгэлдээ нэмлээ`, {
        durationMs: 8000,
        action: {
          label: "Буцаах",
          onClick: () => {
            void removeFavorites(inserted)
              .catch(() => undefined)
              .then(() => refreshFavorites({ force: true }));
          },
        },
      });
    }
  } catch {
    // Сүлжээний алдаа — localStorage хэвээр.
  }
}

async function ensureReady() {
  if (state.status !== "ready") await refreshFavorites();
}

// ── Үйлдэл ────────────────────────────────────────────────────────────────

/** Зочин: localStorage-д `want` төлөвт оруулна (хуучин утгыг шинээр уншина — өөр таб). */
function guestApply(id: string, want?: boolean): ToggleResult {
  const cur = readGuestFavorites();
  const has = cur.includes(id);
  let ids = cur;
  let saved = has;
  if (want === undefined || want !== has) {
    const r = toggleGuestFavorite(cur, id);
    ids = r.ids;
    saved = r.saved;
  }
  writeGuestFavorites(ids);
  setState({ status: "ready", signedIn: false, userId: null, ids: new Set(ids) });
  return { saved, guest: true };
}

function withId(ids: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(ids);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export async function toggleFavoriteId(rawId: string): Promise<ToggleResult> {
  await ensureReady();
  const id = rawId.toLowerCase();
  if (!state.signedIn) return guestApply(id);

  const was = state.ids.has(id);
  const userId = state.userId;
  setState({ ...state, ids: withId(state.ids, id, !was) }); // optimistic
  const revert = () => {
    if (state.userId === userId) setState({ ...state, ids: withId(state.ids, id, was) });
  };

  try {
    const res = await toggleFavorite(id);
    if (res.error === "auth") {
      // Серверийн session дууссан — энэ төхөөрөмж дээр хадгална.
      setState(guestState());
      return guestApply(id, !was);
    }
    if (res.error) {
      revert();
      return { saved: was, guest: false };
    }
    if (state.userId === userId) setState({ ...state, ids: withId(state.ids, id, res.favorited) });
    return { saved: res.favorited, guest: false };
  } catch {
    revert();
    toast.error("Хадгалж чадсангүй. Дахин оролдоно уу.");
    return { saved: was, guest: false };
  }
}

/** Хэрэглэгчийн дарснаар (нийтлэгдээгүй зарууд) localStorage-оос хасна. */
export function removeGuestIds(ids: readonly string[]): void {
  if (state.signedIn) return;
  const drop = new Set(ids.map((x) => x.toLowerCase()));
  const next = readGuestFavorites().filter((x) => !drop.has(x));
  writeGuestFavorites(next);
  setState({ status: "ready", signedIn: false, userId: null, ids: new Set(next) });
}

// ── Hooks ─────────────────────────────────────────────────────────────────

export function useFavoritesState(): FavoritesState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useFavorite(listingId: string) {
  const snap = useFavoritesState();
  const [pending, startTransition] = useTransition();
  const toggle = useCallback(
    () =>
      new Promise<ToggleResult>((resolve) => {
        startTransition(async () => {
          resolve(await toggleFavoriteId(listingId));
        });
      }),
    [listingId]
  );
  return {
    saved: snap.ids.has(listingId.toLowerCase()),
    ready: snap.status === "ready",
    signedIn: snap.signedIn,
    pending,
    toggle,
  };
}

// ── Зочны анхны toast (хуудасны сешнд нэг удаа) ──────────────────────────
let guestToastShown = false;

export function maybeShowGuestSavedToast(router: { push: (href: string) => void }): void {
  if (guestToastShown) return;
  guestToastShown = true;
  toast.success("Энэ төхөөрөмж дээр хадгаллаа", {
    description: "Нэвтэрвэл бүх төхөөрөмжөөс харагдана.",
    action: { label: "Нэвтрэх", onClick: () => router.push(loginHref(currentPath())) },
  });
}
