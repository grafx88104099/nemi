"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, FileSignature, RefreshCcw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { LeaseChain } from "@/components/crm/LeaseChain";
import { InspectionShell } from "@/components/crm/InspectionShell";
import {
  activateLease,
  addDeduction,
  approveDeduction,
  giveNotice,
  recordDepositReceived,
  recordDepositReturn,
  renewLease,
  terminateLease,
} from "@/lib/actions/crm-leases";
import { recordPayment } from "@/lib/actions/crm-invoices";
import type { ArrearsRow, LeaseDetail } from "@/lib/queries-crm-rentals";
import {
  CRM_ROLE_LABEL,
  EXPENSE_BEARER_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_TYPE_LABEL,
  LEASE_STATUS_LABEL,
  PAYMENT_KIND_LABEL,
  type CrmRole,
} from "@/lib/constants-crm";

/**
 * Гэрээний карт (§4.1): гинж (F-504), нэхэмжлэх/төлбөр, барьцаа/суутгал
 * (F-540–544), үзлэг (F-575–579), хоцролтын шатлалын түүх (F-536).
 */

const EXPENSE_LABEL: Record<string, string> = {
  electricity: "Цахилгаан",
  water: "Ус",
  heating: "Дулаан",
  hoa: "СӨХ",
  internet: "Интернет",
  other: "Бусад",
};

const DEDUCTION_LABEL: Record<string, string> = {
  damage: "Хохирол",
  unpaid_rent: "Төлөгдөөгүй түрээс",
  utility_debt: "Ашиглалтын өр",
};

