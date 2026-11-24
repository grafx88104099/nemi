/**
 * «Илгээгдсэн — анхаарах» (R6): ард нь илгээгдсэн шуурхай бүртгэлийн үр дүн
 * анхаарал шаардвал (эзний төлөв эцсийн биш, давхардал, эсвэл буцаагдсан) энд үлдэнэ.
 * IndexedDB «nemi-crm2»/«outbox», түлхүүр = clientKey. Хувийн өгөгдөл (утас, нэр)
 * хадгалахгүй — зөвхөн код, төлөв, тоо.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { crm2Kv } from "@/lib/crm2/device/vault";

export type OutboxEntry = {
  /** = clientKey */
  id: string;
  clientKey: string;
  profileId: string;
  propertyId: string | null;
  code: string | null;
  ownerStatus: string | null;
  duplicateCount: number;
  /** Сервер буцаасан бол (засварлах шаардлагатай) — нийтийн алдааны текст. */
  error?: string | null;
  field?: string | null;
  at: number;
};

/** Ард илгээлт анхаарал шаардах эсэх. */
export function needsAttention(e: { ownerStatus: string | null; duplicateCount: number; error?: string | null }, finalStatuses: readonly string[]): boolean {
  if (e.error) return true;
  if (e.duplicateCount > 0) return true;
  return !!e.ownerStatus && !finalStatuses.includes(e.ownerStatus);
}

let entries: OutboxEntry[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const kv = () => crm2Kv("outbox");

function ensureLoaded(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      const rows = (await kv().entries<OutboxEntry>()).map(([, v]) => v).filter(Boolean);
      entries = rows.sort((a, b) => b.at - a.at);
      emit();
    })();
    loaded.catch(() => {
      loaded = null;
    });
  }
  return loaded;
}

export async function addOutbox(entry: Omit<OutboxEntry, "id" | "at"> & { at?: number }): Promise<OutboxEntry> {
  await ensureLoaded();
  const e: OutboxEntry = { ...entry, id: entry.clientKey, at: entry.at ?? Date.now() };
  await kv().set(e.id, e);
  entries = [e, ...entries.filter((x) => x.id !== e.id)];
  emit();
  return e;
}

export async function dismiss(id: string): Promise<void> {
  await ensureLoaded();
  await kv().del(id);
  entries = entries.filter((x) => x.id !== id);
  emit();
}

export async function listOutbox(profileId: string): Promise<OutboxEntry[]> {
  await ensureLoaded();
  return entries.filter((e) => e.profileId === profileId);
}

async function dropWhere(match: (e: OutboxEntry) => boolean): Promise<number> {
  await ensureLoaded();
  const dead = entries.filter(match);
  await kv().delMany(dead.map((e) => e.id));
  entries = entries.filter((e) => !dead.includes(e));
  emit();
  return dead.length;
}

export const clearOutboxForUser = (profileId: string) => dropWhere((e) => e.profileId === profileId);
export const purgeOutboxForOthers = (profileId: string) => dropWhere((e) => e.profileId !== profileId);

/** Зөвхөн тестэд. */
export function resetOutboxForTests(): void {
  entries = [];
  loaded = null;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const snap = () => entries;
const EMPTY: OutboxEntry[] = [];
const serverSnap = () => EMPTY;

export function useOutbox(profileId: string | null): { items: OutboxEntry[]; dismiss: (id: string) => Promise<void> } {
  const all = useSyncExternalStore(subscribe, snap, serverSnap);
  useEffect(() => {
    void ensureLoaded();
  }, []);
  const items = useMemo(() => (profileId ? all.filter((e) => e.profileId === profileId) : EMPTY), [all, profileId]);
  const onDismiss = useCallback((id: string) => dismiss(id), []);
  return { items, dismiss: onDismiss };
}
