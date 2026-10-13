"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { saveBranch, saveTeam, saveZone } from "@/lib/actions/crm-settings";
import type { BranchRow, TeamRow, ZoneRow } from "@/lib/queries-crm-core";

type BranchDraft = { id?: string; code: string; name: string; isActive: boolean };
type TeamDraft = { id?: string; branchId: string; name: string };
type ZoneDraft = {
  id?: string;
  district: string;
  khoroo: string;
  complex: string;
  branchId: string;
  rationale: string;
  isActive: boolean;
};

export function ZonesShell({
  branches,
  teams,
  zones,
  canEdit,
}: {
  branches: BranchRow[];
  teams: TeamRow[];
  zones: ZoneRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [branchDraft, setBranchDraft] = useState<BranchDraft | null>(null);
  const [teamDraft, setTeamDraft] = useState<TeamDraft | null>(null);
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, close: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {/* Салбарууд */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <p className="font-bold text-ink">Салбарууд</p>
            {canEdit ? (
              <Button size="sm" onClick={() => setBranchDraft({ code: "", name: "", isActive: true })}>
                <Plus className="size-4" /> Салбар нэмэх
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {branches.length === 0 ? <p className="text-sm text-subtle">Салбар бүртгэгдээгүй.</p> : null}
            {branches.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <span className="text-sm font-medium text-ink">{b.name}</span>
                <span className="font-mono text-xs text-subtle">{b.code}</span>
                {!b.is_active ? <Badge tone="neutral">Идэвхгүй</Badge> : null}
                {canEdit ? (
                  <button
                    type="button"
                    className="text-subtle transition hover:text-ink"
                    aria-label={`${b.name} засах`}
                    onClick={() => setBranchDraft({ id: b.id, code: b.code, name: b.name, isActive: b.is_active })}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Багууд */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <p className="font-bold text-ink">Багууд</p>
            {canEdit && branches.length > 0 ? (
              <Button size="sm" onClick={() => setTeamDraft({ branchId: branches[0].id, name: "" })}>
                <Plus className="size-4" /> Баг нэмэх
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {teams.length === 0 ? <p className="text-sm text-subtle">Баг бүртгэгдээгүй.</p> : null}
            {teams.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <span className="text-sm font-medium text-ink">{t.name}</span>
                <span className="text-xs text-subtle">{branchName(t.branch_id)}</span>
                {canEdit ? (
                  <button
                    type="button"
                    className="text-subtle transition hover:text-ink"
                    aria-label={`${t.name} засах`}
                    onClick={() => setTeamDraft({ id: t.id, branchId: t.branch_id, name: t.name })}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Бүсийн лавлах */}
      <Card>
        <CardBody className="p-0">
          <div className="flex items-center justify-between p-5 pb-3">
            <div>
              <p className="font-bold text-ink">Бүсийн лавлах (F-207)</p>
              <p className="text-xs text-subtle">Дүүрэг/хороо/хотхон → хариуцах салбар</p>
            </div>
            {canEdit && branches.length > 0 ? (
              <Button
                size="sm"
                onClick={() =>
                  setZoneDraft({ district: "", khoroo: "", complex: "", branchId: branches[0].id, rationale: "", isActive: true })
                }
              >
                <Plus className="size-4" /> Бүс нэмэх
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="px-5 py-2 font-medium">Дүүрэг</th>
                  <th className="px-5 py-2 font-medium">Хороо</th>
                  <th className="px-5 py-2 font-medium">Хотхон</th>
                  <th className="px-5 py-2 font-medium">Салбар</th>
                  <th className="px-5 py-2 font-medium">Төлөв</th>
                  {canEdit ? <th className="px-5 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {zones.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} className="px-5 py-6 text-center text-subtle">
                      Бүс бүртгэгдээгүй.
                    </td>
                  </tr>
                ) : null}
                {zones.map((zn) => (
                  <tr key={zn.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 font-medium text-ink">{zn.district}</td>
                    <td className="px-5 py-2.5 text-muted">{zn.khoroo ?? "—"}</td>
                    <td className="px-5 py-2.5 text-muted">{zn.complex ?? "—"}</td>
                    <td className="px-5 py-2.5">{branchName(zn.branch_id)}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={zn.is_active ? "green" : "neutral"}>{zn.is_active ? "Идэвхтэй" : "Идэвхгүй"}</Badge>
                    </td>
                    {canEdit ? (
                      <td className="px-5 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setZoneDraft({
                              id: zn.id,
                              district: zn.district,
                              khoroo: zn.khoroo ?? "",
                              complex: zn.complex ?? "",
                              branchId: zn.branch_id,
                              rationale: zn.rationale ?? "",
                              isActive: zn.is_active,
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

      {/* Салбарын модал */}
      <Modal
        open={branchDraft !== null}
        onClose={() => setBranchDraft(null)}
        title={branchDraft?.id ? "Салбар засах" : "Салбар нэмэх"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBranchDraft(null)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                branchDraft &&
                run(
                  () => saveBranch({ id: branchDraft.id, code: branchDraft.code, name: branchDraft.name, isActive: branchDraft.isActive }),
                  () => setBranchDraft(null)
                )
              }
            >
              Хадгалах
            </Button>
          </div>
        }
      >
        {branchDraft ? (
          <div className="space-y-3">
            <Field label="Код" hint="Латин жижиг үсэг, ж: central">
              <Input value={branchDraft.code} onChange={(e) => setBranchDraft({ ...branchDraft, code: e.target.value })} />
            </Field>
            <Field label="Нэр">
              <Input value={branchDraft.name} onChange={(e) => setBranchDraft({ ...branchDraft, name: e.target.value })} />
            </Field>
            <Field label="Төлөв">
              <Select
                value={branchDraft.isActive ? "yes" : "no"}
                onChange={(e) => setBranchDraft({ ...branchDraft, isActive: e.target.value === "yes" })}
              >
                <option value="yes">Идэвхтэй</option>
                <option value="no">Идэвхгүй</option>
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>

      {/* Багийн модал */}
      <Modal
        open={teamDraft !== null}
        onClose={() => setTeamDraft(null)}
        title={teamDraft?.id ? "Баг засах" : "Баг нэмэх"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTeamDraft(null)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                teamDraft &&
                run(
                  () => saveTeam({ id: teamDraft.id, branchId: teamDraft.branchId, name: teamDraft.name, leadProfileId: null }),
                  () => setTeamDraft(null)
                )
              }
            >
              Хадгалах
            </Button>
          </div>
        }
      >
        {teamDraft ? (
          <div className="space-y-3">
            <Field label="Нэр">
              <Input value={teamDraft.name} onChange={(e) => setTeamDraft({ ...teamDraft, name: e.target.value })} />
            </Field>
            <Field label="Салбар">
              <Select value={teamDraft.branchId} onChange={(e) => setTeamDraft({ ...teamDraft, branchId: e.target.value })}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>

      {/* Бүсийн модал */}
      <Modal
        open={zoneDraft !== null}
        onClose={() => setZoneDraft(null)}
        title={zoneDraft?.id ? "Бүс засах" : "Бүс нэмэх"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setZoneDraft(null)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                zoneDraft &&
                run(
                  () =>
                    saveZone({
                      id: zoneDraft.id,
                      district: zoneDraft.district,
                      khoroo: zoneDraft.khoroo || null,
                      complex: zoneDraft.complex || null,
                      branchId: zoneDraft.branchId,
                      rationale: zoneDraft.rationale || null,
                      isActive: zoneDraft.isActive,
                    }),
                  () => setZoneDraft(null)
                )
              }
            >
              Хадгалах
            </Button>
          </div>
        }
      >
        {zoneDraft ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дүүрэг">
                <Input value={zoneDraft.district} onChange={(e) => setZoneDraft({ ...zoneDraft, district: e.target.value })} />
              </Field>
              <Field label="Хороо">
                <Input value={zoneDraft.khoroo} onChange={(e) => setZoneDraft({ ...zoneDraft, khoroo: e.target.value })} />
              </Field>
            </div>
            <Field label="Хотхон/цогцолбор">
              <Input value={zoneDraft.complex} onChange={(e) => setZoneDraft({ ...zoneDraft, complex: e.target.value })} />
            </Field>
            <Field label="Хариуцах салбар">
              <Select value={zoneDraft.branchId} onChange={(e) => setZoneDraft({ ...zoneDraft, branchId: e.target.value })}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Үндэслэл">
              <Input value={zoneDraft.rationale} onChange={(e) => setZoneDraft({ ...zoneDraft, rationale: e.target.value })} />
            </Field>
            <Field label="Төлөв">
              <Select
                value={zoneDraft.isActive ? "yes" : "no"}
                onChange={(e) => setZoneDraft({ ...zoneDraft, isActive: e.target.value === "yes" })}
              >
                <option value="yes">Идэвхтэй</option>
                <option value="no">Идэвхгүй</option>
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
