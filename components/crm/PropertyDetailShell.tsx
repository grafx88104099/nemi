"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, KeyRound, Pencil, Plus, UserRoundCog } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { BackLink } from "@/components/ui/back-link";
import { ActivationChecklist } from "@/components/crm/ActivationChecklist";
import { EntityDocs } from "@/components/crm/EntityDocs";
import { MatchList } from "@/components/crm/MatchList";
import {
  assignPropertyRole,
  createListingAgreement,
  addMeter,
  addMeterReading,
  publishToSite,
  reassignPropertyRole,
  setOccupancy,
  setPropertyStatus,
  updateProperty,
  updatePropertyPrice,
} from "@/lib/actions/crm-properties";
import { fmtMNT, fmtDate, fmtDateTime } from "@/lib/format";
import type { PropertyDetail } from "@/lib/queries-crm-properties";
import type { MatchRow } from "@/lib/queries-crm-matching";
import type { AgentOption } from "@/lib/queries-crm-leads";
import type { DocRow } from "@/lib/queries-crm-docs";
import {
  CRM_PROPERTY_ROLES,
  CRM_PROPERTY_ROLE_LABEL,
  CRM_PROPERTY_STATUS_LABEL,
  CRM_PROPERTY_TYPE_LABEL,
  OCCUPANCY_STATUSES,
  OCCUPANCY_STATUS_LABEL,
  SERVICE_KIND_LABEL,
  type CrmPropertyRole,
  type CrmPropertyStatus,
  type CrmPropertyType,
  type CrmRole,
  type OccupancyStatus,
} from "@/lib/constants-crm";

/**
 * Объектын карт (F-201–219): статусын машин, идэвхжүүлэлтийн checklist,
 * 3 роль (эх сурвалж хамгаалалттай), листингийн гэрээ, үнийн түүх,
 * тохируулга (урвуу F-254), ашиглалт/сул хоног, тоолуур, түлхүүр.
 * UI-ийн шилжилтийн сонголт = тохиргооны seed-тэй ижил тойм; эцсийн үнэн DB guard.
 */

const STATUS_NEXT: Record<CrmPropertyStatus, { to: CrmPropertyStatus; reason?: boolean }[]> = {
  draft: [],
  active: [{ to: "reserved" }, { to: "withdrawn", reason: true }],
  reserved: [{ to: "active", reason: true }, { to: "sold" }, { to: "rented" }],
  sold: [],
  rented: [{ to: "active" }],
  withdrawn: [{ to: "draft", reason: true }],
};

