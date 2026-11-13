"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { saveBranch } from "@/lib/actions/crm-settings";
import type { BranchRow } from "@/lib/queries-crm-core";

type Draft = { id?: string; code: string; name: string; isActive: boolean };

/** Салбарын жагсаалт ба засах цонх (баг бүр нэг салбарт харьяалагдана). */
export function BranchesShell({ branches, canEdit }: { branches: BranchRow[]; canEdit: boolean }) {
  const fid = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  function open(next: Draft) {
    setError(null);
    setDraft(next);
  }

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await saveBranch(draft);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(draft.id ? "Салбарыг хадгаллаа" : "Салбар нэмэгдлээ");
      setDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <Card>
        <CardBody className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-ink">Салбарууд ({branches.length})</p>
            {canEdit ? (
              <Button size="touch" onClick={() => open({ code: "", name: "", isActive: true })}>
                <Plus className="size-4" aria-hidden /> Салбар нэмэх
              </Button>
            ) : null}
          </div>
          {branches.length === 0 ? (
            <p className="mt-3 text-sm text-subtle">Салбар бүртгэгдээгүй. Баг үүсгэхийн өмнө салбар нэмнэ үү.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {branches.map((b) => (
                <li key={b.id} className="flex min-h-12 items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-ink">{b.name}</p>
                    <p className="font-mono text-xs text-subtle">{b.code}</p>
                  </div>
                  {!b.is_active ? <Badge tone="neutral">Идэвхгүй</Badge> : null}
                  {canEdit ? (
                    <Button
                      size="touch"
                      variant="ghost"
                      aria-label={`${b.name} засах`}
                      onClick={() => open({ id: b.id, code: b.code, name: b.name, isActive: b.is_active })}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Салбар засах" : "Салбар нэмэх"}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Болих
            </Button>
            <Button disabled={pending} onClick={save}>
              Хадгалах
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="space-y-3">
            <Field label="Код" htmlFor={`${fid}-code`} hint="Латин жижиг үсэг, тоо (ж: central)">
              <Input id={`${fid}-code`} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
            </Field>
            <Field label="Нэр" htmlFor={`${fid}-name`}>
              <Input id={`${fid}-name`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Төлөв" htmlFor={`${fid}-active`}>
              <Select
                id={`${fid}-active`}
                value={draft.isActive ? "yes" : "no"}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.value === "yes" })}
              >
                <option value="yes">Идэвхтэй</option>
                <option value="no">Идэвхгүй</option>
              </Select>
            </Field>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
