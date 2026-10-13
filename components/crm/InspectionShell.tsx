"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { createInspection } from "@/lib/actions/crm-leases";
import type { InspectionRow } from "@/lib/queries-crm-rentals";
import { INSPECTION_KIND_LABEL, type InspectionKind } from "@/lib/constants-crm";

/**
 * Орох/гарах үзлэг (F-575–579): move-in ↔ move-out талбар тус бүрээр
 * зэрэгцүүлсэн 2 баганат харьцуулалт, зөрүү highlight (F-576);
 * гарах үзлэгийн зөрүү → суутгалын үндэслэл + засварын хүсэлт автомат (F-577).
 */

type DraftItem = {
  room: string;
  item: string;
  condition: string;
  note: string;
  matchedItemId: string;
  discrepancy: boolean;
};

export function InspectionShell({
  leaseId,
  inspections,
  canWrite,
}: {
  leaseId: string;
  inspections: InspectionRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<InspectionKind>("move_in");
  const [inspectedOn, setInspectedOn] = useState(new Date().toISOString().slice(0, 10));
  const [confirmed, setConfirmed] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([
    { room: "", item: "", condition: "", note: "", matchedItemId: "", discrepancy: false },
  ]);

  const moveIn = inspections.find((i) => i.kind === "move_in") ?? null;
  const moveOut = inspections.find((i) => i.kind === "move_out") ?? null;

  /** Move-out мөрүүдийг move-in-тэй зэрэгцүүлэх (matched_item_id эсвэл нэрээр). */
  const comparison = useMemo(() => {
    if (!moveIn) return [];
    return moveIn.items.map((inItem) => {
      const outItem =
        moveOut?.items.find((o) => o.matched_item_id === inItem.id) ??
        moveOut?.items.find(
          (o) => o.item.trim().toLowerCase() === inItem.item.trim().toLowerCase() && (o.room ?? "") === (inItem.room ?? "")
        ) ??
        null;
      return { inItem, outItem };
    });
  }, [moveIn, moveOut]);

  function openModal(k: InspectionKind) {
    setKind(k);
    setError(null);
    if (k === "move_out" && moveIn) {
      // Move-in мөрүүдээс урьдчилан бөглөнө — талбар тус бүрээр зэрэгцүүлэлт (F-576).
      setItems(
        moveIn.items.map((it) => ({
          room: it.room ?? "",
          item: it.item,
          condition: "",
          note: "",
          matchedItemId: it.id,
          discrepancy: false,
        }))
      );
    } else {
      setItems([{ room: "", item: "", condition: "", note: "", matchedItemId: "", discrepancy: false }]);
    }
    setOpen(true);
  }

  function submit() {
    setError(null);
    const valid = items.filter((it) => it.item.trim() && it.condition.trim());
    if (!valid.length) {
      setError("Дор хаяж нэг мөр (эд хөрөнгө + нөхцөл) бүртгэнэ (F-575).");
      return;
    }
    startTransition(async () => {
      const res = await createInspection({
        leaseId,
        kind,
        inspectedOn,
        confirmedByTenant: confirmed,
        items: valid.map((it) => ({
          room: it.room || null,
          item: it.item,
          condition: it.condition,
          note: it.note || null,
          matchedItemId: it.matchedItemId || null,
          discrepancy: it.discrepancy,
        })),
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Орох/гарах үзлэг талбар тус бүрээр зэрэгцүүлэн харьцуулагдана; зөрүү нь барьцааны суутгалын
          үндэслэл болно (F-576/577).
        </p>
        {canWrite && (
          <div className="flex gap-2">
            {!moveIn && (
              <Button size="sm" onClick={() => openModal("move_in")}>
                <Plus className="size-4" /> Орох үзлэг
              </Button>
            )}
            {moveIn && !moveOut && (
              <Button size="sm" onClick={() => openModal("move_out")}>
                <Plus className="size-4" /> Гарах үзлэг
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => openModal("periodic")}>
              <Plus className="size-4" /> Ээлжит үзлэг
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Зэрэгцүүлсэн харьцуулалт (F-576) */}
      {moveIn && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Өрөө / Эд хөрөнгө</th>
                <th className="px-4 py-3 font-medium">
                  Орох үзлэг ({moveIn.inspected_on})
                  {moveIn.confirmed_by_tenant && <Badge tone="green" className="ml-2">Түрээслэгч баталсан</Badge>}
                </th>
                <th className="px-4 py-3 font-medium">
                  Гарах үзлэг {moveOut ? `(${moveOut.inspected_on})` : "(хийгдээгүй)"}
                </th>
                <th className="px-4 py-3 font-medium">Зөрүү</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {comparison.map(({ inItem, outItem }) => {
                const diff = outItem?.discrepancy ?? false;
                return (
                  <tr key={inItem.id} className={diff ? "bg-rose-50/50" : "hover:bg-surface-2"}>
                    <td className="px-4 py-3 text-ink">
                      {inItem.room ? `${inItem.room} — ` : ""}
                      {inItem.item}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {inItem.condition}
                      {inItem.note ? ` · ${inItem.note}` : ""}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {outItem ? `${outItem.condition}${outItem.note ? ` · ${outItem.note}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {diff ? (
                        <span className="flex items-center gap-1 text-rose-600">
                          <TriangleAlert className="size-4" /> Зөрүүтэй
                        </span>
                      ) : outItem ? (
                        <span className="text-emerald-600">Хэвийн</span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Бусад үзлэгүүд (ээлжит) */}
      {inspections
        .filter((i) => i.kind === "periodic")
        .map((insp) => (
          <Card key={insp.id}>
            <CardBody>
              <p className="mb-2 text-sm font-semibold text-ink">
                {INSPECTION_KIND_LABEL[insp.kind]} — {insp.inspected_on}
              </p>
              <ul className="space-y-1 text-sm text-muted">
                {insp.items.map((it) => (
                  <li key={it.id}>
                    {it.room ? `${it.room} — ` : ""}
                    {it.item}: {it.condition}
                    {it.note ? ` · ${it.note}` : ""}
                    {it.discrepancy && <span className="ml-1 text-rose-600">(зөрүүтэй)</span>}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}

      {inspections.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          Үзлэг бүртгэгдээгүй. Орох үзлэг + хүлээлцэх бүрэн болтол зураг/гэрээ хариуцсан агентын урамшууллын
          эрх нээгдэхгүй (F-579).
        </p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${INSPECTION_KIND_LABEL[kind]} бүртгэх (F-575)`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Болих
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Хадгалж байна…" : "Хадгалах"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Огноо">
              <Input type="date" value={inspectedOn} onChange={(e) => setInspectedOn(e.target.value)} />
            </Field>
            <Field label="Түрээслэгч баталгаажуулсан">
              <Select value={String(confirmed)} onChange={(e) => setConfirmed(e.target.value === "true")}>
                <option value="false">Үгүй</option>
                <option value="true">Тийм</option>
              </Select>
            </Field>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-xl border border-line p-2">
                <Input
                  className="col-span-2"
                  placeholder="Өрөө"
                  value={it.room}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, room: e.target.value } : x)))}
                />
                <Input
                  className="col-span-3"
                  placeholder="Эд хөрөнгө"
                  value={it.item}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))}
                />
                <Input
                  className="col-span-3"
                  placeholder="Нөхцөл"
                  value={it.condition}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, condition: e.target.value } : x)))}
                />
                <Input
                  className="col-span-3"
                  placeholder="Тэмдэглэл"
                  value={it.note}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                />
                {kind === "move_out" ? (
                  <label className="col-span-1 flex items-center justify-center gap-1 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={it.discrepancy}
                      onChange={(e) =>
                        setItems(items.map((x, j) => (j === i ? { ...x, discrepancy: e.target.checked } : x)))
                      }
                    />
                    Зөрүү
                  </label>
                ) : (
                  <span className="col-span-1" />
                )}
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setItems([...items, { room: "", item: "", condition: "", note: "", matchedItemId: "", discrepancy: false }])
            }
          >
            <Plus className="size-4" /> Мөр нэмэх
          </Button>
          {kind === "move_out" && (
            <p className="text-xs text-muted">
              Зөрүүтэй мөр бүрд засварын хүсэлт автомат үүсч (F-577), тэдгээр мөр суутгалын нотолгоо болно
              (F-542).
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