export function PropertyDetailShell({
  property,
  matches,
  missing,
  agents,
  roles,
  basePath,
  docs = [],
}: {
  property: PropertyDetail;
  matches: MatchRow[];
  missing: string[];
  agents: AgentOption[];
  roles: CrmRole[];
  basePath: string;
  /** F-203/204: объектын баримт/зураг (category='photo' идэвхжүүлэлтэд тоологдоно). */
  docs?: DocRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState<string | null>(null);

  // Модалын төлөвүүд
  const [statusTarget, setStatusTarget] = useState<{ to: CrmPropertyStatus; reason?: boolean } | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusMissing, setStatusMissing] = useState<string[]>([]);
  const [priceOpen, setPriceOpen] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [newRent, setNewRent] = useState("");
  const [priceReason, setPriceReason] = useState("");
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleKind, setRoleKind] = useState<CrmPropertyRole>("photo");
  const [roleAgent, setRoleAgent] = useState("");
  const [roleReason, setRoleReason] = useState("");
  const [agrOpen, setAgrOpen] = useState(false);
  const [agrNumber, setAgrNumber] = useState("");
  const [agrSigned, setAgrSigned] = useState("");
  const [agrExpires, setAgrExpires] = useState("");
  const [agrTerms, setAgrTerms] = useState("");
  const [meterOpen, setMeterOpen] = useState(false);
  const [meterType, setMeterType] = useState("");
  const [meterSerial, setMeterSerial] = useState("");
  const [readingFor, setReadingFor] = useState<string | null>(null);
  const [readingValue, setReadingValue] = useState("");
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyLocation, setKeyLocation] = useState(property.key_location ?? "");
  const [keyHolder, setKeyHolder] = useState(property.key_holder_id ?? "");

  const isRental = property.service_kind !== "sale";
  const canManage = ["sales_director", "property_manager", "team_lead", "agent"].some((r) => roles.includes(r as CrmRole));
  const canReassignSourcing = ["sales_director", "ops_qc"].some((r) => roles.includes(r as CrmRole));

  function run(fn: () => Promise<{ ok?: boolean; error?: string; missing?: string[]; id?: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        if (res.missing) setStatusMissing(res.missing);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  const address = [
    property.address.district,
    property.address.khoroo ? `${property.address.khoroo}-р хороо` : null,
    property.address.complex,
    property.address.building,
    property.address.unit,
  ]
    .filter(Boolean)
    .join(", ");

  const tags = (property.match_tags ?? {}) as Record<string, string[]>;
  const activeAgreement = property.agreements.find((a) => a.expires_on >= new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-4">
      <BackLink href={`${basePath}/properties`} label="Объектын сан" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-ink">{property.name}</h1>
            <Badge tone={CRM_PROPERTY_STATUS_LABEL[property.status].tone}>
              {CRM_PROPERTY_STATUS_LABEL[property.status].label}
            </Badge>
            {property.occupancy ? (
              <Badge tone={OCCUPANCY_STATUS_LABEL[property.occupancy].tone}>
                {OCCUPANCY_STATUS_LABEL[property.occupancy].label}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">{property.number}</span> · {address || "Хаяг бүртгэгдээгүй"} ·{" "}
            {SERVICE_KIND_LABEL[property.service_kind]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_NEXT[property.status].map((t) => (
            <Button
              key={t.to}
              size="sm"
              variant="outline"
              disabled={pending || !canManage}
              onClick={() => {
                setStatusReason("");
                setStatusMissing([]);
                if (t.reason) setStatusTarget(t);
                else run(() => setPropertyStatus(property.id, t.to));
              }}
            >
              → {CRM_PROPERTY_STATUS_LABEL[t.to].label}
            </Button>
          ))}
          {property.status === "active" ? (
            <Button size="sm" disabled={pending || !canManage} onClick={() => run(() => publishToSite(property.id))}>
              <Globe className="size-4" /> {property.listing_id ? "Сайтын зар шинэчлэх" : "Сайтад нийтлэх"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
          {statusMissing.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-xs">
              {statusMissing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Tabs
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "overview", label: "Ерөнхий" },
              { value: "roles", label: "Роли ба гэрээ" },
              { value: "price", label: "Үнийн түүх" },
              { value: "matching", label: `Тохируулга (${matches.length})` },
              { value: "rental", label: "Ашиглалт / Тоолуур" },
              { value: "docs", label: `Баримт / Зураг (${docs.length})` },
            ]}
          />

          {tab === "overview" ? (
            <Card>
              <CardBody className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="Үл хөдлөхийн төрөл" value={CRM_PROPERTY_TYPE_LABEL[property.property_type as CrmPropertyType] ?? property.property_type} />
                  <Info label="Үйлчилгээ" value={SERVICE_KIND_LABEL[property.service_kind]} />
                  <Info
                    label={isRental ? "Түрээсийн үнэ" : "Үнэ"}
                    value={
                      isRental
                        ? property.rent_price != null
                          ? `${fmtMNT(Number(property.rent_price))}/сар`
                          : "—"
                        : property.price != null
                          ? fmtMNT(Number(property.price))
                          : "—"
                    }
                  />
                  <Info label="Талбай / Өрөө" value={`${property.area_m2 ?? "—"} м² · ${property.rooms ?? "—"} өрөө`} />
                  <Info label="Өмчлөгч" value={
                    <Link href={`${basePath}/contacts/${property.owner_contact_id}`} className="font-semibold text-brand-700 hover:underline">
                      {property.owner_name ?? "—"} {property.owner_number ? `(${property.owner_number})` : ""}
                    </Link>
                  } />
                  <Info label="Төлбөрийн өдөр" value={property.payment_day != null ? `Сарын ${property.payment_day}` : "—"} />
                  <Info
                    label="Түлхүүр (F-215)"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <KeyRound className="size-3.5 text-subtle" />
                        {property.key_location ?? "—"}
                        {property.key_holder_name ? ` · ${property.key_holder_name}` : ""}
                        <button type="button" className="text-brand-700 hover:underline" onClick={() => setKeyOpen(true)}>
                          <Pencil className="size-3.5" />
                        </button>
                      </span>
                    }
                  />
                  <Info label="Бүртгэсэн" value={fmtDate(property.created_at)} />
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold text-subtle">Гол онцлог</p>
                  <div className="flex flex-wrap gap-1.5">
                    {property.features.length === 0 ? <span className="text-sm text-subtle">—</span> : null}
                    {property.features.map((f) => (
                      <Badge key={f}>{f}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold text-subtle">Тохируулгын шошго (F-209)</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["location", "type", "price", "goal", "special"] as const).map((g) => (
                      <div key={g} className="text-sm">
                        <span className="text-xs text-subtle">
                          {{ location: "Байршил", type: "Төрөл", price: "Үнэ", goal: "Зорилго", special: "Онцгой" }[g]}:
                        </span>{" "}
                        {Array.isArray(tags[g]) && tags[g].length > 0 ? (
                          tags[g].map((t) => (
                            <Badge key={t} tone="blue" className="mr-1">
                              {t}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {tab === "roles" ? (
            <div className="space-y-4">
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink">Агентын 3 роль (F-206)</h3>
                    <Button size="sm" variant="outline" onClick={() => { setRoleReason(""); setRoleOpen(true); }}>
                      <UserRoundCog className="size-4" /> Роль онооx / шилжүүлэх
                    </Button>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {CRM_PROPERTY_ROLES.map((rk) => {
                        const row = property.roles.find((r) => r.role === rk);
                        return (
                          <tr key={rk} className="border-b border-line last:border-0">
                            <td className="py-2 text-muted">{CRM_PROPERTY_ROLE_LABEL[rk]}</td>
                            <td className="py-2 font-semibold text-ink">{row?.agent_name ?? <span className="font-normal text-subtle">Оноогоогүй</span>}</td>
                            <td className="py-2 text-right text-xs text-subtle">{row ? fmtDate(row.assigned_at) : ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs text-subtle">
                    Эх сурвалжийн роль хамгаалагдана — өөрчлөлт зөвхөн Борлуулалтын захирал/ЧМТ, шалтгаантай, аудиттай.
                    Ролийн бүртгэл урамшууллын нотолгоонд шууд дамжина.
                  </p>
                </CardBody>
              </Card>

              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink">Листингийн гэрээ (F-205)</h3>
                    <Button size="sm" variant="outline" onClick={() => setAgrOpen(true)}>
                      <Plus className="size-4" /> Гэрээ бүртгэх
                    </Button>
                  </div>
                  {property.agreements.length === 0 ? (
                    <p className="text-sm text-subtle">Гэрээ бүртгэгдээгүй — идэвхжүүлэлтэд заавал.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs text-subtle">
                          <th className="py-1.5 font-medium">Дугаар</th>
                          <th className="py-1.5 font-medium">Гарын үсэг</th>
                          <th className="py-1.5 font-medium">Дуусах</th>
                          <th className="py-1.5 font-medium">Нөхцөл</th>
                        </tr>
                      </thead>
                      <tbody>
                        {property.agreements.map((a) => (
                          <tr key={a.id} className="border-b border-line last:border-0">
                            <td className="py-2 font-mono text-xs">{a.number}</td>
                            <td className="py-2 text-muted">{fmtDate(a.signed_on)}</td>
                            <td className="py-2">
                              {a === activeAgreement ? (
                                <Badge tone="green">{fmtDate(a.expires_on)}</Badge>
                              ) : (
                                <span className="text-muted">{fmtDate(a.expires_on)}</span>
                              )}
                            </td>
                            <td className="py-2 text-xs text-subtle">{a.special_terms ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardBody>
              </Card>
            </div>
          ) : null}

          {tab === "price" ? (
            <Card>
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink">Үнийн түүх (F-208)</h3>
                  <Button size="sm" variant="outline" disabled={!canManage} onClick={() => { setNewPrice(""); setNewRent(""); setPriceReason(""); setPriceOpen(true); }}>
                    <Pencil className="size-4" /> Үнэ өөрчлөх
                  </Button>
                </div>
                {property.priceHistory.length === 0 ? (
                  <p className="text-sm text-subtle">Үнийн өөрчлөлт бүртгэгдээгүй.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs text-subtle">
                        <th className="py-1.5 font-medium">Огноо</th>
                        <th className="py-1.5 font-medium">Талбар</th>
                        <th className="py-1.5 font-medium">Хуучин</th>
                        <th className="py-1.5 font-medium">Шинэ</th>
                        <th className="py-1.5 font-medium">Хэрэглэгч</th>
                        <th className="py-1.5 font-medium">Шалтгаан</th>
                      </tr>
                    </thead>
                    <tbody>
                      {property.priceHistory.map((h) => (
                        <tr key={h.id} className="border-b border-line last:border-0">
                          <td className="py-2 text-xs text-subtle">{fmtDateTime(h.created_at)}</td>
                          <td className="py-2 text-muted">{h.field === "price" ? "Үнэ" : "Түрээсийн үнэ"}</td>
                          <td className="py-2 text-muted">{h.old_value != null ? fmtMNT(Number(h.old_value)) : "—"}</td>
                          <td className="py-2 font-semibold text-ink">{h.new_value != null ? fmtMNT(Number(h.new_value)) : "—"}</td>
                          <td className="py-2 text-muted">{h.changed_by_name ?? "—"}</td>
                          <td className="py-2 text-xs text-subtle">{h.reason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardBody>
            </Card>
          ) : null}

          {tab === "matching" ? (
            <MatchList
              rows={matches}
              perspective="property"
              targetId={property.id}
              basePath={basePath}
              canRecompute={property.status === "active"}
            />
          ) : null}

          {tab === "rental" ? (
            <div className="space-y-4">
              <Card>
                <CardBody className="space-y-3">
                  <h3 className="text-sm font-bold text-ink">Ашиглалтын статус (F-210/565)</h3>
                  {property.service_kind === "managed_rental" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={property.occupancy ?? ""}
                        onChange={(e) => e.target.value && run(() => setOccupancy(property.id, e.target.value as OccupancyStatus))}
                        className="w-56"
                        disabled={pending}
                      >
                        <option value="">— Сонгох —</option>
                        {OCCUPANCY_STATUSES.map((o) => (
                          <option key={o} value={o}>
                            {OCCUPANCY_STATUS_LABEL[o].label}
                          </option>
                        ))}
                      </Select>
                      <span className="text-xs text-subtle">Листингийн статусаас тусдаа; сул мөчлөг автоматаар түүхчлэгдэнэ (F-566).</span>
                    </div>
                  ) : (
                    <p className="text-sm text-subtle">Ашиглалтын статус зөвхөн менежменттэй түрээсэд хөтлөгдөнө.</p>
                  )}
                  {property.vacancies.length > 0 ? (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-subtle">Сул хоногийн мөчлөг (F-566/567)</p>
                      <ul className="space-y-1 text-sm text-muted">
                        {property.vacancies.map((v) => (
                          <li key={v.id}>
                            {fmtDate(v.started_on)} — {v.ended_on ? fmtDate(v.ended_on) : "одоог хүртэл"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardBody>
              </Card>

              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink">Тоолуур (F-214)</h3>
                    <Button size="sm" variant="outline" onClick={() => setMeterOpen(true)}>
                      <Plus className="size-4" /> Тоолуур нэмэх
                    </Button>
                  </div>
                  {property.meters.length === 0 ? (
                    <p className="text-sm text-subtle">Тоолуур бүртгэгдээгүй.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs text-subtle">
                          <th className="py-1.5 font-medium">Төрөл</th>
                          <th className="py-1.5 font-medium">Дугаар</th>
                          <th className="py-1.5 font-medium">Сүүлийн заалт</th>
                          <th className="py-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {property.meters.map((m) => (
                          <tr key={m.id} className="border-b border-line last:border-0">
                            <td className="py-2 text-ink">{m.meter_type}</td>
                            <td className="py-2 font-mono text-xs text-muted">{m.serial ?? "—"}</td>
                            <td className="py-2 text-muted">
                              {m.last_reading != null ? `${m.last_reading} (${m.last_read_on ? fmtDate(m.last_read_on) : ""})` : "—"}
                            </td>
                            <td className="py-2 text-right">
                              <Button size="sm" variant="ghost" onClick={() => { setReadingFor(m.id); setReadingValue(""); }}>
                                Заалт бүртгэх
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardBody>
              </Card>
            </div>
          ) : null}

          {tab === "docs" ? (
            <Card>
              <CardBody>
                <h3 className="mb-3 text-sm font-bold text-ink">Баримт, зураг (F-203/204/704)</h3>
                <EntityDocs entity="property" entityId={property.id} docs={docs} roles={roles} />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <ActivationChecklist propertyId={property.id} status={property.status} missing={missing} />
          <Card>
            <CardBody className="space-y-2 text-sm">
              <h3 className="text-sm font-bold text-ink">Бүс, салбар (F-207)</h3>
              <p className="text-muted">
                {property.zone_id ? "Бүсийн лавлахаас автомат тодорхойлогдсон." : "Бүсийн лавлахад тохирох мөр олдоогүй."}
              </p>
              {property.branch_override_reason ? (
                <p className="text-xs text-amber-700">Гар өөрчлөлтийн шалтгаан: {property.branch_override_reason}</p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Статус — шалтгаантай шилжилт */}
      <Modal
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title={statusTarget ? `Статус: ${CRM_PROPERTY_STATUS_LABEL[statusTarget.to].label}` : ""}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setStatusTarget(null)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() =>
                statusTarget &&
                run(() => setPropertyStatus(property.id, statusTarget.to, statusReason.trim()), () => setStatusTarget(null))
              }
              disabled={pending || !statusReason.trim()}
            >
              {pending ? "Шилжүүлж байна…" : "Шилжүүлэх"}
            </Button>
          </div>
        }
      >
        <Field label="Шалтгаан (заавал)" hint="Шилжилт бүр аудит логт бүртгэгдэнэ (F-218)">
          <Input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
        </Field>
      </Modal>

      {/* Үнэ өөрчлөх (F-208) */}
      <Modal
        open={priceOpen}
        onClose={() => setPriceOpen(false)}
        title="Үнэ өөрчлөх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setPriceOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(
                  () =>
                    updatePropertyPrice(property.id, {
                      price: newPrice ? Number(newPrice) : null,
                      rentPrice: newRent ? Number(newRent) : null,
                      reason: priceReason.trim(),
                    }),
                  () => setPriceOpen(false)
                )
              }
              disabled={pending || !priceReason.trim() || (!newPrice && !newRent)}
            >
              {pending ? "Хадгалж байна…" : "Хадгалах"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label={`Үнэ (одоо: ${property.price != null ? fmtMNT(Number(property.price)) : "—"})`}>
            <Input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Өөрчлөхгүй бол хоосон" />
          </Field>
          <Field label={`Түрээсийн үнэ (одоо: ${property.rent_price != null ? fmtMNT(Number(property.rent_price)) : "—"})`}>
            <Input type="number" value={newRent} onChange={(e) => setNewRent(e.target.value)} placeholder="Өөрчлөхгүй бол хоосон" />
          </Field>
          <Field label="Шалтгаан (заавал)">
            <Input value={priceReason} onChange={(e) => setPriceReason(e.target.value)} placeholder="Жишээ: зах зээлийн үнэлгээ шинэчлэгдсэн" />
          </Field>
        </div>
      </Modal>

      {/* Роль онооx/шилжүүлэх (F-206) */}
      <Modal
        open={roleOpen}
        onClose={() => setRoleOpen(false)}
        title="Агентын роль"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setRoleOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() => {
                const existing = property.roles.find((r) => r.role === roleKind);
                run(
                  () =>
                    existing
                      ? reassignPropertyRole(property.id, roleKind, roleAgent, roleReason.trim())
                      : assignPropertyRole(property.id, roleKind, roleAgent),
                  () => setRoleOpen(false)
                );
              }}
              disabled={
                pending ||
                !roleAgent ||
                (!!property.roles.find((r) => r.role === roleKind) && !roleReason.trim()) ||
                (roleKind === "sourcing" && !!property.roles.find((r) => r.role === "sourcing") && !canReassignSourcing)
              }
            >
              {pending ? "Хадгалж байна…" : "Хадгалах"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Роль">
            <Select value={roleKind} onChange={(e) => setRoleKind(e.target.value as CrmPropertyRole)}>
              {CRM_PROPERTY_ROLES.map((r) => (
                <option key={r} value={r}>
                  {CRM_PROPERTY_ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Агент">
            <Select value={roleAgent} onChange={(e) => setRoleAgent(e.target.value)}>
              <option value="">— Сонгох —</option>
              {agents.map((a) => (
                <option key={a.profileId} value={a.profileId}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          {property.roles.find((r) => r.role === roleKind) ? (
            <Field label="Шилжүүлэлтийн шалтгаан (заавал)">
              <Input value={roleReason} onChange={(e) => setRoleReason(e.target.value)} />
            </Field>
          ) : null}
          {roleKind === "sourcing" && property.roles.find((r) => r.role === "sourcing") && !canReassignSourcing ? (
            <p className="text-xs text-rose-700">
              Эх сурвалжийн ролийг зөвхөн Борлуулалтын захирал/ЧМТ шилжүүлнэ (F-206).
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Листингийн гэрээ */}
      <Modal
        open={agrOpen}
        onClose={() => setAgrOpen(false)}
        title="Листингийн гэрээ бүртгэх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAgrOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(
                  () =>
                    createListingAgreement({
                      propertyId: property.id,
                      number: agrNumber.trim(),
                      signedOn: agrSigned,
                      expiresOn: agrExpires,
                      specialTerms: agrTerms.trim() || null,
                    }),
                  () => setAgrOpen(false)
                )
              }
              disabled={pending || !agrNumber.trim() || !agrSigned || !agrExpires}
            >
              {pending ? "Хадгалж байна…" : "Бүртгэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Гэрээний дугаар">
            <Input value={agrNumber} onChange={(e) => setAgrNumber(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Гарын үсэг зурсан">
              <Input type="date" value={agrSigned} onChange={(e) => setAgrSigned(e.target.value)} />
            </Field>
            <Field label="Дуусах огноо" hint="Дуусахаас өмнө сануулга автомат (F-205)">
              <Input type="date" value={agrExpires} onChange={(e) => setAgrExpires(e.target.value)} />
            </Field>
          </div>
          <Field label="Онцгой нөхцөл">
            <Input value={agrTerms} onChange={(e) => setAgrTerms(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Тоолуур нэмэх */}
      <Modal
        open={meterOpen}
        onClose={() => setMeterOpen(false)}
        title="Тоолуур нэмэх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setMeterOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(() => addMeter(property.id, { meterType: meterType.trim(), serial: meterSerial.trim() || null }), () => setMeterOpen(false))
              }
              disabled={pending || !meterType.trim()}
            >
              {pending ? "Хадгалж байна…" : "Нэмэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Төрөл">
            <Input value={meterType} onChange={(e) => setMeterType(e.target.value)} placeholder="Цахилгаан / Ус / Дулаан" />
          </Field>
          <Field label="Серийн дугаар">
            <Input value={meterSerial} onChange={(e) => setMeterSerial(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Заалт бүртгэх */}
      <Modal
        open={!!readingFor}
        onClose={() => setReadingFor(null)}
        title="Тоолуурын заалт бүртгэх"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setReadingFor(null)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() =>
                readingFor &&
                run(() => addMeterReading(readingFor, { reading: Number(readingValue), readOn: readingDate }), () => setReadingFor(null))
              }
              disabled={pending || !readingValue || !readingDate}
            >
              {pending ? "Хадгалж байна…" : "Бүртгэх"}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Заалт">
            <Input type="number" value={readingValue} onChange={(e) => setReadingValue(e.target.value)} />
          </Field>
          <Field label="Огноо">
            <Input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Түлхүүрийн мэдээлэл (F-215) */}
      <Modal
        open={keyOpen}
        onClose={() => setKeyOpen(false)}
        title="Түлхүүрийн байршил, хариуцагч"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setKeyOpen(false)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() =>
                run(
                  () =>
                    updateProperty({
                      id: property.id,
                      keyLocation: keyLocation.trim() || null,
                      keyHolderId: keyHolder || null,
                    }),
                  () => setKeyOpen(false)
                )
              }
              disabled={pending}
            >
              {pending ? "Хадгалж байна…" : "Хадгалах"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Байршил" hint="Өөрчлөлт бүр түүхтэй (F-215)">
            <Input value={keyLocation} onChange={(e) => setKeyLocation(e.target.value)} placeholder="Оффисын сейф, шүүгээ 3" />
          </Field>
          <Field label="Хариуцагч">
            <Select value={keyHolder} onChange={(e) => setKeyHolder(e.target.value)}>
              <option value="">— Байхгүй —</option>
              {agents.map((a) => (
                <option key={a.profileId} value={a.profileId}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-subtle">{label}</p>
      <p className="text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
