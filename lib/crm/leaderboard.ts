/**
 * Тэргүүлэгчдийн самбар (R22) — зөвхөн шалгагдах үр дүнд оноо өгнө
 * (утга бүхий холболт, хийгдсэн үзлэг, бүртгэгдсэн үнийн санал, гэрээ,
 * хаалт). Шимтгэл, орлого гаргахгүй. Жин тохиргооноос ('leaderboard').
 */

export const LEADERBOARD_METRICS = ["meaningful_contact", "showing_done", "offer", "contract", "closed_won"] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export const LEADERBOARD_METRIC_LABEL: Record<LeaderboardMetric, string> = {
  meaningful_contact: "Утга бүхий холболт",
  showing_done: "Хийгдсэн үзлэг",
  offer: "Үнийн санал",
  contract: "Гэрээ",
  closed_won: "Хаалт",
};

export type LeaderboardSettings = {
  weights: Record<LeaderboardMetric, number>;
  tvRefreshSec: number;
  showZero: boolean;
};

export const DEFAULT_LEADERBOARD_SETTINGS: LeaderboardSettings = {
  weights: { meaningful_contact: 1, showing_done: 3, offer: 5, contract: 8, closed_won: 13 },
  tvRefreshSec: 120,
  showZero: false,
};

export function normalizeLeaderboardSettings(raw: unknown): LeaderboardSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const w = (r.weights && typeof r.weights === "object" ? r.weights : {}) as Record<string, unknown>;
  const weights = { ...DEFAULT_LEADERBOARD_SETTINGS.weights };
  for (const m of LEADERBOARD_METRICS) {
    const n = Number(w[m]);
    if (Number.isFinite(n) && n >= 0 && n <= 1000) weights[m] = n;
  }
  const refresh = Number(r.tv_refresh_sec);
  return {
    weights,
    tvRefreshSec: Number.isFinite(refresh) && refresh >= 30 && refresh <= 3600 ? Math.round(refresh) : DEFAULT_LEADERBOARD_SETTINGS.tvRefreshSec,
    showZero: r.show_zero === true,
  };
}

export type LeaderboardInput = {
  agent_id: string;
  agent_name: string;
  team_id: string | null;
  branch_id: string | null;
  meaningful_contacts: number;
  showings_done: number;
  offers: number;
  contracts: number;
  closed_won: number;
};

export type LeaderboardRow = {
  agentId: string;
  name: string;
  teamId: string | null;
  branchId: string | null;
  counts: Record<LeaderboardMetric, number>;
  points: number;
  rank: number;
};

export function rowCounts(r: LeaderboardInput): Record<LeaderboardMetric, number> {
  return {
    meaningful_contact: Number(r.meaningful_contacts) || 0,
    showing_done: Number(r.showings_done) || 0,
    offer: Number(r.offers) || 0,
    contract: Number(r.contracts) || 0,
    closed_won: Number(r.closed_won) || 0,
  };
}

export function leaderboardPoints(counts: Record<LeaderboardMetric, number>, weights: Record<LeaderboardMetric, number>): number {
  let p = 0;
  for (const m of LEADERBOARD_METRICS) p += (counts[m] ?? 0) * (weights[m] ?? 0);
  return Math.round(p * 10) / 10;
}

/** Онооны дагуу эрэмбэлнэ; тэнцвэл ижил байр (1, 2, 2, 4). */
export function rankLeaderboard(rows: LeaderboardInput[], s: LeaderboardSettings): LeaderboardRow[] {
  const scored = rows
    .map((r) => {
      const counts = rowCounts(r);
      return {
        agentId: r.agent_id,
        name: r.agent_name,
        teamId: r.team_id,
        branchId: r.branch_id,
        counts,
        points: leaderboardPoints(counts, s.weights),
        rank: 0,
      };
    })
    .filter((r) => s.showZero || r.points > 0)
    .sort((a, b) => b.points - a.points || b.counts.closed_won - a.counts.closed_won || a.name.localeCompare(b.name));
  let prev: number | null = null;
  let prevRank = 0;
  scored.forEach((r, i) => {
    r.rank = prev !== null && r.points === prev ? prevRank : i + 1;
    prev = r.points;
    prevRank = r.rank;
  });
  return scored;
}

const UB = 8 * 3600_000;

export type LeaderboardPeriod = "week" | "month";

/** УБ-ын энэ долоо хоног (Даваа–өнөөдөр) эсвэл энэ сар (1-нээс өнөөдөр). */
export function periodRange(period: LeaderboardPeriod, now: Date = new Date()): { from: string; to: string } {
  const ub = new Date(now.getTime() + UB);
  const to = ub.toISOString().slice(0, 10);
  if (period === "month") return { from: `${to.slice(0, 8)}01`, to };
  const dow = ub.getUTCDay() === 0 ? 7 : ub.getUTCDay();
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (dow - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}
