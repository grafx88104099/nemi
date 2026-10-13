"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { createProperty, type PropertyInput } from "@/lib/actions/crm-properties";
import { fmtMNT } from "@/lib/format";
import type { PropertyRow } from "@/lib/queries-crm-properties";
import type { AgentOption } from "@/lib/queries-crm-leads";
import type { BranchRow } from "@/lib/queries-crm-core";
import {
  CRM_PROPERTY_STATUSES,
  CRM_PROPERTY_STATUS_LABEL,
  CRM_PROPERTY_TYPES,
  CRM_PROPERTY_TYPE_LABEL,
  CRM_PROPERTY_ROLE_LABEL,
  OCCUPANCY_STATUSES,
  OCCUPANCY_STATUS_LABEL,
  SERVICE_KINDS,
  SERVICE_KIND_LABEL,
  type CrmPropertyType,
  type CrmRole,
  type ServiceKind,
} from "@/lib/constants-crm";

export type OwnerContactOption = { id: string; name: string; number: string };

/**
 * Объектын сан (F-200/219): шүүлт URL-д (статус, төрөл, үйлчилгээ, салбар,
 * үнийн муж, талбай, агент, ашиглалт, хайлт); шинэ объект бүртгэх маягт
 * (бүс автомат, эх сурвалжийн роль автомат — P-03). basePath: office/agent.
 */
