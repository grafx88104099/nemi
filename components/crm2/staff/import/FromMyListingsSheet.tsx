"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ImageOff, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BottomSheet, useMediaQuery } from "@/components/crm2/ui/bottom-sheet";
import { DuplicateNotice } from "@/components/crm2/staff/duplicates/DuplicateNotice";
import { logUiEvent } from "@/lib/crm2/actions/events";
import { importListing, listImportableListings } from "@/lib/crm2/actions/import-listing";
import { newId } from "@/lib/crm2/device/draft-store";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { ImportableListing } from "@/lib/crm2/queries/import";
import type { Crm2PropertyDuplicate } from "@/lib/crm2/types";
import { fmtMNT } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  IMPORTED_TAG,
  MAX_IMPORT_BATCH,
  progressText,
  pruneSelection,
  resultLine,
  summarizeImport,
  toggleSelection,
  type ImportRunResult,
} from "./import-model";

const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * «Миний зараас үүсгэх» (P12). Утсанд нэг зар сонгоно, ширээнд олныг. Дараалан (нэг нэгээр) импортлож
 * явцыг харуулна; үр дүнд давхардлын анхааруулга (DuplicateNotice). Зар ХУУЛАГДАНА — холбогдохгүй
 * (холболт зөвхөн нийтлэх үед), зар өөрөө өөрчлөгдөхгүй. Авсан талбарууд «зараас, шалгана уу».
 */
