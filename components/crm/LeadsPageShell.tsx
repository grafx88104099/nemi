"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Bookmark, Trash2, UserRoundCog, ShieldOff, Search, Phone, AlarmClock, PhoneMissed, Flame, Building2, X } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { LeadFormModal } from "@/components/crm/LeadFormModal";
import { ListingThumb } from "@/components/crm/ListingPicker";
import { bulkAssign } from "@/lib/actions/crm-leads";
import { saveSavedView, deleteSavedView } from "@/lib/actions/crm-contacts";
import { fmtDate } from "@/lib/format";
import { formatPhone, normalizePhone } from "@/lib/crm/normalize";
import { leadSlaState, slaStateLabel, ubToday } from "@/lib/crm/agent-core";
import { listingPriceLabel } from "@/lib/crm/lead-listing";
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
 * Сэжимийн жагсаалт: шүүлт URL-д, хадгалсан харагдац, багц эзэмшигч солих
 * (Багийн ахлагч ба дээш), эхний холболтын хугацааны тэмдэг, «Хэтэрсэн»,
 * «N цагт холбогдоогүй» шүүлт. Утсан дээр карт жагсаалт, Залгах товчтой.
 */
export function LeadsPageShell({
  rows,
  sources,
  branches,
  agents,
  savedViews,
  roles,
  basePath,
  noContactHours = 48,
  registrarSources,
}: {
  rows: LeadRow[];
  sources: LookupRow[];
  branches: BranchRow[];
  agents: AgentOption[];
  savedViews: SavedViewRow[];
  roles: CrmRole[];
  basePath: string;
  noContactHours?: number;
  registrarSources?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const isLeadRole = ["team_lead", "sales_director", "ops_qc"].some((r) => roles.includes(r as CrmRole));

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(sp.get("new") === "1");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignOwner, setAssignOwner] = useState("");
  const [assignReason, setAssignReason] = useState<ReassignReason | "">("");
  const [assignNote, setAssignNote] = useState("");
  const [viewName, setViewName] = useState("");
  const [viewSaveOpen, setViewSaveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());

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
    if (!assignOwner || !assignReason) {
      setError("Шинэ эзэмшигч, шалтгааныг сонгоно уу.");
      return;
    }
    if (!assignNote.trim()) {
      setError("Шилжүүлэлтийн тайлбар заавал.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await bulkAssign(selected, assignOwner, assignReason, assignNote.trim());
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      toast.success(`${res.done ?? 0} сэжим шилжүүлэгдлээ`, res.error ? { description: res.error } : undefined);
      setAssignOpen(false);
      setSelected([]);
      router.refresh();
    });
  }

  function saveView() {
    if (!viewName.trim()) return;
    const params: Record<string, string> = {};
    sp.forEach((v, k) => {
      if (k !== "new") params[k] = v;
    });
    startTransition(async () => {
      const res = await saveSavedView({ page: "leads", name: viewName.trim(), params });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Харагдац хадгалагдлаа");
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

  const today = ubToday(now);
  const listingFilter = sp.get("listing");
  const listingFilterRow = rows.find((r) => r.listing_id === listingFilter);
  const listingFilterTitle = (listingFilterRow?.listing_live ?? listingFilterRow?.listing_snapshot)?.title ?? "Сонгосон зар";
  const filtered = Boolean(
    sp.get("q") || sp.get("status") || sp.get("grade") || sp.get("owner") || sp.get("branch") || sp.get("source") ||
      sp.get("unprotected") || sp.get("overdue") || sp.get("nocontact") || listingFilter
  );

  function toggleChip(key: string) {
    setParam({ [key]: sp.get(key) ? null : "1" });
  }

  function chip(key: string, label: string, Icon: typeof Flame) {
    const on = !!sp.get(key);
    return (
      <button
        key={key}
        type="button"
        onClick={() => toggleChip(key)}
        aria-pressed={on}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
          on ? "border-rose-300 bg-rose-50 text-rose-700" : "border-line bg-surface text-muted hover:text-ink"
        }`}
      >
        <Icon className="size-3.5" /> {label}
      </button>
    );
  }

  function slaBadge(r: LeadRow) {
    const s = slaStateLabel(leadSlaState(r, now, noContactHours));
    if (!s || s.tone === "green") return null;
    return <Badge tone={s.tone}>{s.label}</Badge>;
  }

  function listingSummary(r: LeadRow) {
    const listing = r.listing_live ?? r.listing_snapshot;
    if (!listing) return null;
    return (
      <div className="flex min-w-0 items-center gap-2">
        <ListingThumb photo={listing.photo} className="size-9 rounded-md" sizes="36px" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-ink" title={listing.title}>
            {listing.title}
          </div>
          <div className="text-xs text-muted">
            {listingPriceLabel(listing)}
            {r.listing_id ? "" : " · зар устсан"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Сэжим</h1>
          <p className="text-sm text-muted">
            Нийт {rows.length} · Идэвхтэй сэжим бүрд эзэмшигч, ангилал, сүүлийн холболт, дараагийн үйлдэл ба огноо заавал.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.length > 0 && isLeadRole ? (
            <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
              <UserRoundCog className="size-4" /> Эзэмшигч солих ({selected.length})
            </Button>
          ) : null}
          <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={() => setViewSaveOpen(true)}>
            <Bookmark className="size-4" /> Харагдац хадгалах
          </Button>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Шинэ сэжим
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
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

      {listingFilter ? (
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-1 pl-3 pr-1">
          <Building2 className="size-4 shrink-0 text-brand-700" />
          <p className="min-w-0 flex-1 truncate text-sm text-muted">
            Зараар шүүсэн: <span className="font-semibold text-ink">{listingFilterTitle}</span>
          </p>
          <button
            type="button"
            aria-label="Зарын шүүлт цэвэрлэх"
            onClick={() => setParam({ listing: null })}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-brand-100 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {/* Хурдан шүүлт */}
      <div className="flex flex-wrap items-center gap-1.5">
        {chip("overdue", "Дараагийн үйлдэл хэтэрсэн", AlarmClock)}
        {chip("nocontact", `${noContactHours} цагт холбогдоогүй`, PhoneMissed)}
        {chip("unprotected", "Хамгаалалтгүй", ShieldOff)}
        <button
          type="button"
          onClick={() => setParam({ grade: sp.get("grade") === "a" ? null : "a" })}
          aria-pressed={sp.get("grade") === "a"}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
            sp.get("grade") === "a" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-line bg-surface text-muted hover:text-ink"
          }`}
        >
          <Flame className="size-3.5" /> Халуун
        </button>
      </div>

      {/* Дэлгэрэнгүй шүүлт */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setParam({ q })}
            onBlur={() => setParam({ q })}
            placeholder="Нэр, дугаар, утас…"
            className="w-full pl-9 sm:w-56"
          />
        </div>
        <Select value={sp.get("status") ?? ""} onChange={(e) => setParam({ status: e.target.value || null })} className="w-[48%] sm:w-40">
          <option value="">Бүх төлөв</option>
          {CRM_LIFECYCLES.map((s) => (
            <option key={s} value={s}>
              {CRM_LIFECYCLE_LABEL[s].label}
            </option>
          ))}
        </Select>
        <Select value={sp.get("grade") ?? ""} onChange={(e) => setParam({ grade: e.target.value || null })} className="w-[48%] sm:w-44">
          <option value="">Бүх ангилал</option>
          {LEAD_GRADES.map((g) => (
            <option key={g} value={g}>
              {LEAD_GRADE_LABEL[g].label}
            </option>
          ))}
        </Select>
        {agents.length > 1 ? (
          <Select value={sp.get("owner") ?? ""} onChange={(e) => setParam({ owner: e.target.value || null })} className="w-[48%] sm:w-44">
            <option value="">Бүх эзэмшигч</option>
            {agents.map((a) => (
              <option key={a.profileId} value={a.profileId}>
                {a.name}
              </option>
            ))}
          </Select>
        ) : null}
        {branches.length > 1 ? (
          <Select value={sp.get("branch") ?? ""} onChange={(e) => setParam({ branch: e.target.value || null })} className="w-[48%] sm:w-40">
            <option value="">Бүх салбар</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select value={sp.get("source") ?? ""} onChange={(e) => setParam({ source: e.target.value || null })} className="w-[48%] sm:w-44">
          <option value="">Бүх эх сурвалж</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Flame}
          title={filtered ? "Шүүлтэд тохирох сэжим алга" : "Сэжим бүртгэгдээгүй"}
          description={
            filtered
              ? "Шүүлтээ өөрчилж үзнэ үү."
              : "Утас, чат, реферал, нээлттэй үзлэгээс ирсэн хүн бүрийг энд бүртгэнэ. Сайтаар ирсэн хандалт автоматаар орно."
          }
          action={filtered ? { label: "Шүүлт цэвэрлэх", href: pathname } : { label: "Сэжим бүртгэх", onClick: () => setFormOpen(true) }}
        />
      ) : (
        <>
          {/* Утсан дээр — карт */}
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => {
              const overdue = !!r.next_step_date && r.next_step_date < today && (r.status === "active" || r.status === "new");
              const phone = r.contact_phone ? formatPhone(normalizePhone(r.contact_phone)) || r.contact_phone : null;
              return (
                <li key={r.id} className="rounded-2xl border border-line bg-surface p-3">
                  <div className="flex items-start gap-3">
                    <Link href={`${basePath}/leads/${r.id}`} className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-semibold text-ink">{r.contact_name}</span>
                        {r.grade ? <Badge tone={LEAD_GRADE_LABEL[r.grade].tone}>{r.grade.toUpperCase()}</Badge> : null}
                        {slaBadge(r)}
                      </div>
                      <div className={`mt-1 text-xs ${overdue ? "font-semibold text-rose-600" : "text-muted"}`}>
                        {r.next_step ? `${r.next_step}${r.next_step_date ? ` · ${fmtDate(r.next_step_date)}` : ""}` : "Дараагийн үйлдэлгүй"}
                        {overdue ? " · хэтэрсэн" : ""}
                      </div>
                      <div className="mt-0.5 text-xs text-subtle">
                        {CRM_LIFECYCLE_LABEL[r.status].label}
                        {r.stage_name ? ` · ${r.stage_name}` : ""}
                        {r.owner_name ? ` · ${r.owner_name}` : " · Оноогдоогүй"}
                      </div>
                      {r.listing_live || r.listing_snapshot ? <div className="mt-2">{listingSummary(r)}</div> : null}
                    </Link>
                    {phone ? (
                      <a
                        href={`tel:${r.contact_phone!.replace(/[^\d+]/g, "")}`}
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white"
                        aria-label={`${r.contact_name} руу залгах`}
                      >
                        <Phone className="size-5" />
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Ширээн дээр — хүснэгт */}
          <Card className="hidden md:block">
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
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
                      <th className="px-4 py-2.5 font-medium">Зар</th>
                      <th className="px-4 py-2.5 font-medium">Төлөв / Шат</th>
                      <th className="px-4 py-2.5 font-medium">Ангилал</th>
                      <th className="px-4 py-2.5 font-medium">Эзэмшигч</th>
                      <th className="px-4 py-2.5 font-medium">Эх сурвалж</th>
                      <th className="px-4 py-2.5 font-medium">Дараагийн үйлдэл</th>
                      <th className="px-4 py-2.5 font-medium">Бүртгэсэн</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const overdue = !!r.next_step_date && r.next_step_date < today && (r.status === "active" || r.status === "new");
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
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                              {r.contact_phone ? (
                                <a href={`tel:${r.contact_phone.replace(/[^\d+]/g, "")}`} className="font-mono hover:text-brand-700">
                                  {formatPhone(normalizePhone(r.contact_phone)) || r.contact_phone}
                                </a>
                              ) : (
                                <span className="font-mono">{r.contact_number}</span>
                              )}
                              {slaBadge(r)}
                              {r.unprotected ? <Badge tone="amber">Хамгаалалтгүй</Badge> : null}
                              {r.kyc_public_status !== "pending" ? (
                                <Badge tone={KYC_STATUS_LABEL[r.kyc_public_status].tone}>{KYC_STATUS_LABEL[r.kyc_public_status].label}</Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="max-w-[220px] px-4 py-2.5">{listingSummary(r) ?? <span className="text-xs text-subtle">—</span>}</td>
                          <td className="px-4 py-2.5">
                            <Badge tone={CRM_LIFECYCLE_LABEL[r.status].tone}>{CRM_LIFECYCLE_LABEL[r.status].label}</Badge>
                            {r.stage_name ? <div className="mt-0.5 text-xs text-subtle">{r.stage_name}</div> : null}
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
                          <td className="max-w-[220px] px-4 py-2.5">
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
                                {r.status === "active" ? "Дараагийн үйлдэл дутуу" : "—"}
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
        </>
      )}

      <LeadFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          if (sp.get("new")) setParam({ new: null });
        }}
        basePath={basePath}
        sources={sources}
        branches={branches}
        registrarSources={registrarSources}
      />

      {/* Багц эзэмшигч солих */}
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
          <p className="text-xs text-muted">
            Шилжүүлэлт нь нотолгоонд үндэслэнэ — систем шалтгааныг (хугацаа хэтэрсэн, идэвхгүй, ажилтан гарсан г.м.)
            сэжим бүрээр шалгаж, тохирохгүйг шилжүүлэхгүй.
          </p>
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
            <Select value={assignReason} onChange={(e) => setAssignReason(e.target.value as ReassignReason | "")}>
              <option value="">— Сонгох —</option>
              {REASSIGN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASSIGN_REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Тайлбар (заавал)">
            <Input value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="Нотолгоо, нөхцөл байдал" />
          </Field>
        </div>
      </Modal>

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
