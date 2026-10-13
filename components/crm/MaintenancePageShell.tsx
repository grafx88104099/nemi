"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Clock3, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Drawer } from "@/components/ui/drawer";
import {
  approveByOwner,
  assignVendor,
  closeRequest,
  createRequest,
  createVendor,
  rejectRequest,
  sendToApproval,
  startWork,
} from "@/lib/actions/crm-maintenance";
import type { MaintenanceFilters, MaintenanceRow, RentalPropertyOption, VendorRow } from "@/lib/queries-crm-rentals";
import type { LookupRow } from "@/lib/queries-crm-core";
import {
  EXPENSE_BEARERS,
  EXPENSE_BEARER_LABEL,
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_LABEL,
  URGENCIES,
  URGENCY_LABEL,
  type CrmRole,
  type ExpenseBearer,
  type MaintenanceStatus,
  type Urgency,
} from "@/lib/constants-crm";

/**
 * Засварын самбар (F-545–554): SLA badge (F-552), зөвшөөрлийн урсгал (F-548),
 * яаралтай bypass (F-549), хаалтын нотолгоо (F-553), гүйцэтгэгчийн лавлах (F-550).
 */

function slaBadge(row: MaintenanceRow) {
  if (["closed", "rejected"].includes(row.status)) return null;
  const now = Date.now();
  const resolveBy = row.sla_resolve_by ? new Date(row.sla_resolve_by).getTime() : null;
  const respondBy = row.sla_respond_by ? new Date(row.sla_respond_by).getTime() : null;
  if (resolveBy && now > resolveBy) return <Badge tone="rose">SLA хэтэрсэн (Д-20)</Badge>;
  if (respondBy && now > respondBy && row.status === "new") return <Badge tone="rose">Хариу өгөх SLA хэтэрсэн</Badge>;
  if (resolveBy && resolveBy - now < 12 * 3600 * 1000) return <Badge tone="amber">SLA дөхөж буй</Badge>;
  return null;
}

