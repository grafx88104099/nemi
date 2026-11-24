import { crm2Client } from "@/lib/crm2/server";
import { getCrm2Context } from "@/lib/crm2/context";

/**
 * Шуурхай бүртгэлийн туршилтын хэмжүүр (P2) — зөвхөн менежер/тохиргоо удирдагчид (crm2_ui_events-ийн
 * RLS ч ингэж шүүнэ). Зөвхөн ТОО, хугацаа — хэн юу бичсэн, хувийн утга огт байхгүй.
 */

const METRIC_EVENTS = [
  "quick_save",
  "full_save",
  "draft_restore_offer",
  "draft_restored",
  "draft_restored_auto",
  "quick_offline_queued",
  "quick_sent_background",
  "owner_pending",
] as const;

const MAX_ROWS = 5000;

export type MetricEventRow = {
  event: string;
  profile_id: string;
  duration_ms: number | null;
  meta: unknown;
};

export type Crm2StaffMetrics = {
  since: string;
  days: number;
  /** Мөрийн дээд хязгаарт хүрсэн (тоо дутуу байж болно). */
  truncated: boolean;
  quick: { saves: number; medianOpenToSaveMs: number | null; medianFirstInputToSaveMs: number | null };
  full: { saves: number; medianOpenToSaveMs: number | null };
  /** Энэ хугацаанд үүссэн хөрөнгө, эх сурвалжаар (manual | paste | share | listing). */
  savesBySource: Record<string, number>;
  restore: { offers: number; used: number; auto: number };
  background: { queued: number; sent: number };
  /** Шуурхай хадгалалтын дараа эзэн шийдвэрлэгдээгүй (owner_pending) үлдсэн тоо ба хувь. */
  ownerPending: { count: number; rate: number | null };
};

/** Медиан (хоосон бол null). Цэвэр. */
export function median(values: readonly number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

function metaNumber(meta: unknown, key: string): number | null {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Үйл явдлын мөрүүдийг нэгтгэнэ (цэвэр — тестлэх боломжтой). */
export function aggregateStaffMetrics(
  rows: readonly MetricEventRow[],
  sources: Record<string, number>,
  opts: { since: string; days: number; truncated?: boolean }
): Crm2StaffMetrics {
  const count = (e: string) => rows.filter((r) => r.event === e).length;
  const quick = rows.filter((r) => r.event === "quick_save");
  const full = rows.filter((r) => r.event === "full_save");
  const quickSaves = quick.length;
  const pending = count("owner_pending");
  return {
    since: opts.since,
    days: opts.days,
    truncated: !!opts.truncated,
    quick: {
      saves: quickSaves,
      medianOpenToSaveMs: median(quick.map((r) => r.duration_ms).filter((n): n is number => n != null)),
      medianFirstInputToSaveMs: median(quick.map((r) => metaNumber(r.meta, "first_input_ms")).filter((n): n is number => n != null)),
    },
    full: {
      saves: full.length,
      medianOpenToSaveMs: median(full.map((r) => r.duration_ms).filter((n): n is number => n != null)),
    },
    savesBySource: sources,
    restore: { offers: count("draft_restore_offer"), used: count("draft_restored"), auto: count("draft_restored_auto") },
    background: { queued: count("quick_offline_queued"), sent: count("quick_sent_background") },
    ownerPending: { count: pending, rate: quickSaves > 0 ? Math.round((pending / quickSaves) * 1000) / 1000 : null },
  };
}

/**
 * Сүүлийн `days` хоногийн хэмжүүр. profileIds өгвөл зөвхөн тэдгээр агент (туршилтын бүлэг ↔ бусад).
 * Менежер биш бол null.
 */
export async function getStaffEntryMetrics(opts: { days?: number; profileIds?: string[] | null } = {}): Promise<Crm2StaffMetrics | null> {
  const ctx = await getCrm2Context();
  if (!ctx?.isMember || !(ctx.isManager || ctx.canManageSettings)) return null;
  const days = Math.min(Math.max(1, Math.floor(opts.days ?? 14)), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const ids = (opts.profileIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  const supabase = await crm2Client();

  let events = supabase
    .from("crm2_ui_events")
    .select("event, profile_id, duration_ms, meta")
    .gte("created_at", since)
    .in("event", [...METRIC_EVENTS])
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  let props = supabase.from("crm2_properties").select("source").gte("created_at", since).limit(MAX_ROWS);
  if (ids.length) {
    events = events.in("profile_id", ids);
    props = props.in("created_by", ids);
  }
  const [ev, pr] = await Promise.all([events, props]);
  if (ev.error) console.error("crm2 metrics events:", ev.error.message);
  if (pr.error) console.error("crm2 metrics sources:", pr.error.message);
  const sources: Record<string, number> = {};
  for (const p of pr.data ?? []) {
    const s = (p as { source?: string | null }).source ?? "manual";
    sources[s] = (sources[s] ?? 0) + 1;
  }
  const rows = (ev.data ?? []) as MetricEventRow[];
  return aggregateStaffMetrics(rows, sources, {
    since,
    days,
    truncated: rows.length >= MAX_ROWS || (pr.data?.length ?? 0) >= MAX_ROWS,
  });
}
