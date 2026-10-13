"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { saveLookup } from "@/lib/actions/crm-settings";
import { LOOKUP_KINDS, LOOKUP_KIND_LABEL, type LookupKind } from "@/lib/constants-crm";
import type { LookupRow } from "@/lib/queries-crm-core";

type Draft = {
  id?: string;
  kind: string;
  code: string;
  label: string;
  requiresNote: boolean;
  sortOrder: number;
  isActive: boolean;
};

export function LookupsShell({ lookups, canEdit }: { lookups: LookupRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const kinds = useMemo(() => {
    const set = new Set<string>(LOOKUP_KINDS);
    for (const l of lookups) set.add(l.kind);
    return [...set];
  }, [lookups]);
  const [kind, setKind] = useState<string>(kinds[0] ?? "lead_source");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = lookups.filter((l) => l.kind === kind);

  function submit() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await saveLookup(draft);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <Tabs
        items={kinds.map((k) => ({
          value: k,
          label: LOOKUP_KIND_LABEL[k as LookupKind] ?? k,
        }))}
        value={kind}
        onValueChange={setKind}
      />

      {canEdit ? (
        <Button
          size="sm"
          onClick={() =>
            setDraft({ kind, code: "", label: "", requiresNote: false, sortOrder: rows.length, isActive: true })
          }
        >
          <Plus className="size-4" /> Утга нэмэх
        </Button>
      ) : null}

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="px-5 py-2.5 font-medium">#</th>
                  <th className="px-5 py-2.5 font-medium">Код</th>
                  <th className="px-5 py-2.5 font-medium">Нэр</th>
                  <th className="px-5 py-2.5 font-medium">Шинж</th>
                  {canEdit ? <th className="px-5 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} className="px-5 py-6 text-center text-subtle">
                      Энэ лавлахад утга алга.
                    </td>
                  </tr>
                ) : null}
                {rows.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 text-subtle">{l.sort_order}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-muted">{l.code}</td>
                    <td className="px-5 py-2.5 font-medium text-ink">{l.label}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {l.requires_note ? <Badge tone="amber">Тайлбар заавал</Badge> : null}
                        {!l.is_active ? <Badge tone="neutral">Идэвхгүй</Badge> : null}
                      </div>
                    </td>
                    {canEdit ? (
                      <td className="px-5 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDraft({
                              id: l.id,
                              kind: l.kind,
                              code: l.code,
                              label: l.label,
                              requiresNote: l.requires_note,
                              sortOrder: l.sort_order,
                              isActive: l.is_active,
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Утга засах" : "Утга нэмэх"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Болих
            </Button>
            <Button onClick={submit} disabled={pending}>
              Хадгалах
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Код" hint="Латин жижиг үсэг, ж: facebook">
                <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
              </Field>
              <Field label="Нэр">
                <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дараалал">
                <Input
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                />
              </Field>
              <Field label="Тайлбар заавал (F-104)">
                <Select
                  value={draft.requiresNote ? "yes" : "no"}
                  onChange={(e) => setDraft({ ...draft, requiresNote: e.target.value === "yes" })}
                >
                  <option value="no">Үгүй</option>
                  <option value="yes">Тийм</option>
                </Select>
              </Field>
            </div>
            <Field label="Төлөв">
              <Select
                value={draft.isActive ? "yes" : "no"}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.value === "yes" })}
              >
                <option value="yes">Идэвхтэй</option>
                <option value="no">Идэвхгүй</option>
              </Select>
            </Field>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
