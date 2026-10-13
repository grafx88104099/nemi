"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Bookmark, Trash2, UserRoundCog, ShieldOff, Search } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { LeadFormModal } from "@/components/crm/LeadFormModal";
import { bulkAssign } from "@/lib/actions/crm-leads";
import { saveSavedView, deleteSavedView } from "@/lib/actions/crm-contacts";
import { fmtDate } from "@/lib/format";
import { formatPhone, normalizePhone } from "@/lib/crm/normalize";
import type { LeadRow, AgentOption } from "@/lib/queries-crm-leads";
import type { SavedViewRow } from "@/lib/queries-crm-contacts";
import type { LookupRow, BranchRow } from "@/lib/queries-crm-core";
import {
  CRM_LIFECYCLES,
  CRM_LIFECYCLE_LABEL,
  LEAD_GRADES,
  LEAD_GRADE_LABEL,
  KYC_STATUS_LABEL,
  type CrmRole,
} from "@/lib/constants-crm";
import { REASSIGN_REASONS, REASSIGN_REASON_LABEL, type ReassignReason } from "@/lib/validation/crm";

/**
 * Сэжимийн жагсаалт (P-01, F-119–122, F-125/127): олон талбарын шүүлт URL-д,
 * хадгалсан харагдац (F-121), багц эзэмшигч солих (F-122 — team_lead+),
 * хамгаалалтгүй бүртгэлийн шүүлт (F-127). basePath: оффис/агент dual-mount.
 */
