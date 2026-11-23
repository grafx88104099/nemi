/** R10 — сувгийн статистикийн цэвэр нэгтгэл (listing_channel_stats мөрүүдээс). */
import type { ChannelStatRow, Counts } from "./types";

export const ZERO_COUNTS: Counts = Object.freeze({ views: 0, chats: 0, viewings: 0 }) as Counts;

const PRIMARY = ["facebook", "viber", "unegui"];

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function add(a: Counts, r: ChannelStatRow): Counts {
  return {
    views: a.views + num(r.views),
    chats: a.chats + num(r.chats),
    viewings: a.viewings + num(r.viewing_requests),
  };
}

/** facebook, viber, unegui → бусад эх сурвалж (цагаан толгойгоор) → direct сүүлд. */
export function channelRank(ch: string): [number, string] {
  const i = PRIMARY.indexOf(ch);
  if (i >= 0) return [i, ""];
  if (ch === "direct") return [9, ""];
  return [5, ch];
}

function compareChannels(a: string, b: string): number {
  const [ra, sa] = channelRank(a);
  const [rb, sb] = channelRank(b);
  return ra - rb || sa.localeCompare(sb);
}

export type ChannelSummary = { channel: string } & Counts;

export function summarizeByChannel(rows: ChannelStatRow[]): ChannelSummary[] {
  const map = new Map<string, Counts>();
  for (const r of rows) map.set(r.channel, add(map.get(r.channel) ?? { ...ZERO_COUNTS }, r));
  return [...map.entries()]
    .sort(([a], [b]) => compareChannels(a, b))
    .map(([channel, c]) => ({ channel, ...c }));
}

/** Record<суваг, Counts>-ийг дараалсан жагсаалт болгоно (ShareKit-ийн stats). */
export function channelsFromRecord(stats: Record<string, Counts>): ChannelSummary[] {
  return Object.keys(stats)
    .sort(compareChannels)
    .map((channel) => ({ channel, ...stats[channel] }));
}

export type ListingSummary = Counts & { byChannel: Record<string, Counts> };

export function summarizeByListing(rows: ChannelStatRow[]): Record<string, ListingSummary> {
  const out: Record<string, ListingSummary> = {};
  for (const r of rows) {
    const cur = out[r.listing_id] ?? { ...ZERO_COUNTS, byChannel: {} };
    const totals = add(cur, r);
    cur.views = totals.views;
    cur.chats = totals.chats;
    cur.viewings = totals.viewings;
    cur.byChannel[r.channel] = add(cur.byChannel[r.channel] ?? { ...ZERO_COUNTS }, r);
    out[r.listing_id] = cur;
  }
  return out;
}

/** Үзэлтээр, дараа нь чатаар буурахаар; эхний n. */
export function topListings(rows: ChannelStatRow[], n = 5): ({ listingId: string } & Counts)[] {
  return Object.entries(summarizeByListing(rows))
    .map(([listingId, s]) => ({ listingId, views: s.views, chats: s.chats, viewings: s.viewings }))
    .sort((a, b) => b.views - a.views || b.chats - a.chats || b.viewings - a.viewings)
    .slice(0, Math.max(0, n));
}

export function formatCountsLine(c: Counts): string {
  return `${c.views} үзэлт · ${c.chats} чат · ${c.viewings} үзлэг`;
}

export function formatCountsCompact(c: Counts): string {
  return `${c.views} · ${c.chats} · ${c.viewings}`;
}
