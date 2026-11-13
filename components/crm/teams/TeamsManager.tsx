"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  ChevronRight,
  Crown,
  Hourglass,
  Pencil,
  Plus,
  Search,
  UserMinus,
  UsersRound,
  X,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  approveTeamLead,
  assignTeamMember,
  rejectTeamLead,
  removeTeamMember,
  saveCrmTeam,
  setTeamLead,
} from "@/lib/actions/crm-teams";
import { leadActionFor, leadChangeToast } from "@/lib/crm/team-lead";
import { fmtDateTime } from "@/lib/format";
import type { ManagedTeam, TeamPerson, TeamsOverview } from "@/lib/queries-crm-teams";

const FALLBACK_ERR = "Алдаа гарлаа. Дахин оролдоно уу.";
const MODAL_FOOTER = "flex justify-end gap-2 border-t border-line p-4";

type TeamDraft = { id?: string; name: string; branchId: string };
type MoveDraft = { member: TeamPerson; team: ManagedTeam; toTeamId: string };
type SuccessToast = { title: string; description?: string };

export function TeamsManager({
  teams,
  unassigned,
  branches,
  canApproveLead,
  canViewProgress,
}: TeamsOverview & { canViewProgress: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [teamDraft, setTeamDraft] = useState<TeamDraft | null>(null);
  const [moveDraft, setMoveDraft] = useState<MoveDraft | null>(null);

  const activeBranches = branches.filter((b) => b.is_active);
  const target = teams.some((t) => t.id === targetTeamId) ? targetTeamId : (teams[0]?.id ?? "");
  const selectedIds = selected.filter((id) => unassigned.some((p) => p.profileId === id));
  const q = query.trim().toLowerCase();
  const visible = q
    ? unassigned.filter((p) => p.name.toLowerCase().includes(q) || p.phone?.includes(q))
    : unassigned;
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selectedIds.includes(p.profileId));
  const pendingProposals = teams.filter((t) => t.pendingLead).length;

  function run<R extends { ok: boolean; error?: string }>(
    fn: () => Promise<R>,
    success: string | SuccessToast | ((res: R) => SuccessToast),
    after?: () => void
  ) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        const msg =
          typeof success === "string" ? { title: success } : typeof success === "function" ? success(res) : success;
        toast.success(msg.title, { description: msg.description });
        after?.();
      } else {
        toast.error(res.error ?? FALLBACK_ERR);
      }
      router.refresh();
    });
  }

  function toggle(profileId: string) {
    setSelected((cur) => (cur.includes(profileId) ? cur.filter((id) => id !== profileId) : [...cur, profileId]));
  }

  function toggleAllVisible() {
    const ids = visible.map((p) => p.profileId);
    setSelected(allVisibleSelected ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])]);
  }

  function addSelected() {
    startTransition(async () => {
      const res = await assignTeamMember({ teamId: target, profileIds: selectedIds });
      if (res.ok) {
        toast.success(`${res.assigned ?? 0} агент багт нэмэгдлээ`, {
          description: res.addedToCrm ? `${res.addedToCrm} нь CRM-д шинээр бүртгэгдлээ.` : undefined,
        });
        setSelected([]);
      } else {
        toast.error(res.error ?? FALLBACK_ERR);
      }
      router.refresh();
    });
  }

  /** Оффисын админ шууд томилно; бусад нь санал болгож, оффисын админы батлалтыг хүлээнэ. */
  function makeLead(team: ManagedTeam, member: TeamPerson) {
    const proposal = team.pendingLead;
    const question = canApproveLead
      ? [
          team.lead
            ? `«${team.lead.name}»-г ахлагчаас чөлөөлж, «${member.name}»-г ахлагч болгох уу?`
            : `«${member.name}»-г ахлагч болгох уу?`,
          proposal ? `«${proposal.name}»-г ахлагчаар санал болгосон нь хүчингүй болно.` : "",
        ]
      : [
          `«${member.name}»-г ахлагчаар санал болгох уу?`,
          team.lead ? `Оффисын админ батлавал «${team.lead.name}» ахлагчаас чөлөөлөгдөнө.` : "",
          proposal ? `Одоогийн санал («${proposal.name}») солигдоно.` : "",
        ];
    if ((team.lead || proposal) && !window.confirm(question.filter(Boolean).join(" "))) return;
    run(
      () => setTeamLead({ teamId: team.id, profileId: member.profileId }),
      (res) => leadChangeToast(res.status ?? "applied", member.name)
    );
  }

  function approveLead(team: ManagedTeam) {
    const proposal = team.pendingLead;
    if (!proposal) return;
    const leadNote = team.lead ? ` «${team.lead.name}» ахлагчаас чөлөөлөгдөнө.` : "";
    if (!window.confirm(`«${proposal.name}»-г «${team.name}» багийн ахлагчаар батлах уу?${leadNote}`)) return;
    // Хуудсанд харсан саналыг дамжуулна — хооронд нь солигдсон бол action батлахгүй.
    run(
      () => approveTeamLead(team.id, proposal.profileId),
      (res) => leadChangeToast("applied", res.name ?? proposal.name)
    );
  }

  /** Оффисын админ татгалзана; санал болгогч өөрийн саналаа цуцлана. */
  function dropProposal(team: ManagedTeam) {
    const proposal = team.pendingLead;
    if (!proposal) return;
    const question = canApproveLead
      ? `«${proposal.name}»-г ахлагчаар санал болгосныг татгалзах уу?`
      : `«${proposal.name}»-г ахлагчаар санал болгосноо цуцлах уу?`;
    if (!window.confirm(question)) return;
    run(() => rejectTeamLead(team.id, proposal.profileId), canApproveLead ? "Саналыг татгалзлаа" : "Саналыг цуцаллаа");
  }

  function clearLead(team: ManagedTeam, name: string) {
    if (!window.confirm(`«${name}»-г «${team.name}» багийн ахлагчаас чөлөөлөх үү?`)) return;
    run(() => setTeamLead({ teamId: team.id, profileId: null }), "Ахлагчаас чөлөөллөө");
  }

  function removeMember(team: ManagedTeam, member: TeamPerson) {
    const leadNote =
      team.lead?.profileId === member.profileId
        ? " Ахлагчийн эрх нь цуцлагдана."
        : team.pendingLead?.profileId === member.profileId
          ? " Ахлагчийн санал цуцлагдана."
          : "";
    if (!window.confirm(`«${member.name}»-г «${team.name}» багаас гаргах уу?${leadNote}`)) return;
    run(() => removeTeamMember(member.profileId), `${member.name} багаас гарлаа`);
  }

  function submitMove() {
    if (!moveDraft) return;
    const { member, toTeamId } = moveDraft;
    run(() => assignTeamMember({ teamId: toTeamId, profileIds: [member.profileId] }), `${member.name} шилжлээ`, () =>
      setMoveDraft(null)
    );
  }

  function submitTeam() {
    if (!teamDraft) return;
    const draft = teamDraft;
    run(() => saveCrmTeam(draft), draft.id ? "Багийн мэдээлэл шинэчлэгдлээ" : "Баг үүслээ", () => setTeamDraft(null));
  }

  function openNewTeam() {
    setTeamDraft({ name: "", branchId: activeBranches[0]?.id ?? "" });
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {teams.length} баг · {unassigned.length} агент багт ороогүй
            {pendingProposals > 0 ? ` · ${pendingProposals} ахлагчийн санал батлалт хүлээж байна` : ""}
          </p>
          {!canApproveLead ? (
            <p className="text-xs text-subtle">Таны санал болгосон ахлагчийг оффисын админ батална.</p>
          ) : null}
        </div>
        <Button size="sm" disabled={activeBranches.length === 0} onClick={openNewTeam}>
          <Plus className="size-4" /> Баг нэмэх
        </Button>
      </div>
      {activeBranches.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Баг үүсгэхийн өмнө{" "}
          <Link href="/office/crm/settings/branches" className="font-medium text-brand-700 hover:underline">
            салбар бүртгэнэ үү
          </Link>
          .
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <aside className="min-w-0 lg:sticky lg:top-4 lg:order-2 lg:self-start">
          <Card>
            <CardBody className="p-4 sm:p-5">
              <p className="font-bold text-ink">Багт ороогүй агент</p>
              {unassigned.length === 0 ? (
                <EmptyState compact icon={UsersRound} title="Бүх агент багтай байна" />
              ) : (
                <>
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Нэр, утсаар хайх"
                      aria-label="Агент хайх"
                      className="pl-9"
                    />
                  </div>
                  <ul className="mt-2 max-h-80 overflow-y-auto overscroll-contain">
                    {visible.length === 0 ? <li className="px-2 py-4 text-center text-sm text-subtle">Олдсонгүй.</li> : null}
                    {visible.map((p) => (
                      <li key={p.profileId}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(p.profileId)}
                            onChange={() => toggle(p.profileId)}
                            className="size-4 shrink-0 rounded border-line"
                          />
                          <Avatar initials={p.initials} src={p.avatarSrc} size="sm" className="shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                            {p.phone ? <span className="block truncate text-xs text-subtle">{p.phone}</span> : null}
                          </span>
                          {p.staffId === null ? <Badge tone="amber">CRM-д шинэ</Badge> : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted">{selectedIds.length} сонгосон</span>
                      <button
                        type="button"
                        disabled={visible.length === 0}
                        onClick={toggleAllVisible}
                        className="min-h-9 font-semibold text-brand-700 hover:underline disabled:opacity-50"
                      >
                        {allVisibleSelected ? "Сонголтыг цуцлах" : "Бүгдийг сонгох"}
                      </button>
                    </div>
                    {teams.length === 0 ? (
                      <p className="text-xs text-subtle">Агент нэмэхийн тулд эхлээд баг үүсгэнэ үү.</p>
                    ) : (
                      <>
                        <Select aria-label="Нэмэх баг" value={target} onChange={(e) => setTargetTeamId(e.target.value)}>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </Select>
                        <Button className="w-full" disabled={pending || selectedIds.length === 0 || !target} onClick={addSelected}>
                          <Plus className="size-4" /> Багт нэмэх
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </aside>

        <section className="min-w-0 space-y-4 lg:order-1" aria-label="Багууд">
          {teams.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="Баг бүртгэгдээгүй"
              description="Баг үүсгээд агентуудаа хуваарилж, ахлагч томилно уу."
              action={activeBranches.length > 0 ? { label: "Баг нэмэх", onClick: openNewTeam } : undefined}
            />
          ) : null}
          {teams.map((team) => (
            <Card key={team.id}>
              <CardBody className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-bold text-ink">{team.name}</p>
                    <p className="text-xs text-subtle">
                      {team.branchName} · {team.members.length} гишүүн
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${team.name} засах`}
                    title="Нэр, салбар засах"
                    onClick={() => setTeamDraft({ id: team.id, name: team.name, branchId: team.branchId })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>

                <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  {team.lead ? (
                    <Badge tone="brand" className="max-w-full">
                      <Crown aria-hidden className="shrink-0" />
                      <span className="truncate">Ахлагч: {team.lead.name}</span>
                    </Badge>
                  ) : (
                    <Badge tone="amber">Ахлагч томилоогүй</Badge>
                  )}
                  {canViewProgress ? (
                    <Link
                      href={`/office/crm/teams/${team.id}`}
                      className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
                    >
                      Гишүүдийн явц хянах <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  ) : null}
                </div>

                {team.pendingLead ? (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                    <p className="flex items-start gap-2">
                      <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 break-words">
                        Ахлагчаар санал болгосон: <span className="font-semibold">{team.pendingLead.name}</span>
                        {team.pendingLead.proposedBy ? ` — ${team.pendingLead.proposedBy.name}` : ""}
                        {team.pendingLead.proposedAt ? `, ${fmtDateTime(team.pendingLead.proposedAt)}` : ""}
                      </span>
                    </p>
                    <p className="mt-1 text-xs sm:pl-6">
                      {canApproveLead
                        ? `Батлавал ахлагчийн эрх тэр даруй идэвхжинэ.${team.lead ? ` «${team.lead.name}» ахлагчаас чөлөөлөгдөнө.` : ""}`
                        : "Оффисын админ батлах хүртэл ахлагчийн эрх идэвхжихгүй."}
                    </p>
                    {canApproveLead || team.pendingLead.byViewer ? (
                      <div className="mt-2 flex flex-wrap gap-2 sm:pl-6">
                        {canApproveLead ? (
                          <>
                            <Button size="sm" disabled={pending} onClick={() => approveLead(team)}>
                              <Check className="size-4" aria-hidden /> Батлах
                            </Button>
                            <Button size="sm" variant="outline" disabled={pending} onClick={() => dropProposal(team)}>
                              <X className="size-4" aria-hidden /> Татгалзах
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" disabled={pending} onClick={() => dropProposal(team)}>
                            Саналыг цуцлах
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {team.brokenLead ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        {team.brokenLead.isMember
                          ? `«${team.brokenLead.name}» ахлагчаар бичигдсэн ч ахлагчийн эрх олгогдоогүй байна. ${
                              canApproveLead
                                ? "Жагсаалтаас «Ахлагч болгох»-ыг дарна уу."
                                : "Оффисын админ жагсаалтаас «Ахлагч болгох»-оор засна."
                            }`
                          : `«${team.brokenLead.name}» ахлагчаар бичигдсэн ч энэ багийн гишүүн биш тул гишүүдийн сэжмийг харахгүй. Чөлөөлөөд гишүүдээс ахлагч ${
                              canApproveLead ? "томилно" : "санал болгоно"
                            } уу.`}
                      </span>
                    </p>
                    {!team.brokenLead.isMember ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={pending}
                        onClick={() => clearLead(team, team.brokenLead?.name ?? "")}
                      >
                        Ахлагчаас чөлөөлөх
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {team.members.length === 0 ? (
                  <EmptyState compact icon={UsersRound} title="Гишүүнгүй" description="Багт ороогүй агентуудаас нэмнэ үү." />
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {team.members.map((member) => {
                      const isLead = team.lead?.profileId === member.profileId;
                      const isProposed = team.pendingLead?.profileId === member.profileId;
                      const leadAction = leadActionFor(member.profileId, team, canApproveLead);
                      return (
                        // Товчнууд нэрийн хажууд багтахгүй бол (1024px, lg aside) доош буух — нэр шахагдахгүй.
                        <li key={member.profileId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
                          <div className="flex min-w-0 grow basis-48 items-center gap-2.5">
                            <Avatar initials={member.initials} src={member.avatarSrc} size="sm" className="shrink-0" />
                            <div className="min-w-0">
                              <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-ink">
                                <span className="min-w-0 break-words">{member.name}</span>
                                {isLead ? (
                                  <Badge tone="brand">
                                    <Crown aria-hidden /> Ахлагч
                                  </Badge>
                                ) : member.roles.includes("team_lead") ? (
                                  // Ажилтны тохиргооноос дүр авсан бол ахлагч биш ч гишүүдийн сэжмийг хардаг.
                                  <Badge tone="amber">Ахлагчийн эрхтэй</Badge>
                                ) : null}
                                {isProposed ? (
                                  <Badge tone="blue">
                                    <Hourglass aria-hidden /> Батлагдахыг хүлээж байна
                                  </Badge>
                                ) : null}
                              </p>
                              {member.phone ? <p className="truncate text-xs text-subtle">{member.phone}</p> : null}
                            </div>
                          </div>
                          <div className="flex max-w-full flex-wrap items-center gap-1">
                            {isLead ? (
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => clearLead(team, member.name)}>
                                Чөлөөлөх
                              </Button>
                            ) : leadAction ? (
                              <Button size="sm" variant="secondary" disabled={pending} onClick={() => makeLead(team, member)}>
                                <Crown className="size-4" aria-hidden />{" "}
                                {leadAction === "appoint" ? "Ахлагч болгох" : "Ахлагчаар санал болгох"}
                              </Button>
                            ) : null}
                            {teams.length > 1 ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`${member.name} шилжүүлэх`}
                                title="Өөр багт шилжүүлэх"
                                disabled={pending}
                                onClick={() =>
                                  setMoveDraft({
                                    member,
                                    team,
                                    toTeamId: teams.find((t) => t.id !== team.id)?.id ?? "",
                                  })
                                }
                              >
                                <ArrowRightLeft className="size-4" />
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`${member.name} багаас гаргах`}
                              title="Багаас гаргах"
                              disabled={pending}
                              onClick={() => removeMember(team, member)}
                            >
                              <UserMinus className="size-4" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}
        </section>
      </div>

      <Modal
        open={teamDraft !== null}
        onClose={() => setTeamDraft(null)}
        title={teamDraft?.id ? "Баг засах" : "Баг нэмэх"}
        footer={
          <div className={MODAL_FOOTER}>
            <Button variant="ghost" onClick={() => setTeamDraft(null)}>
              Болих
            </Button>
            <Button disabled={pending || !teamDraft?.name.trim() || !teamDraft?.branchId} onClick={submitTeam}>
              Хадгалах
            </Button>
          </div>
        }
      >
        {teamDraft ? (
          <div className="space-y-3 p-4">
            <Field label="Нэр" htmlFor="team-name">
              <Input
                id="team-name"
                maxLength={80}
                value={teamDraft.name}
                onChange={(e) => setTeamDraft({ ...teamDraft, name: e.target.value })}
              />
            </Field>
            <Field label="Салбар" htmlFor="team-branch">
              <Select
                id="team-branch"
                value={teamDraft.branchId}
                onChange={(e) => setTeamDraft({ ...teamDraft, branchId: e.target.value })}
              >
                {branches
                  .filter((b) => b.is_active || b.id === teamDraft.branchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={moveDraft !== null}
        onClose={() => setMoveDraft(null)}
        title={moveDraft ? `${moveDraft.member.name} шилжүүлэх` : "Шилжүүлэх"}
        footer={
          <div className={MODAL_FOOTER}>
            <Button variant="ghost" onClick={() => setMoveDraft(null)}>
              Болих
            </Button>
            <Button disabled={pending || !moveDraft?.toTeamId} onClick={submitMove}>
              <ArrowRightLeft className="size-4" /> Шилжүүлэх
            </Button>
          </div>
        }
      >
        {moveDraft ? (
          <div className="space-y-3 p-4">
            <Field label="Очих баг" htmlFor="team-move-target">
              <Select
                id="team-move-target"
                value={moveDraft.toTeamId}
                onChange={(e) => setMoveDraft({ ...moveDraft, toTeamId: e.target.value })}
              >
                {teams
                  .filter((t) => t.id !== moveDraft.team.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {moveDraft.team.lead?.profileId === moveDraft.member.profileId ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Энэ хүн «{moveDraft.team.name}» багийн ахлагч. Шилжвэл ахлагчаас чөлөөлөгдөнө.
              </p>
            ) : moveDraft.team.pendingLead?.profileId === moveDraft.member.profileId ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Энэ хүнийг «{moveDraft.team.name}» багийн ахлагчаар санал болгосон. Шилжвэл санал цуцлагдана.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
