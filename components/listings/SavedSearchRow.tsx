"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Bell, BellOff, Search } from "lucide-react";

import { deleteSavedSearch, toggleSearchAlert } from "@/lib/actions/saved-searches";
import { savedSearchHref } from "@/lib/hub";
import { Button } from "@/components/ui/button";

// Энэ табын сессэд нээсэн хайлтууд — Back-аар кэшлэгдсэн RSC сэргэхэд хуучин
// «N шинэ» тэмдэг дахин гарахаас сэргийлнэ.
const SEEN_KEY = "nemi:ss-seen";
const SEEN_EVENT = "nemi:ss-seen";

function readSeen(): string[] {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function addSeen(id: string) {
  try {
    const cur = readSeen();
    if (!cur.includes(id)) sessionStorage.setItem(SEEN_KEY, JSON.stringify([...cur, id].slice(-100)));
  } catch {
    // sessionStorage хаалттай (private горим г.м.) — тэмдэг серверийн тоогоор л.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

function subscribeSeen(cb: () => void) {
  window.addEventListener(SEEN_EVENT, cb);
  return () => window.removeEventListener(SEEN_EVENT, cb);
}

export function SavedSearchRow({
  id,
  name,
  filters,
  alertEnabled,
  newCount,
}: {
  id: string;
  name: string;
  filters: Record<string, string>;
  alertEnabled: boolean;
  /** «Миний Нэми»: сүүлд нээснээс хойш нэмэгдсэн тохирох зарын тоо. */
  newCount?: number;
}) {
  const [alert, setAlert] = useState(alertEnabled);
  // Устгах нь буцаагдахгүй — гар утсанд зэргэлдээ товч алдаж дарахаас сэргийлж 2 алхамтай.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const seen = useSyncExternalStore(
    subscribeSeen,
    () => readSeen().includes(id),
    () => false
  );
  const showNew = !!newCount && newCount > 0 && !seen;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
      <Search className="size-4 shrink-0 text-muted" aria-hidden />
      <Link
        href={savedSearchHref(id, filters)}
        prefetch={false}
        onClick={() => addSeen(id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-ink hover:underline"
      >
        <span className="truncate">{name}</span>
        {showNew ? (
          <span className="shrink-0 rounded-full bg-brand-50 px-2 text-xs font-bold text-brand-700">
            {newCount} шинэ
          </span>
        ) : null}
      </Link>
      {confirmDelete ? (
        <div role="group" aria-label={`«${name}» хайлтыг устгах уу?`} className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="touch"
            variant="danger"
            autoFocus
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteSavedSearch(id);
                router.refresh();
              })
            }
          >
            Устгах
          </Button>
          <Button type="button" size="touch" variant="ghost" disabled={pending} onClick={() => setConfirmDelete(false)}>
            Болих
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const r = await toggleSearchAlert(id, !alert);
                if (r.ok) setAlert(!alert);
              })
            }
            aria-pressed={alert}
            aria-label={`«${name}» — шинэ зарын сэрэмжлүүлэг`}
            title={alert ? "Сэрэмжлүүлэг асаалттай" : "Сэрэмжлүүлэг унтраалттай"}
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg sm:size-9 ${alert ? "text-brand-600" : "text-muted hover:text-ink"}`}
          >
            {alert ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`«${name}» хайлтыг устгах`}
            title="Устгах"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600 sm:size-9"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