export function LeadsPageShell({
  rows,
  sources,
  branches,
  agents,
  savedViews,
  roles,
  basePath,
}: {
  rows: LeadRow[];
  sources: LookupRow[];
  branches: BranchRow[];
  agents: AgentOption[];
  savedViews: SavedViewRow[];
  roles: CrmRole[];
  basePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const isLeadRole = ["team_lead", "sales_director", "ops_qc", "sysadmin"].some((r) =>
    roles.includes(r as CrmRole)
  );

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOwner, setAssignOwner] = useState("");
  const [assignReason, setAssignReason] = useState<ReassignReason>("client_request");
  const [assignNote, setAssignNote] = useState("");
  const [viewName, setViewName] = useState("");
  const [viewSaveOpen, setViewSaveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === rows.length ? [] : rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submitBulkAssign() {
    if (!assignOwner) {
      setError("Шинэ эзэмшигч сонгоно уу.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await bulkAssign(selected, assignOwner, assignReason, assignNote.trim() || null);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setAssignOpen(false);
      setSelected([]);
      router.refresh();
    });
  }

  function saveView() {
    if (!viewName.trim()) return;
    const params: Record<string, string> = {};
    sp.forEach((v, k) => {
      params[k] = v;
    });
    startTransition(async () => {
      const res = await saveSavedView({ page: "leads", name: viewName.trim(), params });
      if (res.error) {
        setError(res.error);
        return;
      }
      setViewSaveOpen(false);
      setViewName("");
      router.refresh();
    });
  }

  function applyView(v: SavedViewRow) {
    const params = new URLSearchParams();
    const obj = (v.params ?? {}) as Record<string, string>;
    for (const [k, val] of Object.entries(obj)) if (val) params.set(k, val);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Сэжим</h1>
          <p className="text-sm text-muted">
            Нийт {rows.length} · Алтан дүрэм: идэвхтэй сэжим бүрд эзэмшигч, ангилал, холболт, дараагийн алхам + огноо заавал.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && isLeadRole ? (
            <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
              <UserRoundCog className="size-4" /> Эзэмшигч солих ({selected.length})
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setViewSaveOpen(true)}>
            <Bookmark className="size-4" /> Харагдац хадгалах
          </Button>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Шинэ сэжим
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      {savedViews.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-subtle">Хадгалсан:</span>
          {savedViews.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs">
              <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => applyView(v)}>
                {v.name}
              </button>
              <button
                type="button"
                aria-label="Устгах"
                className="text-subtle hover:text-danger"
                onClick={() =>
                  startTransition(async () => {
                    await deleteSavedView(v.id);
                    router.refresh();
                  })
                }
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* Шүүлтүүд (F-120) */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setParam({ q })}
            onBlur={() => setParam({ q })}
            placeholder="Нэр, дугаар, утас…"
            className="w-56 pl-9"
          />
        </div>
        <Select value={sp.get("status") ?? ""} onChange={(e) => setParam({ status: e.target.value || null })} className="w-40">
          <option value="">Бүх төлөв</option>
          {CRM_LIFECYCLES.map((s) => (
            <option key={s} value={s}>
              {CRM_LIFECYCLE_LABEL[s].label}
            </option>
          ))}
        </Select>
        <Select value={sp.get("grade") ?? ""} onChange={(e) => setParam({ grade: e.target.value || null })} className="w-40">
          <option value="">Бүх ангилал</option>
          {LEAD_GRADES.map((g) => (
            <option key={g} value={g}>
              {LEAD_GRADE_LABEL[g].label}
            </option>
          ))}
        </Select>
        <Select value={sp.get("owner") ?? ""} onChange={(e) => setParam({ owner: e.target.value || null })} className="w-44">
          <option value="">Бүх эзэмшигч</option>
          {agents.map((a) => (
            <option key={a.profileId} value={a.profileId}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select value={sp.get("branch") ?? ""} onChange={(e) => setParam({ branch: e.target.value || null })} className="w-40">
          <option value="">Бүх салбар</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={sp.get("source") ?? ""} onChange={(e) => setParam({ source: e.target.value || null })} className="w-44">
          <option value="">Бүх эх сурвалж</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setParam({ unprotected: sp.get("unprotected") ? null : "1" })}
          className={`inline-flex h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition ${
            sp.get("unprotected")
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-line bg-surface text-muted hover:text-ink"
          }`}
        >
          <ShieldOff className="size-4" /> Хамгаалалтгүй
        </button>
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Бүгдийг сонгох"
                      checked={selected.length === rows.length && rows.length > 0}
                      onChange={toggleAll}
                      className="size-4 rounded border-line"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Харилцагч</th>
                  <th className="px-4 py-2.5 font-medium">Утас</th>
                  <th className="px-4 py-2.5 font-medium">Төлөв</th>
                  <th className="px-4 py-2.5 font-medium">Ангилал / Оноо</th>
                  <th className="px-4 py-2.5 font-medium">Эзэмшигч</th>
                  <th className="px-4 py-2.5 font-medium">Эх сурвалж</th>
                  <th className="px-4 py-2.5 font-medium">Дараагийн алхам</th>
                  <th className="px-4 py-2.5 font-medium">Бүртгэсэн</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-subtle">
                      Шүүлтэд тохирох сэжим алга.
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => {
                  const overdue = r.status === "active" && !!r.next_step_date && r.next_step_date < today;
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          aria-label="Сонгох"
                          checked={selected.includes(r.id)}
                          onChange={() => toggleOne(r.id)}
                          className="size-4 rounded border-line"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`${basePath}/leads/${r.id}`} className="font-semibold text-ink hover:text-brand-700">
                          {r.contact_name}
                        </Link>
                        <div className="flex items-center gap-1.5 text-xs text-subtle">
                          <span className="font-mono">{r.contact_number}</span>
                          {r.unprotected ? <Badge tone="amber">Хамгаалалтгүй</Badge> : null}
                          {r.kyc_public_status !== "pending" ? (
                            <Badge tone={KYC_STATUS_LABEL[r.kyc_public_status].tone}>
                              {KYC_STATUS_LABEL[r.kyc_public_status].label}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted">
                        {r.contact_phone ? formatPhone(normalizePhone(r.contact_phone)) || r.contact_phone : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={CRM_LIFECYCLE_LABEL[r.status].tone}>{CRM_LIFECYCLE_LABEL[r.status].label}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {r.grade ? (
                            <Badge tone={LEAD_GRADE_LABEL[r.grade].tone}>{r.grade.toUpperCase()}</Badge>
                          ) : (
                            <span className="text-xs text-subtle">—</span>
                          )}
                          {r.score != null ? <span className="text-xs text-muted">{Number(r.score).toFixed(0)}</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted">{r.owner_name ?? <span className="text-subtle">Оноогдоогүй</span>}</td>
                      <td className="px-4 py-2.5 text-muted">{r.source_label ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {r.next_step ? (
                          <div>
                            <div className="truncate text-ink" title={r.next_step}>
                              {r.next_step}
                            </div>
                            <div className={`text-xs ${overdue ? "font-semibold text-rose-600" : "text-subtle"}`}>
                              {r.next_step_date ? fmtDate(r.next_step_date) : "огноогүй"}
                              {overdue ? " · хэтэрсэн" : ""}
                            </div>
                          </div>
                        ) : (
                          <span className={r.status === "active" ? "text-xs font-semibold text-rose-600" : "text-xs text-subtle"}>
                            {r.status === "active" ? "Алхам дутуу!" : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-subtle">{fmtDate(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <LeadFormModal open={formOpen} onClose={() => setFormOpen(false)} basePath={basePath} sources={sources} branches={branches} />

      {/* Багц эзэмшигч солих (F-122) */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Багц эзэмшигч солих (${selected.length} сэжим)`}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAssignOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button onClick={submitBulkAssign} disabled={pending}>
              {pending ? "Шилжүүлж байна…" : "Шилжүүлэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Шинэ эзэмшигч">
            <Select value={assignOwner} onChange={(e) => setAssignOwner(e.target.value)}>
              <option value="">— Сонгох —</option>
              {agents.map((a) => (
                <option key={a.profileId} value={a.profileId}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Шалтгаан (заавал)">
            <Select value={assignReason} onChange={(e) => setAssignReason(e.target.value as ReassignReason)}>
              {REASSIGN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASSIGN_REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Тэмдэглэл">
            <Input value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="Нэмэлт тайлбар" />
          </Field>
        </div>
      </Modal>

      {/* Харагдац хадгалах (F-121) */}
      <Modal
        open={viewSaveOpen}
        onClose={() => setViewSaveOpen(false)}
        title="Харагдац хадгалах"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setViewSaveOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button onClick={saveView} disabled={pending || !viewName.trim()}>
              Хадгалах
            </Button>
          </div>
        }
      >
        <Field label="Харагдацын нэр" hint="Одоогийн шүүлтүүд хадгалагдана">
          <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Жишээ: Миний халуун сэжим" />
        </Field>
      </Modal>
    </div>
  );
}
