"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { enrollTrack } from "@/lib/actions/crm-worklists";
import type { TrackTemplate } from "@/lib/queries-crm-worklists";
import { cn } from "@/lib/utils";

/**
 * Ажлын цуваа эхлүүлэх (R13): загвар сонгоход алхам бүр даалгавар болж
 * үүснэ. Харилцагч хариу өгөх (утга бүхий холболт), шат солигдох, бүртгэл
 * хаагдахад цуваа өөрөө зогсоно.
 */
export function TrackEnrollButton({
  templates,
  leadId,
  opportunityId,
  name,
  size = "sm",
  className,
}: {
  templates: TrackTemplate[];
  leadId?: string | null;
  opportunityId?: string | null;
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const target = leadId ? "lead" : "opportunity";
  const list = templates.filter((t) => t.target === "any" || t.target === target);
  if (!list.length || (!leadId && !opportunityId)) return null;

  function save() {
    if (!pick) return;
    start(async () => {
      const res = await enrollTrack({ templateId: pick, leadId: leadId ?? null, opportunityId: opportunityId ?? null });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const t = list.find((x) => x.id === pick);
      toast.success("Ажлын цуваа эхэллээ", { description: `${t?.steps.length ?? 0} алхам даалгавар болж товлогдлоо.` });
      setOpen(false);
      setPick(null);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-xl px-2.5 text-sm text-muted hover:bg-surface-2",
          size === "sm" ? "h-9" : "h-11",
          className
        )}
      >
        <Repeat className="size-4" /> Цуваа
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Ажлын цуваа — ${name}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <Button onClick={save} disabled={!pick || pending}>
              Эхлүүлэх
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-xs text-muted">
          Харилцагч хариу өгөх, шат солигдох эсвэл бүртгэл хаагдахад цуваа өөрөө зогсож, үлдсэн алхмууд хойшлогдоно.
        </p>
        <div className="grid gap-2">
          {list.map((t) => (
            <label
              key={t.id}
              className={cn(
                "cursor-pointer rounded-xl border p-3",
                pick === t.id ? "border-brand-400 bg-brand-50" : "border-line hover:bg-surface-2"
              )}
            >
              <input type="radio" name="track" className="sr-only" checked={pick === t.id} onChange={() => setPick(t.id)} />
              <span className="block text-sm font-semibold text-ink">{t.name}</span>
              {t.description ? <span className="block text-xs text-muted">{t.description}</span> : null}
              <ol className="mt-2 space-y-0.5 text-xs text-muted">
                {t.steps.map((s, i) => (
                  <li key={i}>
                    <span className="tabular-nums text-subtle">{s.day === 0 ? "Өнөөдөр" : `${s.day} дэх өдөр`}</span> — {s.title}
                  </li>
                ))}
              </ol>
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}
