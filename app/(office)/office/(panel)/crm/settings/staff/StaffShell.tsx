"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, UserMinus, LogOut, Plane } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { handoverForLeave, returnFromLeave, setStaffLeave } from "@/lib/actions/crm-ownership";
import { isOnLeave } from "@/lib/validation/crm-ownership";
import { upsertStaff, startOffboarding, deactivateStaff, reactivateStaff } from "@/lib/actions/crm-staff";
import { CRM_ROLES, CRM_ROLE_LABEL, type CrmRole } from "@/lib/constants-crm";
import type { BranchRow, StaffRow, TeamRow } from "@/lib/queries-crm-core";
import type { AssigneeOption } from "@/lib/queries-tasks";

type Draft = {
  id?: string;
  profileId: string;
  branchId: string | null;
  teamId: string | null;
  roles: CrmRole[];
  panelAdmin: boolean;
};

export function StaffShell({
  staff,
  branches,
  teams,
  candidates,
  canEdit,
  canManageLeave,
  today,
}: {
  staff: StaffRow[];
  branches: BranchRow[];
  teams: TeamRow[];
  candidates: AssigneeOption[];
  canEdit: boolean;
  /** Чөлөө, түр хүлээлцэх — Борлуулалт хариуцсан захирал. */
  canManageLeave: boolean;
  /** УБ-ын өнөөдөр (YYYY-MM-DD). */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leave, setLeave] = useState<{ staffId: string; name: string; from: string; to: string; substituteId: string; note: string } | null>(null);

  const registered = new Set(staff.map((s) => s.profile_id));
  const addable = candidates.filter((c) => !registered.has(c.profileId));
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  function submit() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertStaff({
        id: draft.id,
        profileId: draft.profileId,
        branchId: draft.branchId,
        teamId: draft.teamId,
        roles: draft.roles,
        panelAdmin: draft.panelAdmin,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Алдаа гарлаа.");
      router.refresh();
    });
  }

  function saveLeave() {
    if (!leave) return;
    setError(null);
    startTransition(async () => {
      const res = await setStaffLeave({
        staffId: leave.staffId,
        from: leave.from || null,
        to: leave.to || null,
        substituteId: leave.substituteId || null,
        note: leave.note || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(leave.from ? "Чөлөө бүртгэгдлээ" : "Чөлөөг цуцаллаа");
      setLeave(null);
      router.refresh();
    });
  }

  function leaveAction(fn: () => Promise<{ ok: boolean; done?: number; error?: string }>, label: string) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(label, { description: `${res.done ?? 0} сэжим шилжлээ${res.error ? " (зарим нь алгасагдсан)" : ""}.` });
      router.refresh();
    });
  }

  const nameOf = (profileId: string | null) => staff.find((x) => x.profile_id === profileId)?.full_name ?? "—";

  return (
    <div className="mt-6 space-y-4">
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {canEdit ? (
        <Button
          size="sm"
          disabled={addable.length === 0}
          onClick={() =>
            setDraft({
              profileId: addable[0]?.profileId ?? "",
              branchId: branches[0]?.id ?? null,
              teamId: null,
              roles: ["agent"],
              panelAdmin: false,
            })
          }
        >
          <Plus className="size-4" /> Ажилтан нэмэх
        </Button>
      ) : null}

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="px-5 py-2.5 font-medium">Нэр</th>
                  <th className="px-5 py-2.5 font-medium">Дүр</th>
                  <th className="px-5 py-2.5 font-medium">Салбар / Баг</th>
                  <th className="px-5 py-2.5 font-medium">Төлөв</th>
                  {canEdit ? <th className="px-5 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} className="px-5 py-6 text-center text-subtle">
                      CRM-д ажилтан бүртгэгдээгүй байна.
                    </td>
                  </tr>
                ) : null}
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-ink">{s.full_name ?? "—"}</p>
                      <p className="text-xs text-subtle">{s.email ?? ""}</p>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {s.roles.map((r) => (
                          <Badge key={r} tone={r === "sysadmin" ? "rose" : r === "agent" ? "neutral" : "brand"}>
                            {CRM_ROLE_LABEL[r]}
                          </Badge>
                        ))}
                        {s.panel_admin ? <Badge tone="amber">Панелийн админ</Badge> : null}
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-muted">
                      {branchName(s.branch_id)} / {teamName(s.team_id)}
                    </td>
                    <td className="px-5 py-2.5">
                      {!s.is_active ? (
                        <Badge tone="neutral">Идэвхгүй</Badge>
                      ) : s.offboarding ? (
                        <Badge tone="amber">Гарах урсгалд</Badge>
                      ) : isOnLeave(s.on_leave_from, s.on_leave_to, today) ? (
                        <Badge tone="blue">Чөлөөтэй{s.on_leave_to ? ` · ${s.on_leave_to} хүртэл` : ""}</Badge>
                      ) : (
                        <Badge tone="green">Идэвхтэй</Badge>
                      )}
                      {s.on_leave_from && s.leave_substitute_id ? (
                        <p className="mt-1 text-xs text-subtle">Орлон: {nameOf(s.leave_substitute_id)}</p>
                      ) : null}
                    </td>
                    {canEdit ? (
                      <td className="px-5 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Засах"
                            onClick={() =>
                              setDraft({
                                id: s.id,
                                profileId: s.profile_id,
                                branchId: s.branch_id,
                                teamId: s.team_id,
                                roles: s.roles,
                                panelAdmin: s.panel_admin,
                              })
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {canManageLeave && s.is_active && !s.offboarding ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Чөлөө"
                              title="Чөлөө, түр хүлээлцэх"
                              onClick={() =>
                                setLeave({
                                  staffId: s.id,
                                  name: s.full_name ?? s.email ?? "",
                                  from: s.on_leave_from ?? "",
                                  to: s.on_leave_to ?? "",
                                  substituteId: s.leave_substitute_id ?? "",
                                  note: s.leave_note ?? "",
                                })
                              }
                            >
                              <Plane className="size-4" />
                            </Button>
                          ) : null}
                          {s.is_active && !s.offboarding ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Гарах урсгал эхлүүлэх"
                              disabled={pending}
                              onClick={() => act(() => startOffboarding(s.id))}
                            >
                              <LogOut className="size-4" />
                            </Button>
                          ) : null}
                          {s.is_active ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Идэвхгүй болгох"
                              disabled={pending}
                              onClick={() => act(() => deactivateStaff(s.id))}
                            >
                              <UserMinus className="size-4" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => reactivateStaff(s.id))}>
                              Сэргээх
                            </Button>
                          )}
                        </div>
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
        title={draft?.id ? "Ажилтан засах" : "Ажилтан нэмэх"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Болих
            </Button>
            <Button onClick={submit} disabled={pending || !draft?.profileId || draft.roles.length === 0}>
              Хадгалах
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="space-y-3">
            {!draft.id ? (
              <Field label="Хэрэглэгч">
                <Select value={draft.profileId} onChange={(e) => setDraft({ ...draft, profileId: e.target.value })}>
                  {addable.map((c) => (
                    <option key={c.profileId} value={c.profileId}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Дүрүүд" hint="Нэг хүн олон дүртэй байж болно (ж: CEO + Системийн админ)">
              <div className="flex flex-wrap gap-1.5">
                {CRM_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        roles: draft.roles.includes(r) ? draft.roles.filter((x) => x !== r) : [...draft.roles, r],
                      })
                    }
                    className={
                      draft.roles.includes(r)
                        ? "rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"
                        : "rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:bg-surface-2"
                    }
                  >
                    {CRM_ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Салбар">
                <Select
                  value={draft.branchId ?? ""}
                  onChange={(e) => setDraft({ ...draft, branchId: e.target.value || null })}
                >
                  <option value="">Сонгоогүй</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Баг">
                <Select value={draft.teamId ?? ""} onChange={(e) => setDraft({ ...draft, teamId: e.target.value || null })}>
                  <option value="">Сонгоогүй</option>
                  {teams
                    .filter((t) => !draft.branchId || t.branch_id === draft.branchId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Панелийн админ"
              hint="Тийм бол CRM-ээс гадуурх оффисын хуудсуудад бичих эрхтэй хэвээр үлдэнэ"
            >
              <Select
                value={draft.panelAdmin ? "yes" : "no"}
                onChange={(e) => setDraft({ ...draft, panelAdmin: e.target.value === "yes" })}
              >
                <option value="no">Үгүй — зөвхөн CRM</option>
                <option value="yes">Тийм — оффисын бүрэн админ</option>
              </Select>
            </Field>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={leave !== null}
        onClose={() => setLeave(null)}
        title={leave ? `Чөлөө — ${leave.name}` : "Чөлөө"}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setLeave(null)}>
              Болих
            </Button>
            <Button onClick={saveLeave} disabled={pending}>
              Хадгалах
            </Button>
          </div>
        }
      >
        {leave ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Чөлөөний хугацаанд ажилтанд шинэ сэжим оноогдохгүй. «Түр хүлээлцэх» нь нээлттэй сэжмийг орлон ажиллагчид
              түүхтэйгээр шилжүүлж, буцаж ирэхэд «Буцаан хүлээлцэх»-ээр анхны агентад нь буцаана. Огноог хоосон болговол
              чөлөө цуцлагдана.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Эхлэх">
                <Input type="date" value={leave.from} onChange={(e) => setLeave({ ...leave, from: e.target.value })} />
              </Field>
              <Field label="Дуусах">
                <Input type="date" value={leave.to} onChange={(e) => setLeave({ ...leave, to: e.target.value })} />
              </Field>
            </div>
            <Field label="Орлон ажиллагч">
              <Select value={leave.substituteId} onChange={(e) => setLeave({ ...leave, substituteId: e.target.value })}>
                <option value="">Сонгоогүй</option>
                {staff
                  .filter((x) => x.is_active && !x.offboarding && x.id !== leave.staffId)
                  .map((x) => (
                    <option key={x.profile_id} value={x.profile_id}>
                      {x.full_name ?? x.email ?? "—"}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Тайлбар">
              <Input value={leave.note} onChange={(e) => setLeave({ ...leave, note: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => leaveAction(() => handoverForLeave(leave.staffId), "Түр хүлээлцлээ")}
              >
                Түр хүлээлцэх
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => leaveAction(() => returnFromLeave(leave.staffId), "Буцаан хүлээлцлээ")}
              >
                Буцаан хүлээлцэх
              </Button>
            </div>
            <p className="text-xs text-subtle">Түр хүлээлцэхийн өмнө чөлөөний огноо, орлон ажиллагчийг хадгална уу.</p>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