export function FromMyListingsSheet({
  open,
  onClose,
  panel,
  initialListingId,
}: {
  open: boolean;
  onClose: () => void;
  panel: Crm2Panel;
  /** Урьдчилан сонгох зар (зарын хуудасны «Staff-д бүртгэх»). */
  initialListingId?: string | null;
}) {
  const p = crm2Paths(panel);
  const router = useRouter();
  const multi = useMediaQuery(DESKTOP_QUERY);
  const [listings, setListings] = React.useState<ImportableListing[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [running, setRunning] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [results, setResults] = React.useState<ImportRunResult[]>([]);
  const loadSeq = React.useRef(0);

  const load = React.useCallback(async () => {
    const seq = ++loadSeq.current;
    const res = await listImportableListings().catch(() => null);
    if (seq !== loadSeq.current) return;
    setLoadError(null);
    if (!res || !res.ok) {
      setLoadError(res && !res.ok ? res.error : "Зарын жагсаалтыг уншиж чадсангүй. Дахин оролдоно уу.");
      setListings((prev) => prev ?? []);
      return;
    }
    setListings(res.data);
    setSelected((prev) => {
      const base = prev.length ? prev : initialListingId ? [initialListingId] : [];
      return pruneSelection(base, res.data);
    });
  }, [initialListingId]);

  // Нээгдэх бүрт шинээр уншина (өмнө нь импортолсон зар жагсаалтаас гарна).
  const [prevOpen, setPrevOpen] = React.useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && !running) {
      setResults([]);
      setDone(0);
      setTotal(0);
    }
  }
  React.useEffect(() => {
    if (!open) return;
    // Уншилт async — state зөвхөн хариу ирсний дараа шинэчлэгдэнэ.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [open, load]);

  // Утсанд шилжвэл (ширээнээс) нэгээс олон сонголтыг нэг болгоно.
  const shownSelected = multi ? selected : selected.slice(0, 1);

  async function run() {
    const ids = shownSelected.slice(0, MAX_IMPORT_BATCH);
    if (!ids.length || running) return;
    const byId = new Map((listings ?? []).map((l) => [l.id, l]));
    setRunning(true);
    setResults([]);
    setTotal(ids.length);
    setDone(0);
    const out: ImportRunResult[] = [];
    for (const [i, id] of ids.entries()) {
      const title = byId.get(id)?.title ?? "Зар";
      let r: ImportRunResult;
      try {
        const res = await importListing(id, newId());
        r = res.ok ? { listingId: id, title, ok: true, outcome: res.data } : { listingId: id, title, ok: false, error: res.error };
      } catch {
        r = { listingId: id, title, ok: false, error: "Сүлжээ тасарлаа — дахин оролдоно уу." };
      }
      out.push(r);
      setResults([...out]);
      setDone(i + 1);
      if (r.ok) {
        logUiEvent({
          event: "import_listing",
          flow: "import",
          property_id: r.outcome.propertyId ?? undefined,
          meta: {
            photos: Math.min(999, r.outcome.photosCopied),
            photos_failed: Math.min(999, r.outcome.photosFailed),
            dups: Math.min(99, r.outcome.duplicates.length),
            existing: r.outcome.existing,
          },
        });
      }
    }
    setRunning(false);
    setSelected([]);
    void load();
    router.refresh();
  }

  const summary = summarizeImport(results);
  const finished = !running && results.length > 0;

  const footer = finished ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" className="h-12 sm:h-11" onClick={() => setResults([])}>
        Өөр зар сонгох
      </Button>
      <Button type="button" className="h-12 sm:h-11" onClick={onClose}>
        Болсон
      </Button>
    </div>
  ) : (
    <Button type="button" className="h-12 w-full" disabled={running || shownSelected.length === 0} onClick={() => void run()}>
      {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {running
        ? progressText(done, total)
        : shownSelected.length > 1
          ? `Staff-д ноорог үүсгэх (${shownSelected.length})`
          : "Staff-д ноорог үүсгэх"}
    </Button>
  );

  return (
    <BottomSheet open={open} onClose={() => !running && onClose()} title="Миний зараас Staff-д бүртгэх" footer={footer}>
      <p className="text-sm text-muted">
        Зарын мэдээлэл, зургийг шинэ ноорог руу <span className="font-medium text-ink">хуулна</span> — зар өөрөө хэвээр
        үлдэнэ, засах боломжтой. Холболт зөвхөн нийтлэх үед. Авсан талбарууд «{IMPORTED_TAG}» гэж тэмдэглэгдэнэ.
      </p>

      <p className="sr-only" aria-live="polite">
        {running ? progressText(done, total) : finished ? `Дууслаа: ${summary.created} шинэ, ${summary.failed} алдаатай` : ""}
      </p>

      {results.length > 0 ? (
        <section aria-label="Үр дүн" className="mt-3 space-y-3">
          {running ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round((done / Math.max(1, total)) * 100)}%` }} />
            </div>
          ) : null}
          <ul className="space-y-3">
            {results.map((r) => (
              <ResultRow key={r.listingId} r={r} p={p} />
            ))}
          </ul>
          {finished && summary.created + summary.existing > 0 ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Талбар бүрийг картаас шалгаж «Зөв» дарна уу — баталгаажаагүй утгатай хөрөнгийг нийтлэхгүй.
            </p>
          ) : null}
        </section>
      ) : listings === null ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Зарууд уншиж байна…
        </p>
      ) : (
        <>
          {loadError ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">
              <span>{loadError}</span>
              <Button type="button" variant="ghost" size="touch" onClick={() => void load()}>
                <RefreshCw className="size-4" aria-hidden /> Дахин
              </Button>
            </div>
          ) : null}
          {listings.length === 0 && !loadError ? (
            <p className="mt-6 text-sm text-muted">
              Staff-д бүртгээгүй идэвхтэй зар алга. Зарагдсан/түрээслэгдсэн болон аль хэдийн хуулсан зар энд харагдахгүй.
            </p>
          ) : (
            <>
              <p className="mt-3 text-xs text-muted">
                {multi ? `Олныг сонгож болно (≤${MAX_IMPORT_BATCH}).` : "Нэг зар сонгоно уу."}
              </p>
              <ul className="mt-2 space-y-2" role={multi ? "group" : "radiogroup"} aria-label="Миний зарууд">
                {listings.map((l) => {
                  const on = shownSelected.includes(l.id);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        role={multi ? "checkbox" : "radio"}
                        aria-checked={on}
                        disabled={running}
                        onClick={() => setSelected((s) => toggleSelection(multi ? s : s.slice(0, 1), l.id, multi))}
                        className={cn(
                          "flex min-h-16 w-full items-center gap-3 rounded-xl border p-2 text-left transition",
                          on ? "border-brand-400 bg-brand-50" : "border-line bg-surface hover:bg-surface-2"
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center border-2",
                            multi ? "rounded-md" : "rounded-full",
                            on ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong"
                          )}
                        >
                          {on ? <Check className="size-4" /> : null}
                        </span>
                        {l.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- нийтийн зарын жижиг зураг (сервер татахгүй)
                          <img src={l.photo} alt="" className="size-12 shrink-0 rounded-lg object-cover" loading="lazy" />
                        ) : (
                          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
                            <ImageOff className="size-5" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-medium text-ink">{l.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {[
                              l.district,
                              l.rooms != null ? `${l.rooms} өрөө` : null,
                              l.area != null ? `${l.area} м²` : null,
                              l.price ? fmtMNT(l.price) : null,
                              l.agentName && multi ? l.agentName : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}

function ResultRow({ r, p }: { r: ImportRunResult; p: ReturnType<typeof crm2Paths> }) {
  const propertyId = r.ok ? r.outcome.propertyId : null;
  const dups = r.ok ? (r.outcome.duplicates as Crm2PropertyDuplicate[]) : [];
  return (
    <li className={cn("rounded-xl border p-3", r.ok ? "border-line bg-surface" : "border-rose-200 bg-rose-50")}>
      <p className="line-clamp-1 text-sm font-medium text-ink">{r.title}</p>
      <p className={cn("mt-0.5 text-sm", r.ok ? "text-muted" : "text-rose-800")}>{resultLine(r)}</p>
      {propertyId ? (
        <Link
          href={p.property(propertyId, undefined, { sheet: "checklist" })}
          className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-100"
        >
          Карт руу — шалгах
        </Link>
      ) : null}
      {propertyId && dups.length ? (
        <div className="mt-2">
          <DuplicateNotice propertyId={propertyId} duplicates={dups} />
        </div>
      ) : null}
    </li>
  );
}
