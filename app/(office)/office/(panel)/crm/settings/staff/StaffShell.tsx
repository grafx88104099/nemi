"use client";

import { useId, useState, useTransition } from "react";
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
import { returnFromLeave, setStaffLeave } from "@/lib/actions/crm-ownership";
import { isOnLeave } from "@/lib/crm2/offboarding";
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

/** Буцаахад хэцүү үйлдэл — баталгаажуулах цонхоор (нэр, үр дагаврыг хэлнэ). */
type Confirm = { kind: "offboard" | "deactivate"; staff: StaffRow };

export function StaffShell({
  staff,
  branches,
  teams,
  candidates,
  canEdit,
  canReactivate,
  canManageLeave,
  today,
}: {
  staff: StaffRow[];
  branches: BranchRow[];
  teams: TeamRow[];
  candidates: AssigneeOption[];
  canEdit: boolean;
  /** «Сэргээх» — reactivateStaff-ийн эрхтэй ижил (зөвхөн sysadmin). */
  canReactivate: boolean;
  /** Чөлөө бүртгэх — Борлуулалт хариуцсан захирал. */
  canManageLeave: boolean;
  /** УБ-ын өнөөдөр (YYYY-MM-DD). */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fid = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leave, setLeave] = useState<{ staffId: string; name: string; from: string; to: string; substituteId: string; note: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const registered = new Set(staff.map((s) => s.profile_id));
  const addable = candidates.filter((c) => !registered.has(c.profileId));
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";
  const displayName = (s: StaffRow) => s.full_name ?? s.email ?? "Ажилтан";

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
      toast.success(draft.id ? "Хадгаллаа" : "Ажилтан нэмэгдлээ");
      setDraft(null);
      router.refresh();
    });
  }

  /** «Гарах урсгал» / «Идэвхгүй болгох» — баталгаажуулсны дараа. Алдаа цонхондоо үлдэнэ (шалтгааныг уншина). */
  function runConfirmed() {
    if (!confirm) return;
    const { kind, staff: s } = confirm;
    setConfirmError(null);
    startTransition(async () => {
      const res = kind === "offboard" ? await startOffboarding(s.id) : await deactivateStaff(s.id);
      if (!res.ok) {
        setConfirmError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(
        kind === "offboard" ? `${displayName(s)}: гарах урсгал эхэллээ` : `${displayName(s)}: идэвхгүй боллоо`
      );
      setConfirm(null);
      router.refresh();
    });
  }

  function reactivate(s: StaffRow) {
    setError(null);
    startTransition(async () => {
      const res = await reactivateStaff(s.id);
      if (!res.ok) {
        const msg = res.error ?? "Алдаа гарлаа.";
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(`${displayName(s)}: сэргээлээ`);
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

  function endLeave(staffId: string) {
    setError(null);
    startTransition(async () => {
      const res = await returnFromLeave(staffId);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success("Чөлөө дууслаа");
      setLeave(null);
      router.refresh();
    });
  }

  const nameOf = (profileId: string | null) => staff.find((x) => x.profile_id === profileId)?.full_name ?? "—";

  function openConfirm(kind: Confirm["kind"], s: StaffRow) {
    setConfirmError(null);
    setConfirm({ kind, staff: s });
  }

  function statusBadge(s: StaffRow) {
    return (
      <>
        {s.removed ? (
          <Badge tone="rose">Хасагдсан</Badge>
        ) : !s.is_active ? (
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
      </>
    );
  }

  function roleBadges(s: StaffRow) {
    return (
      <div className="flex flex-wrap gap-1">
        {s.roles.map((r) => (
          <Badge key={r} tone={r === "sysadmin" ? "rose" : r === "agent" ? "neutral" : "brand"}>
            {CRM_ROLE_LABEL[r]}
          </Badge>
        ))}
        {s.panel_admin ? <Badge tone="amber">Панелийн админ</Badge> : null}
      </div>
    );
  }

  /**
   * Мөрийн үйлдлүүд — шошготой товч (зөвхөн icon биш), хоорондоо зайтай.
   * Гарах урсгал / Идэвхгүй болгох нь баталгаажуулах цонх нээнэ.
   */
  function actions(s: StaffRow) {
    if (s.removed) return <p className="text-xs text-subtle">Түүх хадгалагдсан</p>;
    return (
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button
          size="touch"
          variant="outline"
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
          <Pencil className="size-4" aria-hidden /> Засах
        </Button>
        {canManageLeave && s.is_active && !s.offboarding ? (
          <Button
            size="touch"
            variant="outline"
            title="Чөлөө, түр хүлээлцэх"
            onClick={() =>
              setLeave({
                staffId: s.id,
                name: displayName(s),
                from: s.on_leave_from ?? "",
                to: s.on_leave_to ?? "",
                substituteId: s.leave_substitute_id ?? "",
                note: s.leave_note ?? "",
              })
            }
          >
            <Plane className="size-4" aria-hidden /> Чөлөө
          </Button>
        ) : null}
        {s.is_active && !s.offboarding ? (
          <Button size="touch" variant="outline" disabled={pending} onClick={() => openConfirm("offboard", s)}>
            <LogOut className="size-4" aria-hidden /> Гарах урсгал
          </Button>
        ) : null}
        {s.is_active ? (
          <Button
            size="touch"
            variant="outline"
            className="text-danger"
            disabled={pending}
            onClick={() => openConfirm("deactivate", s)}
          >
            <UserMinus className="size-4" aria-hidden /> Идэвхгүй болгох
          </Button>
        ) : canReactivate ? (
          <Button size="touch" variant="outline" disabled={pending} onClick={() => reactivate(s)}>
            Сэргээх
          </Button>
        ) : null}
      </div>
    );
  }

  const isLead = (s: StaffRow) =>
    s.roles.includes("team_lead") || teams.some((t) => t.lead_profile_id === s.profile_id);

  return (
    <div className="mt-6 space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <Button
          size="touch"
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

      {/* Утас, таблет (хажуу цэстэй): карт — 760px хүснэгт хажуу тийш гүйлгүүлж үйлдлийг нуудаг байсан. */}
      <ul className="space-y-3 lg:hidden" aria-label="Ажилтнууд">
        {staff.length === 0 ? (
          <li>
            <Card>
              <CardBody className="text-center text-sm text-subtle">CRM-д ажилтан бүртгэгдээгүй байна.</CardBody>
            </Card>
          </li>
        ) : null}
        {staff.map((s) => (
          <li key={s.id}>
            <Card>
              <CardBody className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-ink">{s.full_name ?? "—"}</p>
                    {s.email ? <p className="truncate text-xs text-subtle">{s.email}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">{statusBadge(s)}</div>
                </div>
                {roleBadges(s)}
                <p className="text-sm text-muted">
                  {branchName(s.branch_id)} / {teamName(s.team_id)}
                </p>
                {canEdit ? actions(s) : null}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="hidden lg:block">
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="px-5 py-2.5 font-medium">Нэр</th>
                  <th className="px-5 py-2.5 font-medium">Дүр</th>
                  <th className="px-5 py-2.5 font-medium">Салбар / Баг</th>
                  <th className="px-5 py-2.5 font-medium">Төлөв</th>
                  {canEdit ? (
                    <th className="px-5 py-2.5">
                      <span className="sr-only">Үйлдэл</span>
                    </th>
                  ) : null}
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
                  <tr key={s.id} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-ink">{s.full_name ?? "—"}</p>
                      <p className="text-xs text-subtle">{s.email ?? ""}</p>
                    </td>
                    <td className="px-5 py-2.5">{roleBadges(s)}</td>
                    <td className="px-5 py-2.5 text-muted">
                      {branchName(s.branch_id)} / {teamName(s.team_id)}
                    </td>
                    <td className="px-5 py-2.5">{statusBadge(s)}</td>
                    {canEdit ? <td className="px-5 py-2.5 text-right">{actions(s)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={confirm !== null}
        onClose={() => !pending && setConfirm(null)}
        closeOnBackdrop={!pending}
        title={
          confirm?.kind === "offboard"
            ? `Гарах урсгал эхлүүлэх үү? — ${confirm ? displayName(confirm.staff) : ""}`
            : `Идэвхгүй болгох уу? — ${confirm ? displayName(confirm.staff) : ""}`
        }
        footer={
          <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="touch" disabled={pending} onClick={() => setConfirm(null)}>
              Болих
            </Button>
            <Button
              size="touch"
              variant={confirm?.kind === "deactivate" ? "danger" : "primary"}
              disabled={pending}
              onClick={runConfirmed}
            >
              {confirm?.kind === "offboard" ? "Гарах урсгал эхлүүлэх" : "Идэвхгүй болгох"}
            </Button>
          </div>
        }
      >
        {confirm ? (
          <div className="space-y-3 p-4 text-sm text-ink">
            {confirm.kind === "offboard" ? (
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <b>{displayName(confirm.staff)}</b>-д «Таны CRM бүртгэлд гарах урсгал эхэллээ» гэсэн мэдэгдэл очно.
                </li>
                <li>Танд нэр бүхий хүлээлцэх даалгавар үүснэ.</li>
                <li>
                  Хэлцэл, харилцагч, хөрөнгийн үүрэг, нээлттэй ажлыг нь өөр агентад шилжүүлсний дараа «Идэвхгүй
                  болгох» боломжтой.
                </li>
              </ul>
            ) : (
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  <b>{displayName(confirm.staff)}</b> CRM-д нэвтрэх эрхээ алдаж, багийн чатаас хасагдана.
                </li>
                {isLead(confirm.staff) ? (
                  <li>
                    Багийн ахлагчийн эрх хасагдана — «Сэргээх» үед ахлагч <b>буцаж сэргэхгүй</b>, дахин томилно.
                  </li>
                ) : null}
                <li>
                  Нээлттэй хэлцэл, хөрөнгийн үүрэг, харилцагч, нээлттэй ажил эсвэл шийдвэрлээгүй хүсэлт үлдсэн бол
                  идэвхгүй болгохгүй — эхлээд шилжүүлнэ.
                </li>
              </ul>
            )}
            {confirmError ? (
              <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-danger">
                {confirmError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Ажилтан засах" : "Ажилтан нэмэх"}
        footer={
          <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="touch" onClick={() => setDraft(null)}>
              Болих
            </Button>
            <Button size="touch" onClick={submit} disabled={pending || !draft?.profileId || draft.roles.length === 0}>
              Хадгалах
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="space-y-3 p-4">
            {!draft.id ? (
              <Field label="Хэрэглэгч" htmlFor={`${fid}-user`}>
                <Select id={`${fid}-user`} value={draft.profileId} onChange={(e) => setDraft({ ...draft, profileId: e.target.value })}>
                  {addable.map((c) => (
                    <option key={c.profileId} value={c.profileId}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Дүрүүд" hint="Нэг хүн олон дүртэй байж болно (ж: CEO + Системийн админ)">
              <div role="group" aria-label="Дүрүүд" className="flex flex-wrap gap-1.5">
                {CRM_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={draft.roles.includes(r)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        roles: draft.roles.includes(r) ? draft.roles.filter((x) => x !== r) : [...draft.roles, r],
                      })
                    }
                    className={
                      draft.roles.includes(r)
                        ? "inline-flex min-h-11 items-center rounded-full border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-700 sm:min-h-8"
                        : "inline-flex min-h-11 items-center rounded-full border border-line px-3 text-xs text-muted hover:bg-surface-2 sm:min-h-8"
                    }
                  >
                    {CRM_ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Салбар" htmlFor={`${fid}-branch`}>
                <Select
                  id={`${fid}-branch`}
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
              <Field label="Баг" htmlFor={`${fid}-team`}>
                <Select id={`${fid}-team`} value={draft.teamId ?? ""} onChange={(e) => setDraft({ ...draft, teamId: e.target.value || null })}>
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
              htmlFor={`${fid}-panel`}
              hint="Тийм бол CRM-ээс гадуурх оффисын хуудсуудад бичих эрхтэй хэвээр үлдэнэ"
            >
              <Select
                id={`${fid}-panel`}
                value={draft.panelAdmin ? "yes" : "no"}
                onChange={(e) => setDraft({ ...draft, panelAdmin: e.target.value === "yes" })}
              >
                <option value="no">Үгүй — зөвхөн CRM</option>
                <option value="yes">Тийм — оффисын бүрэн админ</option>
              </Select>
            </Field>
            {error ? (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={leave !== null}
        onClose={() => setLeave(null)}
        title={leave ? `Чөлөө — ${leave.name}` : "Чөлөө"}
        footer={
          <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="touch" onClick={() => setLeave(null)}>
              Болих
            </Button>
            <Button size="touch" onClick={saveLeave} disabled={pending}>
              Хадгалах
            </Button>
          </div>
        }
      >
        {leave ? (
          <div className="space-y-3 p-4">
            <p className="text-sm text-muted">
              Чөлөөний хугацаа ба орлон ажиллагчийг тэмдэглэнэ. Нээлттэй Staff хэлцлийг шилжүүлэх нь хэлцлийн хуудаснаас
              хийгдэнэ. Огноог хоосон болговол чөлөө цуцлагдана.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Эхлэх" htmlFor={`${fid}-from`}>
                <Input id={`${fid}-from`} type="date" value={leave.from} onChange={(e) => setLeave({ ...leave, from: e.target.value })} />
              </Field>
              <Field label="Дуусах" htmlFor={`${fid}-to`}>
                <Input id={`${fid}-to`} type="date" value={leave.to} onChange={(e) => setLeave({ ...leave, to: e.target.value })} />
              </Field>
            </div>
            <Field label="Орлон ажиллагч" htmlFor={`${fid}-sub`}>
              <Select id={`${fid}-sub`} value={leave.substituteId} onChange={(e) => setLeave({ ...leave, substituteId: e.target.value })}>
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
            <Field label="Тайлбар" htmlFor={`${fid}-note`}>
              <Input id={`${fid}-note`} value={leave.note} onChange={(e) => setLeave({ ...leave, note: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Button size="touch" variant="outline" disabled={pending} onClick={() => endLeave(leave.staffId)}>
                Чөлөөг дуусгах
              </Button>
            </div>
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