export function LeaseDetailShell({
  lease,
  arrears,
  roles,
}: {
  lease: LeaseDetail;
  arrears: ArrearsRow[];
  roles: CrmRole[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState("general");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isPm = roles.includes("property_manager");
  const isFinance = roles.includes("finance");
  const isManager = roles.some((r) => ["sales_director", "ops_qc", "ceo"].includes(r));
  const canApprove = isFinance || isManager;

  // Модалууд
  const [activateOpen, setActivateOpen] = useState(false);
  const [signedDocId, setSignedDocId] = useState("");
  const [renewOpen, setRenewOpen] = useState(false);
  const [rn, setRn] = useState({
    startOn: lease.end_on,
    endOn: "",
    monthlyRent: String(lease.monthly_rent),
    depositAmount: String(lease.deposit_amount),
    signedDocId: "",
  });
  const [termOpen, setTermOpen] = useState(false);
  const [termReason, setTermReason] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
  const [dep, setDep] = useState({ receivedOn: "", holder: "pmc" as "landlord" | "pmc" });
  const [returnOpen, setReturnOpen] = useState(false);
  const [ret, setRet] = useState({ amount: "", returnedOn: "" });
  const [dedOpen, setDedOpen] = useState(false);
  const [ded, setDed] = useState({ category: "damage", amount: "", rationale: "", evidenceItemId: "" });
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({
    invoiceId: "",
    kind: "income" as "income" | "control",
    paidOn: new Date().toISOString().slice(0, 10),
    amount: "",
    method: "bank",
  });

  const st = LEASE_STATUS_LABEL[lease.status];
  const approvedDeductions = lease.deductions.filter((d) => d.approved_at);
  const totalDeducted = approvedDeductions.reduce((s, d) => s + Number(d.amount), 0);
  const moveOutItems = lease.inspections
    .filter((i) => i.kind === "move_out")
    .flatMap((i) => i.items);

  function run(fn: () => Promise<{ ok?: boolean; id?: string; error?: string }>, close?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      close?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <BackLink href="/office/crm/rentals" label="Түрээсийн багц руу буцах" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">{lease.number}</h1>
            <Badge tone={st.tone}>{st.label}</Badge>
            {lease.is_managed && <Badge tone="blue">Менежменттэй</Badge>}
            {lease.duration_tier && <Badge tone="neutral">Шатлал: {lease.duration_tier}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">
            {lease.property_number} · {lease.property_name} — {lease.start_on} → {lease.end_on}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lease.status === "draft" && (
            <Button size="sm" onClick={() => setActivateOpen(true)}>
              <FileSignature className="size-4" /> Идэвхжүүлэх
            </Button>
          )}
          {lease.status === "active" && (
            <>
              {(isPm || isManager) && (
                <Button size="sm" variant="secondary" onClick={() => setRenewOpen(true)}>
                  <RefreshCcw className="size-4" /> Сунгах (Д-24)
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => run(() => giveNotice(lease.id))} disabled={pending}>
                <BellRing className="size-4" /> Гарах мэдэгдэл (Д-19)
              </Button>
              {isManager && (
                <Button size="sm" variant="danger" onClick={() => setTermOpen(true)}>
                  <XCircle className="size-4" /> Цуцлах
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "general", label: "Ерөнхий" },
          { value: "invoices", label: `Нэхэмжлэх (${lease.invoices.length})` },
          { value: "deposit", label: "Барьцаа" },
          { value: "inspections", label: `Үзлэг (${lease.inspections.length})` },
        ]}
      />

      {tab === "general" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardBody className="space-y-2 text-sm">
              <h2 className="font-semibold text-ink">Гэрээний мэдээлэл</h2>
              <Row k="Түрээслэгч" v={lease.tenant_name ?? "—"} />
              <Row k="Түрээслүүлэгч" v={lease.landlord_name ?? "—"} />
              <Row k="Сарын түрээс" v={`${lease.monthly_rent.toLocaleString()}₮`} />
              <Row k="Төлбөрийн өдөр" v={`Сарын ${lease.payment_day}`} />
              <Row k="Grace хугацаа" v={`${lease.grace_days} хоног`} />
              {lease.is_managed && (
                <Row
                  k="Менежментийн гэрээ"
                  v={`${lease.agreement_number ?? "—"} (хөлс ${lease.agreement_fee_pct ?? "—"}%)`}
                />
              )}
              {lease.transaction_id && (
                <Row
                  k="Хэлцэл"
                  v={
                    <Link href={`/office/crm/transactions/${lease.transaction_id}`} className="text-brand-700 hover:underline">
                      Хэлцлийн хавтас →
                    </Link>
                  }
                />
              )}
              {lease.termination_reason && <Row k="Цуцлалтын шалтгаан" v={lease.termination_reason} />}
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-2 text-sm">
              <h2 className="font-semibold text-ink">Зардлын хариуцлагын хуваарь (F-505)</h2>
              {lease.expense_lines.length === 0 ? (
                <p className="text-muted">Хуваарь бүртгэгдээгүй.</p>
              ) : (
                lease.expense_lines.map((l) => (
                  <Row
                    key={l.expense_type}
                    k={EXPENSE_LABEL[l.expense_type] ?? l.expense_type}
                    v={EXPENSE_BEARER_LABEL[l.bearer]}
                  />
                ))
              )}
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold text-ink">Сунгалтын гинж (F-504)</h2>
              <LeaseChain chain={lease.chain} currentId={lease.id} />
            </CardBody>
          </Card>
          {arrears.length > 0 && (
            <Card className="lg:col-span-2">
              <CardBody>
                <h2 className="mb-2 text-sm font-semibold text-ink">Хоцролтын шатлалын түүх (F-536)</h2>
                <ul className="space-y-1 text-sm">
                  {arrears.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-muted">
                      <Badge tone={a.step >= 3 ? "rose" : "amber"}>Шат {a.step}</Badge>
                      Хариуцагч: {CRM_ROLE_LABEL[a.assigned_role]} · {new Date(a.escalated_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            {(isPm || isFinance) && (
              <Button size="sm" onClick={() => setPayOpen(true)}>
                Төлбөр бүртгэх (F-525)
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Дугаар</th>
                  <th className="px-4 py-3 font-medium">Төрөл</th>
                  <th className="px-4 py-3 font-medium">Сар</th>
                  <th className="px-4 py-3 font-medium">Эцсийн хугацаа</th>
                  <th className="px-4 py-3 font-medium">Дүн</th>
                  <th className="px-4 py-3 font-medium">Төлсөн</th>
                  <th className="px-4 py-3 font-medium">Төлөв</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lease.invoices.map((inv) => {
                  const ist = INVOICE_STATUS_LABEL[inv.status];
                  return (
                    <tr key={inv.id} className="hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <Link
                          href={`/office/crm/rentals/invoices/${inv.id}/print`}
                          className="font-semibold text-brand-700 hover:underline"
                        >
                          {inv.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{INVOICE_TYPE_LABEL[inv.type]}</td>
                      <td className="px-4 py-3 text-muted">{inv.period_month?.slice(0, 7) ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{inv.due_on}</td>
                      <td className="px-4 py-3 text-ink">{Number(inv.amount).toLocaleString()}₮</td>
                      <td className="px-4 py-3 text-muted">{Math.round(inv.paid_mnt).toLocaleString()}₮</td>
                      <td className="px-4 py-3">
                        <Badge tone={ist.tone}>{ist.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
                {lease.invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted">
                      Нэхэмжлэх алга — менежменттэй гэрээнд сарын нэхэмжлэх cron-оор автомат үүснэ (Д-13).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold text-ink">Төлбөрийн бүртгэл (F-525/526)</h3>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Огноо</th>
                  <th className="px-4 py-3 font-medium">Төрөл</th>
                  <th className="px-4 py-3 font-medium">Дүн</th>
                  <th className="px-4 py-3 font-medium">Хэлбэр</th>
                  <th className="px-4 py-3 font-medium">Санхүү баталгаажилт (F-527)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lease.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3 text-muted">{p.paid_on}</td>
                    <td className="px-4 py-3">
                      <Badge tone={p.kind === "income" ? "green" : "neutral"}>{PAYMENT_KIND_LABEL[p.kind]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {Number(p.amount).toLocaleString()} {p.currency}
                      {p.currency !== "MNT" && (
                        <span className="ml-1 text-xs text-muted">({Math.round(p.amount_mnt).toLocaleString()}₮)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{p.method}</td>
                    <td className="px-4 py-3">
                      {p.finance_verified_at ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="size-4" /> Баталгаажсан
                        </span>
                      ) : (
                        <span className="text-amber-600">Хүлээгдэж буй</span>
                      )}
                    </td>
                  </tr>
                ))}
                {lease.payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">
                      Төлбөр бүртгэгдээгүй.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "deposit" && (
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-2 text-sm">
              <h2 className="font-semibold text-ink">Барьцаа төлбөр (F-540)</h2>
              <Row k="Дүн" v={`${lease.deposit_amount.toLocaleString()}₮`} />
              <Row
                k="Хүлээн авсан"
                v={
                  lease.deposit_received_on
                    ? `${lease.deposit_received_on} (${lease.deposit_holder ? EXPENSE_BEARER_LABEL[lease.deposit_holder] : "—"} хадгална)`
                    : "Бүртгэгдээгүй"
                }
              />
              <Row k="Батлагдсан суутгал" v={`${totalDeducted.toLocaleString()}₮`} />
              <Row
                k="Буцаан олгосон"
                v={
                  lease.deposit_returned_on
                    ? `${Number(lease.deposit_returned_amount ?? 0).toLocaleString()}₮ (${lease.deposit_returned_on})`
                    : "Хийгдээгүй (Д-23 хяналттай)"
                }
              />
              <div className="flex flex-wrap gap-2 pt-2">
                {!lease.deposit_received_on && (isPm || isFinance) && (
                  <Button size="sm" variant="outline" onClick={() => setDepositOpen(true)}>
                    Хүлээн авалт бүртгэх
                  </Button>
                )}
                {!lease.deposit_returned_on && (isPm || isFinance) && (
                  <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)}>
                    Буцаан олголт бүртгэх (F-544)
                  </Button>
                )}
                {isPm && (
                  <Button size="sm" onClick={() => setDedOpen(true)}>
                    Суутгал нэмэх (F-541)
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>

          <h3 className="text-sm font-semibold text-ink">Суутгалын задаргаа (F-541/542)</h3>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Ангилал</th>
                  <th className="px-4 py-3 font-medium">Дүн</th>
                  <th className="px-4 py-3 font-medium">Үндэслэл</th>
                  <th className="px-4 py-3 font-medium">Баталгаажилт (F-543)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lease.deductions.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3 text-ink">{DEDUCTION_LABEL[d.category] ?? d.category}</td>
                    <td className="px-4 py-3 text-ink">{Number(d.amount).toLocaleString()}₮</td>
                    <td className="px-4 py-3 text-muted">{d.rationale}</td>
                    <td className="px-4 py-3">
                      {d.approved_at ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="size-4" /> Батлагдсан
                        </span>
                      ) : canApprove ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(() => approveDeduction(d.id, lease.id))}
                        >
                          Батлах
                        </Button>
                      ) : (
                        <span className="text-amber-600">Батлагдаагүй (менежер/Санхүү)</span>
                      )}
                    </td>
                  </tr>
                ))}
                {lease.deductions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted">
                      Суутгал бүртгэгдээгүй — суутгал бүр гарах үзлэгийн нотолгоотой байх ёстой (F-542).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "inspections" && (
        <InspectionShell leaseId={lease.id} inspections={lease.inspections} canWrite={isPm || roles.includes("agent")} />
      )}

      {/* ── Модалууд ── */}

      <Modal
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
        title="Гэрээ идэвхжүүлэх (F-501/507)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setActivateOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() => run(() => activateLease(lease.id, signedDocId), () => setActivateOpen(false))}
            >
              Идэвхжүүлэх
            </Button>
          </div>
        }
      >
        <Field
          label="Гарын үсэгтэй хувийн баримтын ID (crm_documents)"
          hint="Идэвхжүүлэхэд гарын үсэгтэй хувь хавсрагдсан байх ёстой (F-507). Баримтыг хэлцлийн хавтас/баримтын модулиар байршуулна."
        >
          <Input value={signedDocId} onChange={(e) => setSignedDocId(e.target.value)} placeholder="UUID" />
        </Field>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        title="Гэрээ сунгах (F-571, Д-24)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenewOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    renewLease(lease.id, {
                      startOn: rn.startOn,
                      endOn: rn.endOn,
                      monthlyRent: Number(rn.monthlyRent),
                      depositAmount: Number(rn.depositAmount) || 0,
                      signedDocId: rn.signedDocId,
                    }),
                  () => setRenewOpen(false)
                )
              }
            >
              Сунгах
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Хуучин гэрээ «Сунгагдсан» болж, шинэ гэрээ гинжин холбоостой «Идэвхтэй»-ээр үүснэ (F-501/504).
            Эхний богино гэрээ 12 сараас хэтэрсэн ч зуучлалын хөлс автоматаар нөхөн нэмэгдэхгүй (F-572).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Шинэ эхлэх огноо" hint={`Хуучны дуусах өдөр: ${lease.end_on}`}>
              <Input type="date" value={rn.startOn} onChange={(e) => setRn({ ...rn, startOn: e.target.value })} />
            </Field>
            <Field label="Шинэ дуусах огноо">
              <Input type="date" value={rn.endOn} onChange={(e) => setRn({ ...rn, endOn: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Шинэ сарын түрээс (₮)">
              <Input type="number" value={rn.monthlyRent} onChange={(e) => setRn({ ...rn, monthlyRent: e.target.value })} />
            </Field>
            <Field label="Барьцааны дүн (₮)">
              <Input
                type="number"
                value={rn.depositAmount}
                onChange={(e) => setRn({ ...rn, depositAmount: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Бичгэн баталгаажилтын баримтын ID (F-571)">
            <Input value={rn.signedDocId} onChange={(e) => setRn({ ...rn, signedDocId: e.target.value })} placeholder="UUID" />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={termOpen}
        onClose={() => setTermOpen(false)}
        title="Гэрээ цуцлах (F-573, Д-23)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTermOpen(false)}>
              Болих
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => run(() => terminateLease(lease.id, { reason: termReason }), () => setTermOpen(false))}
            >
              Цуцлах
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Цуцлалтад нотлох баримтын бүрдэл (гэрээ, төлбөрийн түүх, гомдол, объектын нөхцөл) шаардлагатай
            (F-573). Цуцлалтын дараа гарах үзлэг + барьцааны тооцооны даалгавар автомат үүснэ (Д-23).
          </p>
          <Field label="Шалтгаан (заавал)">
            <Input value={termReason} onChange={(e) => setTermReason(e.target.value)} placeholder="Жишээ: түрээслэгчийн хүсэлтээр…" />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        title="Барьцаа хүлээн авалт (F-540)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDepositOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(() => recordDepositReceived(lease.id, dep), () => setDepositOpen(false))
              }
            >
              Бүртгэх
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Хүлээн авсан огноо">
            <Input type="date" value={dep.receivedOn} onChange={(e) => setDep({ ...dep, receivedOn: e.target.value })} />
          </Field>
          <Field label="Хадгалагч тал">
            <Select value={dep.holder} onChange={(e) => setDep({ ...dep, holder: e.target.value as "landlord" | "pmc" })}>
              <option value="pmc">PMC</option>
              <option value="landlord">Өмчлөгч</option>
            </Select>
          </Field>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Барьцаа буцаан олголт (F-544)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReturnOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => recordDepositReturn(lease.id, { amount: Number(ret.amount), returnedOn: ret.returnedOn }),
                  () => setReturnOpen(false)
                )
              }
            >
              Бүртгэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Байвал зохих дүн = барьцаа − батлагдсан суутгал ={" "}
            <b className="text-ink">{Math.max(0, lease.deposit_amount - totalDeducted).toLocaleString()}₮</b>.
            Батлагдаагүй суутгалтай үед буцаан олголт бүртгэгдэхгүй (F-543).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Буцаан олгосон дүн (₮)">
              <Input type="number" value={ret.amount} onChange={(e) => setRet({ ...ret, amount: e.target.value })} />
            </Field>
            <Field label="Огноо">
              <Input type="date" value={ret.returnedOn} onChange={(e) => setRet({ ...ret, returnedOn: e.target.value })} />
            </Field>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={dedOpen}
        onClose={() => setDedOpen(false)}
        title="Барьцааны суутгал (F-541/542)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDedOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    addDeduction(lease.id, {
                      category: ded.category as "damage" | "unpaid_rent" | "utility_debt",
                      amount: Number(ded.amount),
                      rationale: ded.rationale,
                      evidenceItemId: ded.evidenceItemId,
                    }),
                  () => setDedOpen(false)
                )
              }
            >
              Нэмэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ангилал">
              <Select value={ded.category} onChange={(e) => setDed({ ...ded, category: e.target.value })}>
                {Object.entries(DEDUCTION_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Дүн (₮)">
              <Input type="number" value={ded.amount} onChange={(e) => setDed({ ...ded, amount: e.target.value })} />
            </Field>
          </div>
          <Field label="Үндэслэл">
            <Input value={ded.rationale} onChange={(e) => setDed({ ...ded, rationale: e.target.value })} />
          </Field>
          <Field
            label="Гарах үзлэгийн нотолгооны мөр (F-542 — заавал)"
            hint={moveOutItems.length === 0 ? "Гарах үзлэг бүртгэгдээгүй байна — эхлээд Үзлэг таб дээр move-out үзлэг бүртгэнэ." : undefined}
          >
            <Select value={ded.evidenceItemId} onChange={(e) => setDed({ ...ded, evidenceItemId: e.target.value })}>
              <option value="">— Сонгох —</option>
              {moveOutItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.room ? `${it.room} — ` : ""}
                  {it.item} ({it.condition}){it.discrepancy ? " · ЗӨРҮҮТЭЙ" : ""}
                </option>
              ))}
            </Select>
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Төлбөр бүртгэх (F-525/526)"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              Болих
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    recordPayment({
                      invoiceId: pay.invoiceId || null,
                      leaseId: lease.id,
                      kind: pay.kind,
                      paidOn: pay.paidOn,
                      amount: Number(pay.amount),
                      method: pay.method as "bank" | "cash" | "foreign" | "virtual" | "other",
                    }),
                  () => setPayOpen(false)
                )
              }
            >
              Бүртгэх
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Нэхэмжлэх (сонголтоор)">
            <Select value={pay.invoiceId} onChange={(e) => setPay({ ...pay, invoiceId: e.target.value })}>
              <option value="">— Нэхэмжлэхгүй (гэрээний түвшинд) —</option>
              {lease.invoices
                .filter((i) => i.status === "sent" || i.status === "partially_paid")
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} · {Number(i.amount).toLocaleString()}₮ · үлдэгдэл{" "}
                    {Math.max(0, i.amount - i.paid_mnt).toLocaleString()}₮
                  </option>
                ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Төрөл (F-526)" hint="Зөвхөн орлогын бүртгэл шимтгэлийн суурь болно">
              <Select value={pay.kind} onChange={(e) => setPay({ ...pay, kind: e.target.value as "income" | "control" })}>
                <option value="income">Орлогын (PMC-д орсон)</option>
                <option value="control">Хяналтын (өмчлөгчид шууд)</option>
              </Select>
            </Field>
            <Field label="Хэлбэр" hint="Бэлэн/гадаад/виртуал ≥20 сая ₮ → автомат дохио (Д-25)">
              <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                <option value="bank">Банк</option>
                <option value="cash">Бэлэн мөнгө</option>
                <option value="foreign">Гадаад төлбөр</option>
                <option value="virtual">Виртуал хөрөнгө</option>
                <option value="other">Бусад</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Огноо">
              <Input type="date" value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} />
            </Field>
            <Field label="Дүн (₮)">
              <Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            </Field>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span className="text-right text-ink">{v}</span>
    </div>
  );
}