export function PropertiesPageShell({
  rows,
  branches,
  agents,
  ownerContacts,
  roles,
  basePath,
}: {
  rows: PropertyRow[];
  branches: BranchRow[];
  agents: AgentOption[];
  ownerContacts: OwnerContactOption[];
  roles: CrmRole[];
  basePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const canCreate = ["agent", "team_lead", "sales_director", "property_manager"].some((r) =>
    roles.includes(r as CrmRole)
  );

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Маягтын төлөв
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [khoroo, setKhoroo] = useState("");
  const [complex, setComplex] = useState("");
  const [building, setBuilding] = useState("");
  const [unit, setUnit] = useState("");
  const [serviceKind, setServiceKind] = useState<ServiceKind>("sale");
  const [propertyType, setPropertyType] = useState<CrmPropertyType>("apartment");
  const [price, setPrice] = useState("");
  const [rentPrice, setRentPrice] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [rooms, setRooms] = useState("");
  const [ownerContactId, setOwnerContactId] = useState("");
  const [features, setFeatures] = useState("");
  const [tagLocation, setTagLocation] = useState("");
  const [tagType, setTagType] = useState("");
  const [tagPrice, setTagPrice] = useState("");
  const [tagGoal, setTagGoal] = useState("");
  const [tagSpecial, setTagSpecial] = useState("");

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  const list = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  function submitCreate() {
    setError(null);
    const isRental = serviceKind !== "sale";
    const input: PropertyInput = {
      name: name.trim(),
      address: {
        district: district.trim(),
        khoroo: khoroo.trim() || undefined,
        complex: complex.trim() || undefined,
        building: building.trim() || undefined,
        unit: unit.trim() || undefined,
      },
      serviceKind,
      propertyType,
      price: !isRental && price ? Number(price) : null,
      rentPrice: isRental && rentPrice ? Number(rentPrice) : null,
      areaM2: areaM2 ? Number(areaM2) : null,
      rooms: rooms ? Number(rooms) : null,
      ownerContactId,
      branchId: null,
      branchOverrideReason: null,
      paymentDay: null,
      features: list(features),
      matchTags: {
        location: list(tagLocation),
        type: list(tagType),
        price: list(tagPrice),
        goal: list(tagGoal),
        special: list(tagSpecial),
      },
      keyLocation: null,
      keyHolderId: null,
    };
    startTransition(async () => {
      const res = await createProperty(input);
      if (res.error) {
        setError(res.error);
        return;
      }
      setFormOpen(false);
      if (res.id) router.push(`${basePath}/properties/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Объектын сан</h1>
          <p className="text-sm text-muted">
            Нийт {rows.length} · Дундын сан — идэвхжүүлэлтийн босго, бүсчлэл, 3 ролийн бүртгэлтэй.
          </p>
        </div>
        {canCreate ? (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Шинэ объект
          </Button>
        ) : null}
      </div>

      {/* Шүүлтүүд (F-219) */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setParam({ q })}
            onBlur={() => setParam({ q })}
            placeholder="Нэр, дугаар, дүүрэг…"
            className="w-56 pl-9"
          />
        </div>
        <Select value={sp.get("status") ?? ""} onChange={(e) => setParam({ status: e.target.value || null })} className="w-40">
          <option value="">Бүх статус</option>
          {CRM_PROPERTY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CRM_PROPERTY_STATUS_LABEL[s].label}
            </option>
          ))}
        </Select>
        <Select value={sp.get("service") ?? ""} onChange={(e) => setParam({ service: e.target.value || null })} className="w-44">
          <option value="">Бүх үйлчилгээ</option>
          {SERVICE_KINDS.map((s) => (
            <option key={s} value={s}>
              {SERVICE_KIND_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={sp.get("type") ?? ""} onChange={(e) => setParam({ type: e.target.value || null })} className="w-44">
          <option value="">Бүх төрөл</option>
          {CRM_PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {CRM_PROPERTY_TYPE_LABEL[t]}
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
        <Select value={sp.get("occupancy") ?? ""} onChange={(e) => setParam({ occupancy: e.target.value || null })} className="w-44">
          <option value="">Бүх ашиглалт</option>
          {OCCUPANCY_STATUSES.map((o) => (
            <option key={o} value={o}>
              {OCCUPANCY_STATUS_LABEL[o].label}
            </option>
          ))}
        </Select>
        <Select value={sp.get("agent") ?? ""} onChange={(e) => setParam({ agent: e.target.value || null })} className="w-44">
          <option value="">Бүх агент</option>
          {agents.map((a) => (
            <option key={a.profileId} value={a.profileId}>
              {a.name}
            </option>
          ))}
        </Select>
        <Input
          value={sp.get("priceMin") ?? ""}
          onChange={(e) => setParam({ priceMin: e.target.value || null })}
          placeholder="Үнэ ≥"
          type="number"
          className="w-28"
        />
        <Input
          value={sp.get("priceMax") ?? ""}
          onChange={(e) => setParam({ priceMax: e.target.value || null })}
          placeholder="Үнэ ≤"
          type="number"
          className="w-28"
        />
        <Input
          value={sp.get("areaMin") ?? ""}
          onChange={(e) => setParam({ areaMin: e.target.value || null })}
          placeholder="Талбай ≥"
          type="number"
          className="w-28"
        />
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="px-4 py-2.5 font-medium">Объект</th>
                  <th className="px-4 py-2.5 font-medium">Төрөл / Үйлчилгээ</th>
                  <th className="px-4 py-2.5 font-medium">Үнэ</th>
                  <th className="px-4 py-2.5 font-medium">Талбай / Өрөө</th>
                  <th className="px-4 py-2.5 font-medium">Статус</th>
                  <th className="px-4 py-2.5 font-medium">Ашиглалт</th>
                  <th className="px-4 py-2.5 font-medium">Өмчлөгч</th>
                  <th className="px-4 py-2.5 font-medium">Агентууд</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-subtle">
                      Шүүлтэд тохирох объект алга.
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => {
                  const price = r.service_kind === "sale" ? r.price : (r.rent_price ?? r.price);
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                      <td className="px-4 py-2.5">
                        <Link href={`${basePath}/properties/${r.id}`} className="font-semibold text-ink hover:text-brand-700">
                          {r.name}
                        </Link>
                        <div className="text-xs text-subtle">
                          <span className="font-mono">{r.number}</span>
                          {r.address.district ? <span> · {r.address.district}</span> : null}
                          {r.address.complex ? <span> · {r.address.complex}</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {CRM_PROPERTY_TYPE_LABEL[r.property_type as CrmPropertyType] ?? r.property_type}
                        <div className="text-xs text-subtle">{SERVICE_KIND_LABEL[r.service_kind]}</div>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-ink">
                        {price != null ? fmtMNT(Number(price)) : "—"}
                        {r.service_kind !== "sale" ? <span className="text-xs font-normal text-subtle">/сар</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {r.area_m2 != null ? `${r.area_m2} м²` : "—"}
                        {r.rooms != null ? ` · ${r.rooms} өрөө` : ""}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={CRM_PROPERTY_STATUS_LABEL[r.status].tone}>
                          {CRM_PROPERTY_STATUS_LABEL[r.status].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.occupancy ? (
                          <Badge tone={OCCUPANCY_STATUS_LABEL[r.occupancy].tone}>
                            {OCCUPANCY_STATUS_LABEL[r.occupancy].label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{r.owner_name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5 text-xs text-subtle">
                          {r.roles.length === 0 ? "—" : null}
                          {r.roles.map((role) => (
                            <span key={role.id}>
                              {CRM_PROPERTY_ROLE_LABEL[role.role]}: <span className="text-muted">{role.agent_name ?? "?"}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Шинэ объект (F-200/201) */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Шинэ объект бүртгэх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button onClick={submitCreate} disabled={pending}>
              {pending ? "Хадгалж байна…" : "Бүртгэх"}
            </Button>
          </div>
        }
      >
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}
          <Field label="Нэр">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Жишээ: Жардин 3 өрөө, 11-р хороолол" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дүүрэг (заавал)">
              <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Хан-Уул" />
            </Field>
            <Field label="Хороо">
              <Input value={khoroo} onChange={(e) => setKhoroo(e.target.value)} placeholder="11" />
            </Field>
            <Field label="Хотхон / төсөл">
              <Input value={complex} onChange={(e) => setComplex(e.target.value)} />
            </Field>
            <Field label="Байр">
              <Input value={building} onChange={(e) => setBuilding(e.target.value)} />
            </Field>
            <Field label="Тоот">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-subtle">Бүс/салбар хаягаас автоматаар тодорхойлогдоно (F-207).</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Үйлчилгээний төрөл">
              <Select value={serviceKind} onChange={(e) => setServiceKind(e.target.value as ServiceKind)}>
                {SERVICE_KINDS.map((s) => (
                  <option key={s} value={s}>
                    {SERVICE_KIND_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Үл хөдлөхийн төрөл">
              <Select value={propertyType} onChange={(e) => setPropertyType(e.target.value as CrmPropertyType)}>
                {CRM_PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CRM_PROPERTY_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            {serviceKind === "sale" ? (
              <Field label="Үнэ (₮)">
                <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
            ) : (
              <Field label="Түрээсийн үнэ (₮/сар)">
                <Input type="number" value={rentPrice} onChange={(e) => setRentPrice(e.target.value)} />
              </Field>
            )}
            <Field label="Талбай (м²)">
              <Input type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
            </Field>
            <Field label="Өрөөний тоо">
              <Input type="number" value={rooms} onChange={(e) => setRooms(e.target.value)} />
            </Field>
          </div>
          <Field label="Өмчлөгч (заавал)" hint="Өмчлөгч нь харилцагчийн санд бүртгэлтэй байх ёстой (F-217)">
            <Select value={ownerContactId} onChange={(e) => setOwnerContactId(e.target.value)}>
              <option value="">— Сонгох —</option>
              {ownerContacts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.number})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Гол онцлог" hint="Таслалаар тусгаарлана">
            <Input value={features} onChange={(e) => setFeatures(e.target.value)} placeholder="Лифттэй, Зогсоолтой, Тавилгатай" />
          </Field>
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-xs font-semibold text-muted">Тохируулгын шошго — 5 бүлэг (F-209, идэвхжүүлэлтэд байршил+төрөл заавал)</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Байршил">
                <Input value={tagLocation} onChange={(e) => setTagLocation(e.target.value)} placeholder="Хан-Уул, Зайсан" />
              </Field>
              <Field label="Төрөл">
                <Input value={tagType} onChange={(e) => setTagType(e.target.value)} placeholder="Орон сууц, 3 өрөө" />
              </Field>
              <Field label="Үнэ">
                <Input value={tagPrice} onChange={(e) => setTagPrice(e.target.value)} placeholder="Дунд сегмент" />
              </Field>
              <Field label="Зорилго">
                <Input value={tagGoal} onChange={(e) => setTagGoal(e.target.value)} placeholder="Амьдрах, Хөрөнгө оруулалт" />
              </Field>
              <Field label="Онцгой">
                <Input value={tagSpecial} onChange={(e) => setTagSpecial(e.target.value)} placeholder="Шинэ, Гол гудамж" />
              </Field>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
