"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share2, Check, Loader2 } from "lucide-react";

import { getShareTargets, setListingShares, type ShareAgent } from "@/lib/actions/listing-shares";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/** Зарын мөрд гарах «Хуваалцах» товч + модал. sharedCount нь анхны тоо. */
export function ShareListingButton({
  listingId,
  sharedCount,
}: {
  listingId: string;
  sharedCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<ShareAgent[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  async function openModal() {
    setOpen(true);
    setLoading(true);
    setErr(null);
    const res = await getShareTargets(listingId);
    if (res.error) setErr(res.error);
    setAgents(res.agents);
    setPicked(new Set(res.agents.filter((a) => a.shared).map((a) => a.id)));
    setLoading(false);
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    startSave(async () => {
      const res = await setListingShares(listingId, [...picked]);
      if (!res.ok) {
        setErr(res.error ?? "Хадгалахад алдаа гарлаа.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={openModal}
        aria-label={sharedCount > 0 ? `${sharedCount} агенттай хуваалцсан — засах` : "Зар хуваалцах"}
        className={cn(
          "relative rounded-lg p-2 hover:bg-surface-2",
          sharedCount > 0 ? "text-brand-600" : "text-muted hover:text-ink"
        )}
        title={sharedCount > 0 ? `${sharedCount} агенттай хуваалцсан` : "Хуваалцах"}
      >
        <Share2 className="size-4" />
        {sharedCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
            {sharedCount}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        closeOnBackdrop={!saving}
        title="Оффисын агентуудтай хуваалцах"
        footer={
          <div className="flex items-center justify-between gap-3 border-t border-line p-4">
            <span className="text-xs text-muted">{picked.size} сонгосон</span>
            <div className="flex gap-2">
              <button
                onClick={() => !saving && setOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2"
              >
                Болих
              </button>
              <button
                onClick={save}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Хадгалах
              </button>
            </div>
          </div>
        }
      >
        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Ачаалж байна…
            </div>
          ) : err ? (
            <p className="px-3 py-8 text-center text-sm text-danger">{err}</p>
          ) : agents.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">
              Оффист хуваалцах өөр идэвхтэй агент алга.
            </p>
          ) : (
            <ul className="space-y-1">
              {agents.map((a) => {
                const on = picked.has(a.id);
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => toggle(a.id)}
                      role="checkbox"
                      aria-checked={on}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2"
                    >
                      <Avatar
                        initials={a.display_name.slice(0, 2)}
                        src={a.avatar_url}
                        color={a.color ?? undefined}
                        size="sm"
                      />
                      <span className="flex-1 text-sm font-medium text-ink">{a.display_name}</span>
                      <span
                        className={cn(
                          "grid size-5 place-items-center rounded-md border",
                          on ? "border-brand-600 bg-brand-600 text-white" : "border-line"
                        )}
                      >
                        {on && <Check className="size-3.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
