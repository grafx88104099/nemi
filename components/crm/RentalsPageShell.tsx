"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CalendarClock, FileText, Plus, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { createLease, createManagementAgreement, type CreateLeaseInput } from "@/lib/actions/crm-leases";
import type {
  AgreementRow,
  AgingSummary,
  LeaseFilters,
  LeaseRow,
  RentalContactOption,
  RentalPropertyOption,
  RentalsSummary,
} from "@/lib/queries-crm-rentals";
import { AGING_BUCKET_LABEL } from "@/lib/crm/arrears";
import {
  EXPENSE_BEARER_LABEL,
  LEASE_STATUSES,
  LEASE_STATUS_LABEL,
  type CrmRole,
  type LeaseStatus,
} from "@/lib/constants-crm";

/**
 * R-08 Түрээсийн багцын самбар: тоон карт (дүүргэлт/дуусах хугацаа/насжилт),
 * гэрээний жагсаалт (F-509 шүүлт), шинэ гэрээ + менежментийн гэрээ үүсгэх.
 */

const EXPENSE_TYPES = [
  ["electricity", "Цахилгаан"],
  ["water", "Ус"],
  ["heating", "Дулаан"],
  ["hoa", "СӨХ"],
  ["internet", "Интернет"],
  ["other", "Бусад"],
] as const;

