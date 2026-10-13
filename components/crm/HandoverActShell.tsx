"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, BadgeCheck, ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  createHandoverAct,
  transferHandoverItem,
  approveHandoverAct,
  type HandoverItem,
} from "@/lib/actions/crm-post-sale";
import type { CrmRole } from "@/lib/constants-crm";

/**
 * Гарах ажилтны хүлээлцэх акт (P-10, Д-11) — тохиргооны ажилтны хуудсанд
 * залгагдана. Багцын жагсаалт автомат; шилжүүлэлт бүр reassign RPC-ээр
 * (түүх+аудит); дутуу шилжүүлэлттэй актыг батлахгүй, батлагдаагүй бол
 * идэвхгүй болгохыг DB trigger хориглоно.
 */

export type HandoverActRow = {
  id: string;
  staff_id: string;
  staff_name?: string | null;
  items: HandoverItem[];
  approved_by: string | null;
  approver_name?: string | null;
  approved_at: string | null;
  clients_notified: boolean;
  created_at: string;
};

const ENTITY_LABEL: Record<HandoverItem["entity"], string> = {
  lead: "Сэжим",
  opportunity: "Боломж",
  property_role: "Объектын роль",
  task: "Даалгавар",
};

export function HandoverActShell({
  acts,
  offboardingStaff,
  agentOptions,
  roles,
}: {
  acts: HandoverActRow[];
  /** offboarding=true, акт нь хараахан үүсээгүй ажилтнууд. */
  offboardingStaff: { staffId: string; name: string }[];
  /** Шилжүүлэн авах идэвхтэй ажилтнууд. */
  agentOptions: { profileId: string; name: string }[];
  roles: CrmRole[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [approveFor, setApproveFor] = useState<HandoverActRow | null>(null);
  const [clientsNotified, setClientsNotified] = useState(false);

  const canManage = roles.includes("sales_director") || roles.includes("sysadmin");

  function itemKey(actId: string, it: HandoverItem): string {
    return `${actId}:${it.entity}:${it.entity_id}:${it.role ?? ""}`;
  }

  function startAct(staffId: string) {
    setError(null);
    startTransition(async () => {
      const res = await createHandoverAct(staffId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function transfer(act: HandoverActRow, it: HandoverItem) {
    const to = targets[itemKey(act.id, it)];
    if (!to) {
      setError("Шилжүүлэн авах ажилтныг сонгоно уу.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await transferHandoverItem({
        actId: act.id,
        entity: it.entity,
        entityId: it.entity_id,
        role: (it.role as "sourcing" | "photo" | "contract" | undefined) ?? null,
        toProfileId: to,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      router.refresh();
    });
  }

  function approve() {
    if (!approveFor) return;
    setError(null);
    startTransition(async () => {
      const res = await approveHandoverAct({ actId: approveFor.id, clientsNotified });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setApproveFor(null);
      setClientsNotified(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="size-4 text-brand-600" />
        <span className="text-sm font-semibold text-ink">Гарах ажилтны хүлээлцэх (Д-11)</span>
      </div>

      {canManage && offboardingStaff.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-sm text-amber-800">
            Гарах төлөвт орсон, акт үүсээгүй ажилтан: багцын жагсаалтыг автоматаар гаргана.
          </p>
          <div className="flex flex-wrap gap-2">
            {offboardingStaff.map((s) => (
              <Button key={s.staffId} size="sm" variant="outline" onClick={() => startAct(s.staffId)} disabled={pending}>
                Акт үүсгэх — {s.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {acts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Хүлээлцэх акт алга.</p>
      ) : (
        acts.map((act) => {
          const items = Array.isArray(act.items) ? act.items : [];
          const remaining = items.filter((it) => !it.transferred_to && it.entity !== "task").length;
          return (
            <div key={act.id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">{act.staff_name ?? act.staff_id}</span>
                {act.approved_at ? (
                  <Badge tone="green">
                    Батлагдсан — {act.approver_name ?? ""} ({new Date(act.approved_at).toLocaleDateString("mn-MN")})
                  </Badge>
                ) : (
                  <Badge tone={remaining ? "amber" : "blue"}>
                    {remaining ? `Шилжүүлэлт дутуу: ${remaining}` : "Батлахад бэлэн"}
                  </Badge>
                )}
                {act.clients_notified && <Badge tone="neutral">Харилцагчид мэдэгдсэн</Badge>}
                <span className="ml-auto text-xs text-subtle">
                  {new Date(act.created_at).toLocaleDateString("mn-MN")}
                </span>
                {!act.approved_at && canManage && (
                  <Button size="sm" onClick={() => setApproveFor(act)} disabled={pending || remaining > 0}>
                    <BadgeCheck className="size-4" />
                    Батлах
                  </Button>
                )}
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-muted">Нээлттэй бичлэг байгаагүй.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {items.map((it) => {
                    const key = itemKey(act.id, it);
                    return (
                      <li key={key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <Badge tone="neutral">{ENTITY_LABEL[it.entity]}</Badge>
                        <span className="text-sm text-ink">{it.title}</span>
                        {it.transferred_to ? (
                          <span className="ml-auto flex items-center gap-1 text-xs text-emerald-700">
                            <BadgeCheck className="size-3.5" />
                            Шилжүүлсэн: {agentOptions.find((a) => a.profileId === it.transferred_to)?.name ?? it.transferred_to}
                          </span>
                        ) : act.approved_at || !canManage ? (
                          <span className="ml-auto text-xs text-subtle">Шилжүүлээгүй</span>
                        ) : (
                          <span className="ml-auto flex items-center gap-2">
                            <Select
                              value={targets[key] ?? ""}
                              onChange={(e) => setTargets((t) => ({ ...t, [key]: e.target.value }))}
                              className="w-48"
                            >
                              <option value="">Шинэ эзэмшигч…</option>
                              {agentOptions.map((a) => (
                                <option key={a.profileId} value={a.profileId}>
                                  {a.name}
                                </option>
                              ))}
                            </Select>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => transfer(act, it)}
                              disabled={pending || !targets[key]}
                            >
                              <ArrowRightLeft className="size-4" />
                              Шилжүүлэх
                            </Button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <Modal
        open={!!approveFor}
        onClose={() => setApproveFor(null)}
        title="Хүлээлцэх акт батлах"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setApproveFor(null)}>
              Болих
            </Button>
            <Button onClick={approve} disabled={pending}>
              {pending ? "Батлаж байна…" : "Батлах"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Батлахын өмнө систем ажилтны нээлттэй эзэмшлийг дахин шалгана — дутуу бол батлагдахгүй.
            Батлагдсан акт өөрчлөгдөхгүй (нотолгоо, P-10).
          </p>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={clientsNotified}
              onChange={(e) => setClientsNotified(e.target.checked)}
              className="size-4 rounded border-line"
            />
            Харилцагчид шинэ хариуцагчийг мэдэгдсэн
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