export function MaintenancePageShell({
  rows,
  vendors,
  properties,
  categories,
  filters,
  roles,
  profileId,
}: {
  rows: MaintenanceRow[];
  vendors: VendorRow[];
  properties: RentalPropertyOption[];
  categories: LookupRow[];
  filters: MaintenanceFilters;
  roles: CrmRole[];
  profileId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isPm = roles.some((r) => ["property_manager", "sales_director", "ops_qc"].includes(r));

  const [createOpen, setCreateOpen] = useState(false);
  const [f, setF] = useState({
    propertyId: "",
    source: "tenant",
    categoryId: "",
    urgency: "normal" as Urgency,
    description: "",
    estimateAmount: "",
    costBearer: "" as "" | ExpenseBearer,
  });
  const [detail, setDetail] = useState<MaintenanceRow | null>(null);
  const [assign, setAssign] = useState({ vendorId: "", emergencyBypass: false });
  const [close, setClose] = useState({ completionDocId: "", actualAmount: "", costBearer: "" as "" | ExpenseBearer });
  const [approveDocId, setApproveDocId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendor, setVendor] = useState({ name: "", phone: "", specialty: "" });

  function applyFilter(patch: Partial<MaintenanceFilters>) {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.urgency) params.set("urgency", next.urgency);
    router.push(`/office/crm/rentals/maintenance${params.size ? `?${params}` : ""}`);
  }

  function run(fn: () => Promise<{ ok?: boolean; id?: string; error?: string }>, closeFn?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      closeFn?.();
      setDetail(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Засварын хүсэлт</h1>
        <div className="flex gap-2">
          {isPm && (
            <Button size="sm" variant="outline" onClick={() => setVendorOpen(true)}>
              <Plus className="size-4" /> Гүйцэтгэгч (F-550)
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Шинэ хүсэлт
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-52"
          value={filters.status ?? ""}
          onChange={(e) => applyFilter({ status: (e.target.value || undefined) as MaintenanceStatus | undefined })}
        >
          <option value="">Бүх төлөв</option>
          {MAINTENANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MAINTENANCE_STATUS_LABEL[s].label}
            </option>
          ))}
        </Select>
        <Select
          className="w-44"
          value={filters.urgency ?? ""}
          onChange={(e) => applyFilter({ urgency: (e.target.value || undefined) as Urgency | undefined })}
        >
          <option value="">Бүх зэрэглэл</option>
          {URGENCIES.map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABEL[u].label}
            </option>
          ))}
        </Select>
      </div>
      {error && !detail && !createOpen && <p className="text-sm text-danger">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Объект</th>
              <th className="px-4 py-3 font-medium">Тайлбар</th>
              <th className="px-4 py-3 font-medium">Зэрэглэл</th>
              <th className="px-4 py-3 font-medium">Дүн (төсөв/гүйц.)</th>
              <th className="px-4 py-3 font-medium">Гүйцэтгэгч</th>
              <th className="px-4 py-3 font-medium">SLA (F-552)</th>
              <th className="px-4 py-3 font-medium">Төлөв</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const st = MAINTENANCE_STATUS_LABEL[r.status];
              const urg = URGENCY_LABEL[r.urgency];
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-surface-2" onClick={() => { setDetail(r); setError(null); }}>
                  <td className="px-4 py-3 text-ink">
                    {r.property_number} · {r.property_name}
                  </td>
                  <td className="max-w-64 truncate px-4 py-3 text-muted">
                    {r.category_label ? `[${r.category_label}] ` : ""}
                    {r.description}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={urg.tone}>{urg.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.estimate_amount != null ? `${Number(r.estimate_amount).toLocaleString()}₮` : "—"}
                    {r.actual_amount != null ? ` / ${Number(r.actual_amount).toLocaleString()}₮` : ""}
                    {r.owner_approval_needed && !r.owner_approved_at && (
                      <CircleAlert className="ml-1 inline size-4 text-amber-600" aria-label="Өмчлөгчийн зөвшөөрөл хэрэгтэй (F-548)" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.vendor_name ?? "—"}</td>
                  <td className="px-4 py-3">{slaBadge(r) ?? <Clock3 className="size-4 text-subtle" />}</td>
                  <td className="px-4 py-3">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {r.emergency_bypass && (
                      <Badge tone="rose" className="ml-1">
                        Яаралтай bypass (F-549)
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  Засварын хүсэлт олдсонгүй.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Дэлгэрэнгүй + урсгалын үйлдлүүд */}
      <Drawer
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail ? `Засварын хүсэлт — ${MAINTENANCE_STATUS_LABEL[detail.status].label}` : ""}
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <p className="text-ink">{detail.description}</p>
            <div className="space-y-1 text-muted">
              <p>Объект: {detail.property_number} · {detail.property_name}</p>
              <p>Эх сурвалж: {detail.source} · Зэрэглэл: {URGENCY_LABEL[detail.urgency].label}</p>
              {detail.estimate_amount != null && <p>Төсөвт дүн: {Number(detail.estimate_amount).toLocaleString()}₮</p>}
              {detail.cost_bearer && <p>Хариуцагч тал: {EXPENSE_BEARER_LABEL[detail.cost_bearer]}</p>}
              {detail.sla_respond_by && <p>Хариу өгөх SLA: {new Date(detail.sla_respond_by).toLocaleString()}</p>}
              {detail.sla_resolve_by && <p>Шийдвэрлэх SLA: {new Date(detail.sla_resolve_by).toLocaleString()}</p>}
              {detail.owner_approval_needed && (
                <p className={detail.owner_approved_at ? "text-emerald-600" : "text-amber-600"}>
                  Өмчлөгчийн зөвшөөрөл (F-548): {detail.owner_approved_at ? "Авагдсан" : "Хүлээгдэж буй"}
                </p>
              )}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            {/* Урсгалын үйлдлүүд (F-547) */}
            {detail.status === "new" && detail.owner_approval_needed && !detail.owner_approved_at && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => sendToApproval(detail.id))}>
                Зөвшөөрөл хүсэх (F-548)
              </Button>
            )}
            {["new", "pending_approval"].includes(detail.status) && detail.owner_approval_needed && !detail.owner_approved_at && (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <Field label="Өмчлөгчийн зөвшөөрлийн баримтын ID">
                  <Input value={approveDocId} onChange={(e) => setApproveDocId(e.target.value)} placeholder="UUID" />
                </Field>
                <Button size="sm" disabled={pending} onClick={() => run(() => approveByOwner(detail.id, approveDocId))}>
                  Зөвшөөрөл бүртгэх
                </Button>
              </div>
            )}
            {["new", "pending_approval"].includes(detail.status) && (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <p className="font-medium text-ink">Оноох (F-550)</p>
                <Field label="Гүйцэтгэгч">
                  <Select value={assign.vendorId} onChange={(e) => setAssign({ ...assign, vendorId: e.target.value })}>
                    <option value="">— Сонгох —</option>
                    {vendors.filter((v) => v.is_active).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.specialty ? ` (${v.specialty})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                {detail.owner_approval_needed && !detail.owner_approved_at && (
                  <label className="flex items-center gap-2 text-sm text-rose-600">
                    <input
                      type="checkbox"
                      checked={assign.emergencyBypass}
                      onChange={(e) => setAssign({ ...assign, emergencyBypass: e.target.checked })}
                    />
                    Яаралтай нөхцөл — зөвшөөрлийг түр алгасах (F-549, дараа нөхөн баталгаажна)
                  </label>
                )}
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      assignVendor(detail.id, {
                        vendorId: assign.vendorId || null,
                        assignedTo: profileId,
                        emergencyBypass: assign.emergencyBypass,
                      })
                    )
                  }
                >
                  Оноох
                </Button>
              </div>
            )}
            {detail.status === "assigned" && (
              <Button size="sm" disabled={pending} onClick={() => run(() => startWork(detail.id))}>
                Ажил эхлүүлэх
              </Button>
            )}
            {detail.status === "in_progress" && (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <p className="font-medium text-ink">Хаах (F-553 — нотолгоотой)</p>
                <Field label="Гүйцэтгэлийн нотолгооны баримтын ID (зураг/акт)">
                  <Input value={close.completionDocId} onChange={(e) => setClose({ ...close, completionDocId: e.target.value })} placeholder="UUID" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Гүйцсэн дүн (₮)">
                    <Input type="number" value={close.actualAmount} onChange={(e) => setClose({ ...close, actualAmount: e.target.value })} />
                  </Field>
                  <Field label="Хариуцагч тал (F-551)">
                    <Select value={close.costBearer} onChange={(e) => setClose({ ...close, costBearer: e.target.value as "" | ExpenseBearer })}>
                      <option value="">— Сонгох —</option>
                      {EXPENSE_BEARERS.map((b) => (
                        <option key={b} value={b}>
                          {EXPENSE_BEARER_LABEL[b]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      closeRequest(detail.id, {
                        completionDocId: close.completionDocId,
                        actualAmount: close.actualAmount ? Number(close.actualAmount) : null,
                        costBearer: close.costBearer || null,
                      })
                    )
                  }
                >
                  Хаах
                </Button>
              </div>
            )}
            {!["closed", "rejected", "in_progress"].includes(detail.status) && (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <Field label="Татгалзах шалтгаан">
                  <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                </Field>
                <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => rejectRequest(detail.id, rejectReason))}>
                  Татгалзах
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Шинэ хүсэлт (F-545) */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Шинэ засварын хүсэлт (F-545)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    createRequest({
                      propertyId: f.propertyId,
                      source: f.source as "tenant" | "inspection" | "owner" | "pm_team",
                      categoryId: f.categoryId || null,
                      urgency: f.urgency,
                      description: f.description,
                      estimateAmount: f.estimateAmount ? Number(f.estimateAmount) : null,
                      costBearer: f.costBearer || null,
                    }),
                  () => setCreateOpen(false)
                )
              }
            >
              Бүртгэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Объект">
            <Select value={f.propertyId} onChange={(e) => setF({ ...f, propertyId: e.target.value })}>
              <option value="">— Сонгох —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Эх сурвалж">
              <Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
                <option value="tenant">Түрээслэгч</option>
                <option value="inspection">Үзлэг</option>
                <option value="owner">Өмчлөгч</option>
                <option value="pm_team">ҮХХ баг</option>
              </Select>
            </Field>
            <Field label="Ангилал (F-546)">
              <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
                <option value="">— Сонгох —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Яаралтын зэрэглэл" hint="SLA автомат тооцогдоно (F-552)">
              <Select value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value as Urgency })}>
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {URGENCY_LABEL[u].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Төсөвт дүн (₮)" hint="Босгоос дээш → өмчлөгчийн зөвшөөрөл (F-548)">
              <Input type="number" value={f.estimateAmount} onChange={(e) => setF({ ...f, estimateAmount: e.target.value })} />
            </Field>
          </div>
          <Field label="Тайлбар">
            <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      {/* Гүйцэтгэгч нэмэх (F-550) */}
      <Modal
        open={vendorOpen}
        onClose={() => setVendorOpen(false)}
        title="Гүйцэтгэгч нэмэх (F-550)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVendorOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => createVendor({ name: vendor.name, phone: vendor.phone || null, specialty: vendor.specialty || null }),
                  () => setVendorOpen(false)
                )
              }
            >
              Нэмэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Нэр">
            <Input value={vendor.name} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Утас">
              <Input value={vendor.phone} onChange={(e) => setVendor({ ...vendor, phone: e.target.value })} />
            </Field>
            <Field label="Мэргэшил">
              <Input value={vendor.specialty} onChange={(e) => setVendor({ ...vendor, specialty: e.target.value })} placeholder="сантехник, цахилгаан…" />
            </Field>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