export function RentalsPageShell({
  summary,
  aging,
  leases,
  agreements,
  contacts,
  properties,
  filters,
  roles,
}: {
  summary: RentalsSummary;
  aging: AgingSummary;
  leases: LeaseRow[];
  agreements: AgreementRow[];
  contacts: RentalContactOption[];
  properties: RentalPropertyOption[];
  filters: LeaseFilters;
  roles: CrmRole[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canWrite = roles.some((r) =>
    ["property_manager", "agent", "team_lead", "sales_director", "ops_qc"].includes(r)
  );
  const canManageAgreements = roles.some((r) => ["property_manager", "sales_director", "ops_qc"].includes(r));

  // ── Шинэ түрээсийн гэрээ ──
  const [leaseOpen, setLeaseOpen] = useState(false);
  const [f, setF] = useState({
    propertyId: "",
    tenantContactId: "",
    landlordContactId: "",
    startOn: "",
    endOn: "",
    monthlyRent: "",
    paymentDay: "1",
    graceDays: "3",
    depositAmount: "",
    isManaged: false,
  });
  const [bearers, setBearers] = useState<Record<string, "tenant" | "landlord" | "pmc">>({
    electricity: "tenant",
    water: "tenant",
    heating: "tenant",
    hoa: "landlord",
    internet: "tenant",
    other: "tenant",
  });

  // ── Шинэ менежментийн гэрээ ──
  const [agrOpen, setAgrOpen] = useState(false);
  const [a, setA] = useState({
    ownerContactId: "",
    startOn: "",
    endOn: "",
    feePct: "10",
    repairApprovalLimit: "500000",
    noticeDays: "30",
    propertyIds: [] as string[],
  });

  function applyFilter(patch: Partial<LeaseFilters>) {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.managed != null) params.set("managed", String(next.managed));
    if (next.q) params.set("q", next.q);
    if (next.expiringDays != null) params.set("expiring", String(next.expiringDays));
    router.push(`/office/crm/rentals${params.size ? `?${params}` : ""}`);
  }

  function submitLease() {
    setError(null);
    const selectedProp = properties.find((p) => p.id === f.propertyId);
    const input: CreateLeaseInput = {
      propertyId: f.propertyId,
      tenantContactId: f.tenantContactId,
      landlordContactId: f.landlordContactId,
      startOn: f.startOn,
      endOn: f.endOn,
      monthlyRent: Number(f.monthlyRent),
      paymentDay: Number(f.paymentDay),
      graceDays: Number(f.graceDays) || 0,
      depositAmount: Number(f.depositAmount) || 0,
      isManaged: f.isManaged,
      managementAgreementId: f.isManaged ? (selectedProp?.management_agreement_id ?? null) : null,
      expenseLines: EXPENSE_TYPES.map(([code]) => ({ expenseType: code, bearer: bearers[code] })),
    };
    startTransition(async () => {
      const res = await createLease(input);
      if (res.error || !res.id) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setLeaseOpen(false);
      router.push(`/office/crm/rentals/leases/${res.id}`);
    });
  }

  function submitAgreement() {
    setError(null);
    startTransition(async () => {
      const res = await createManagementAgreement({
        ownerContactId: a.ownerContactId,
        startOn: a.startOn,
        endOn: a.endOn || null,
        feePct: Number(a.feePct),
        reportingFrequency: "monthly",
        noticeDays: Number(a.noticeDays) || 30,
        repairApprovalLimit: Number(a.repairApprovalLimit),
        propertyIds: a.propertyIds,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setAgrOpen(false);
      router.refresh();
    });
  }

  const occupancyPct =
    summary.occupied + summary.vacant > 0
      ? Math.round((summary.occupied / (summary.occupied + summary.vacant)) * 100)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Түрээсийн менежмент</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/office/crm/rentals/invoices" variant="outline" size="sm">
            Нэхэмжлэх
          </ButtonLink>
          <ButtonLink href="/office/crm/rentals/maintenance" variant="outline" size="sm">
            Засвар
          </ButtonLink>
          <ButtonLink href="/office/crm/rentals/monthly" variant="outline" size="sm">
            Сарын бүртгэл
          </ButtonLink>
          <ButtonLink href="/office/crm/rentals/statements" variant="outline" size="sm">
            Өмчлөгчийн тайлан
          </ButtonLink>
          {canManageAgreements && (
            <Button variant="secondary" size="sm" onClick={() => setAgrOpen(true)}>
              <Plus className="size-4" /> Менежментийн гэрээ
            </Button>
          )}
          {canWrite && (
            <Button size="sm" onClick={() => setLeaseOpen(true)}>
              <Plus className="size-4" /> Шинэ түрээсийн гэрээ
            </Button>
          )}
        </div>
      </div>

      {/* R-08 тоон картууд */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody className="flex items-center gap-3">
            <FileText className="size-8 text-brand-600" />
            <div>
              <p className="text-2xl font-bold text-ink">{summary.activeLeases}</p>
              <p className="text-xs text-muted">Идэвхтэй гэрээ ({summary.managedLeases} менежменттэй)</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-3">
            <CalendarClock className="size-8 text-amber-600" />
            <div>
              <p className="text-2xl font-bold text-ink">
                {summary.expiring60}
                <span className="ml-1 text-sm font-normal text-muted">/ {summary.expiring30}</span>
              </p>
              <button className="text-xs text-brand-700 hover:underline" onClick={() => applyFilter({ expiringDays: 60 })}>
                60/30 хоногт дуусах (F-570)
              </button>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-3">
            <Building2 className="size-8 text-emerald-600" />
            <div>
              <p className="text-2xl font-bold text-ink">{occupancyPct != null ? `${occupancyPct}%` : "—"}</p>
              <p className="text-xs text-muted">
                Дүүргэлт ({summary.occupied} түрээслэгдсэн / {summary.vacant} сул)
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-3">
            <Wallet className="size-8 text-rose-600" />
            <div>
              <p className="text-2xl font-bold text-ink">{Math.round(aging.totalOverdue).toLocaleString()}₮</p>
              <p className="text-xs text-muted">
                Хугацаа хэтэрсэн авлага · {AGING_BUCKET_LABEL.d1_3}: {aging.buckets.d1_3.count} ·{" "}
                {AGING_BUCKET_LABEL.d4_7}: {aging.buckets.d4_7.count} · {AGING_BUCKET_LABEL.d8_plus}:{" "}
                {aging.buckets.d8_plus.count}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Шүүлт (F-509) */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-44"
          value={filters.status ?? ""}
          onChange={(e) => applyFilter({ status: (e.target.value || undefined) as LeaseStatus | undefined, expiringDays: undefined })}
        >
          <option value="">Бүх төлөв</option>
          {LEASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEASE_STATUS_LABEL[s].label}
            </option>
          ))}
        </Select>
        <Select
          className="w-48"
          value={filters.managed == null ? "" : String(filters.managed)}
          onChange={(e) =>
            applyFilter({ managed: e.target.value === "" ? undefined : e.target.value === "true" })
          }
        >
          <option value="">Менежменттэй эсэх — бүгд</option>
          <option value="true">Менежменттэй</option>
          <option value="false">Энгийн түрээс</option>
        </Select>
        <Input
          className="w-56"
          placeholder="Гэрээний дугаараар хайх…"
          defaultValue={filters.q ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilter({ q: (e.target as HTMLInputElement).value || undefined });
          }}
        />
        {filters.expiringDays != null && (
          <Badge tone="amber">Дуусах ≤ {filters.expiringDays} хоног</Badge>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Гэрээний жагсаалт */}
      {leases.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">Түрээсийн гэрээ олдсонгүй.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Дугаар</th>
                <th className="px-4 py-3 font-medium">Объект</th>
                <th className="px-4 py-3 font-medium">Түрээслэгч</th>
                <th className="px-4 py-3 font-medium">Хугацаа</th>
                <th className="px-4 py-3 font-medium">Сарын түрээс</th>
                <th className="px-4 py-3 font-medium">Шатлал</th>
                <th className="px-4 py-3 font-medium">Төлөв</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leases.map((l) => {
                const st = LEASE_STATUS_LABEL[l.status];
                return (
                  <tr key={l.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link
                        href={`/office/crm/rentals/leases/${l.id}`}
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        {l.number}
                      </Link>
                      {l.is_managed && (
                        <Badge tone="blue" className="ml-2">
                          Менежменттэй
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {l.property_number ? `${l.property_number} · ${l.property_name}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink">{l.tenant_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {l.start_on} → {l.end_on}
                    </td>
                    <td className="px-4 py-3 text-ink">{l.monthly_rent.toLocaleString()}₮</td>
                    <td className="px-4 py-3 text-muted">{l.duration_tier ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Менежментийн гэрээнүүд */}
      {agreements.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-ink">Менежментийн гэрээ (F-510)</h2>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Дугаар</th>
                  <th className="px-4 py-3 font-medium">Өмчлөгч</th>
                  <th className="px-4 py-3 font-medium">Хугацаа</th>
                  <th className="px-4 py-3 font-medium">Хөлс %</th>
                  <th className="px-4 py-3 font-medium">Засварын босго</th>
                  <th className="px-4 py-3 font-medium">Объект</th>
                  <th className="px-4 py-3 font-medium">Төлөв</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {agreements.map((g) => (
                  <tr key={g.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3 font-semibold text-ink">{g.number}</td>
                    <td className="px-4 py-3 text-ink">{g.owner_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {g.start_on} → {g.end_on ?? "хугацаагүй"}
                    </td>
                    <td className="px-4 py-3 text-ink">{g.fee_pct}%</td>
                    <td className="px-4 py-3 text-muted">{Number(g.repair_approval_limit).toLocaleString()}₮</td>
                    <td className="px-4 py-3 text-muted">{g.property_count}</td>
                    <td className="px-4 py-3">
                      <Badge tone={g.status === "active" ? "green" : g.status === "terminated" ? "rose" : "neutral"}>
                        {g.status === "active" ? "Идэвхтэй" : g.status === "terminated" ? "Цуцлагдсан" : "Ноорог"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Шинэ түрээсийн гэрээ (F-500) */}
      <Modal
        open={leaseOpen}
        onClose={() => setLeaseOpen(false)}
        title="Шинэ түрээсийн гэрээ (F-500)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLeaseOpen(false)}>
              Болих
            </Button>
            <Button onClick={submitLease} disabled={pending}>
              {pending ? "Үүсгэж байна…" : "Ноорог үүсгэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Объект">
            <Select
              value={f.propertyId}
              onChange={(e) => {
                const prop = properties.find((p) => p.id === e.target.value);
                setF({ ...f, propertyId: e.target.value, isManaged: prop?.service_kind === "managed_rental" });
              }}
            >
              <option value="">— Сонгох —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} · {p.name}
                  {p.service_kind === "managed_rental" ? " (менежменттэй)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Түрээслэгч">
              <Select value={f.tenantContactId} onChange={(e) => setF({ ...f, tenantContactId: e.target.value })}>
                <option value="">— Сонгох —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Түрээслүүлэгч (өмчлөгч)">
              <Select
                value={f.landlordContactId}
                onChange={(e) => setF({ ...f, landlordContactId: e.target.value })}
              >
                <option value="">— Сонгох —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Эхлэх огноо">
              <Input type="date" value={f.startOn} onChange={(e) => setF({ ...f, startOn: e.target.value })} />
            </Field>
            <Field label="Дуусах огноо" hint="Хугацааны шатлал автомат ангилагдана (F-502)">
              <Input type="date" value={f.endOn} onChange={(e) => setF({ ...f, endOn: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Сарын түрээс (₮)">
              <Input
                type="number"
                value={f.monthlyRent}
                onChange={(e) => setF({ ...f, monthlyRent: e.target.value })}
              />
            </Field>
            <Field label="Төлбөрийн өдөр (1–31)">
              <Input
                type="number"
                min={1}
                max={31}
                value={f.paymentDay}
                onChange={(e) => setF({ ...f, paymentDay: e.target.value })}
              />
            </Field>
            <Field label="Grace (хоног)" hint="Хоцролтын босготой уялдана (F-603)">
              <Input
                type="number"
                min={0}
                value={f.graceDays}
                onChange={(e) => setF({ ...f, graceDays: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Барьцаа төлбөрийн дүн (₮) — F-540">
            <Input
              type="number"
              value={f.depositAmount}
              onChange={(e) => setF({ ...f, depositAmount: e.target.value })}
            />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Зардлын хариуцлагын хуваарь (F-505)</p>
            <div className="grid grid-cols-2 gap-2">
              {EXPENSE_TYPES.map(([code, label]) => (
                <div key={code} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                  <span className="text-sm text-ink">{label}</span>
                  <Select
                    className="w-36"
                    value={bearers[code]}
                    onChange={(e) =>
                      setBearers({ ...bearers, [code]: e.target.value as "tenant" | "landlord" | "pmc" })
                    }
                  >
                    {Object.entries(EXPENSE_BEARER_LABEL).map(([v, lbl]) => (
                      <option key={v} value={v}>
                        {lbl}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>
          {f.isManaged && (
            <p className="text-sm text-blue-700">
              Менежменттэй объект — сарын нэхэмжлэх/бүртгэл автомат үүснэ (Д-13/Д-14). Объектын менежментийн
              гэрээ автоматаар холбогдоно.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      {/* Шинэ менежментийн гэрээ (F-510/511) */}
      <Modal
        open={agrOpen}
        onClose={() => setAgrOpen(false)}
        title="Менежментийн гэрээ (F-510)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAgrOpen(false)}>
              Болих
            </Button>
            <Button onClick={submitAgreement} disabled={pending}>
              {pending ? "Үүсгэж байна…" : "Үүсгэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Өмчлөгч">
            <Select value={a.ownerContactId} onChange={(e) => setA({ ...a, ownerContactId: e.target.value })}>
              <option value="">— Сонгох —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Эхлэх огноо">
              <Input type="date" value={a.startOn} onChange={(e) => setA({ ...a, startOn: e.target.value })} />
            </Field>
            <Field label="Дуусах огноо (сонголтоор)">
              <Input type="date" value={a.endOn} onChange={(e) => setA({ ...a, endOn: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Үйлчилгээний хөлс (%)">
              <Input type="number" value={a.feePct} onChange={(e) => setA({ ...a, feePct: e.target.value })} />
            </Field>
            <Field label="Засварын босго (₮)" hint="F-513 → F-548">
              <Input
                type="number"
                value={a.repairApprovalLimit}
                onChange={(e) => setA({ ...a, repairApprovalLimit: e.target.value })}
              />
            </Field>
            <Field label="Мэдэгдэх хугацаа (хоног)">
              <Input type="number" value={a.noticeDays} onChange={(e) => setA({ ...a, noticeDays: e.target.value })} />
            </Field>
          </div>
          <Field label="Объектууд (F-511 — нэг гэрээ, олон объект)">
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {properties.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={a.propertyIds.includes(p.id)}
                    onChange={(e) =>
                      setA({
                        ...a,
                        propertyIds: e.target.checked
                          ? [...a.propertyIds, p.id]
                          : a.propertyIds.filter((id) => id !== p.id),
                      })
                    }
                  />
                  {p.number} · {p.name}
                </label>
              ))}
            </div>
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
