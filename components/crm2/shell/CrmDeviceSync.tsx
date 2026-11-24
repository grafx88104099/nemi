"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudOff, FilePenLine, UploadCloud } from "lucide-react";

import { logUiEvent } from "@/lib/crm2/actions/events";
import { listDrafts, type DraftIndexEntry } from "@/lib/crm2/device/draft-store";
import { resumePendingSubmits, subscribePending } from "@/lib/crm2/device/network";
import { useOutbox } from "@/lib/crm2/device/outbox";
import { onSessionStart } from "@/lib/crm2/device/session-purge";
import { listOfflineCaptures, type OfflineCaptureSummary } from "@/lib/crm2/device/share-inbox";
import { startQueue, useQueueSummary } from "@/lib/crm2/device/upload-queue";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { cn } from "@/lib/utils";

import {
  deviceBadgeText,
  mergeLoggedKeys,
  parseLoggedKeys,
  recentDrafts,
  staleDraftsToLog,
  staleLogKey,
} from "./shell-model";

/**
 * CRM бүрхүүлийн төхөөрөмжийн давхарга (P5, R6/R7/R8): mount бүрт
 *   - onSessionStart (өөр хэрэглэгчийн өгөгдөл, хугацаа дууссаныг цэвэрлэх, 'crm2:last-profile'),
 *   - зургийн дараалал (startQueue) ба хүлээлгийн шуурхай илгээлт (resumePendingSubmits) — 'online' үед ч,
 *   - глобал тэмдэгт (дараалал + «Илгээгдсэн — анхаарах»),
 *   - «Дуусаагүй ноорог (N)» (12 цагаас доош) ба «Сүлжээгүй үед хадгалсан бүртгэл» баннер,
 *   - 24+ цаг илгээгдээгүй ноорогт draft_stale хэмжилт (нэг ноорогт нэг удаа).
 * Хувийн өгөгдөл (утас, нэр) энд огт уншихгүй, харуулахгүй.
 */
export function CrmDeviceSync({ panel, profileId }: { panel: Crm2Panel; profileId: string }) {
  const p = crm2Paths(panel);
  const pathname = usePathname() ?? "";
  const onNewScreen = pathname.startsWith(`${p.base}/staff/new`);
  const onIncomplete = pathname.startsWith(`${p.base}/staff/incomplete`);

  const [drafts, setDrafts] = React.useState<DraftIndexEntry[]>([]);
  const [captures, setCaptures] = React.useState<OfflineCaptureSummary[]>([]);
  const queue = useQueueSummary();
  const outbox = useOutbox(profileId);

  // Төхөөрөмжийн жагсаалтыг уншаад (async) дараа нь state-д — effect-ээс шууд setState хийхгүй.
  const refreshLocal = React.useCallback(() => {
    void readLocal(profileId).then(({ drafts: d, captures: c }) => {
      setDrafts(d);
      setCaptures(c);
      logStale(profileId, d);
    });
  }, [profileId]);

  // Сесс эхлэх: цэвэрлэгээний ДАРАА дараалал, хүлээлгийн илгээлт (өөр хэрэглэгчийнхийг илгээхгүй).
  React.useEffect(() => {
    let alive = true;
    const kick = () => {
      void startQueue(profileId).catch(() => {});
      void resumePendingSubmits(profileId)
        .catch(() => null)
        .finally(() => {
          if (alive) refreshLocal();
        });
    };
    void onSessionStart(profileId)
      .catch(() => {})
      .then(() => {
        if (!alive) return;
        kick();
        refreshLocal();
      });
    const onOnline = () => kick();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshLocal();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const unsub = subscribePending(() => {
      if (alive) refreshLocal();
    });
    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      unsub();
    };
  }, [profileId, refreshLocal]);

  // Хуудас солигдоход (ноорог хадгалагдсан/устсан байж болно) жагсаалтаа шинэчилнэ.
  React.useEffect(() => {
    refreshLocal();
  }, [pathname, refreshLocal]);

  const recent = recentDrafts(drafts);
  const badge = deviceBadgeText(queue, outbox.items.length);
  const showDrafts = !onNewScreen && recent.length > 0;
  const showCaptures = !onNewScreen && captures.length > 0;
  const showBadge = !!badge && !onIncomplete;
  if (!showDrafts && !showCaptures && !showBadge) return null;

  return (
    <div className="border-b border-line bg-surface-2/60">
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-2 px-4 py-2",
          panel === "agent" ? "mx-auto max-w-7xl md:px-6" : "md:px-6"
        )}
        role="status"
        aria-live="polite"
      >
        {showCaptures ? (
          <Link
            href={p.staffNew({ share: captures[0].id })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            <CloudOff className="size-4 shrink-0" aria-hidden />
            Сүлжээгүй үед хадгалсан бүртгэл{captures.length > 1 ? ` (${captures.length})` : ""}
          </Link>
        ) : null}
        {showDrafts ? (
          <Link
            href={p.staffNew({ draft: recent[0].clientKey })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-800 hover:bg-brand-100"
          >
            <FilePenLine className="size-4 shrink-0" aria-hidden />
            Дуусаагүй ноорог ({recent.length})
          </Link>
        ) : null}
        {showBadge ? (
          <Link
            href={p.staffIncomplete()}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium",
              queue.failed > 0 || outbox.items.length > 0
                ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                : "border-line bg-surface text-ink hover:bg-surface-2"
            )}
          >
            <UploadCloud className="size-4 shrink-0" aria-hidden />
            {badge}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

async function readLocal(profileId: string): Promise<{ drafts: DraftIndexEntry[]; captures: OfflineCaptureSummary[] }> {
  const [drafts, captures] = await Promise.all([
    listDrafts(profileId).catch(() => [] as DraftIndexEntry[]),
    listOfflineCaptures(profileId).catch(() => [] as OfflineCaptureSummary[]),
  ]);
  return { drafts, captures };
}

/** 24+ цаг илгээгдээгүй ноорогт draft_stale (тоо, хугацаа л — ноорогийн агуулгагүй). */
function logStale(profileId: string, drafts: DraftIndexEntry[]) {
  try {
    const key = staleLogKey(profileId);
    const logged = parseLoggedKeys(localStorage.getItem(key));
    const now = Date.now();
    const fresh = staleDraftsToLog(drafts, new Set(logged), now);
    if (!fresh.length) return;
    for (const d of fresh) {
      logUiEvent({
        event: "draft_stale",
        flow: "quick",
        meta: { age_h: Math.min(9_999, Math.floor((now - d.savedAt) / 3_600_000)), photos: Math.min(999, d.photoCount) },
      });
    }
    localStorage.setItem(key, JSON.stringify(mergeLoggedKeys(logged, fresh.map((d) => d.clientKey))));
  } catch {
    // хэмжилт хэзээ ч ажлыг саатуулахгүй
  }
}
