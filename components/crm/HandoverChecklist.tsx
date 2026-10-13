"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toggleHandoverItem, addHandoverItem } from "@/lib/actions/crm-transactions";
import type { TxnHandoverItem } from "@/lib/queries-crm-transactions";

/**
 * Хүлээлцэх checklist (F-407) — «Гэрээ» шатанд загвараас автомат үүснэ (Д-08);
 * алхам бүр огноо + хариуцагчтай. Hold үед баталгаажуулалт DB-д түгжигдэнэ (§7.5-5).
 */
export function HandoverChecklist({
  txnId,
  items,
  editable,
  onHold,
}: {
  txnId: string;
  items: TxnHandoverItem[];
  editable: boolean;
  onHold: boolean;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const doneCount = items.filter((i) => i.done).length;

  function toggle(item: TxnHandoverItem) {
    setError(null);
    startTransition(async () => {
      const res = await toggleHandoverItem(item.id, txnId, !item.done);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      router.refresh();
    });
  }

  function add() {
    if (!label.trim()) return;
    startTransition(async () => {
      const res = await addHandoverItem(txnId, label);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setLabel("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink">Хүлээлцэх алхмууд</span>
        <span className="text-muted">
          {doneCount}/{items.length}
        </span>
      </div>
      {onHold && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
          МУТСТ түгжээтэй — хүлээлцэх баталгаажуулалт хориглогдсон (§7.5).
        </p>
      )}
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          Checklist хоосон — «Гэрээ» төлөвт орох үед загвараас автомат үүснэ (Д-08).
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                checked={item.done}
                disabled={!editable || pending || (onHold && !item.done)}
                onChange={() => toggle(item)}
                className="size-4 rounded border-line"
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${item.done ? "text-muted line-through" : "text-ink"}`}>
                  {item.label}
                </p>
                {item.done && item.done_on && (
                  <p className="text-xs text-subtle">{item.done_on}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="flex items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Шинэ алхам…"
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Button variant="outline" size="sm" onClick={add} disabled={pending || !label.trim()}>
            <Plus className="size-4" />
            Нэмэх
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
