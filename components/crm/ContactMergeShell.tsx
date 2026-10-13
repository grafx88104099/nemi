"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, GitMerge } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { BackLink } from "@/components/ui/back-link";
import { mergeContacts } from "@/lib/actions/crm-leads";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { ContactDetail } from "@/lib/queries-crm-contacts";
import { CONSENT_STATUS_LABEL, type ConsentStatus } from "@/lib/constants-crm";
import { MERGE_FIELDS, MERGE_FIELD_LABEL, type MergeField } from "@/lib/validation/crm";

/**
 * Merge дэлгэц (F-108/109) — зөвхөн ops_qc (сервер талд давхар шалгагдана).
 * Талбар тус бүрээр аль утга үлдэхийг сонгоно; холбоотой БҮХ бичлэг автоматаар
 * үндсэн бүртгэл рүү шилжинэ; устгагдах тал soft-archive, түүх устгагдахгүй.
 */
export function ContactMergeShell({
  a,
  b,
  basePath,
}: {
  a: ContactDetail;
  b: ContactDetail;
  basePath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Анхны (хамгийн эрт) бүртгэл анхдагчаар үндсэн нь (P-01 алхам 3).
  const [swapped, setSwapped] = useState(false);
  const primary = useMemo(() => {
    const earlierIsA = a.created_at <= b.created_at;
    return swapped ? (earlierIsA ? b : a) : earlierIsA ? a : b;
  }, [a, b, swapped]);
  const merged = primary.id === a.id ? b : a;

  const [choices, setChoices] = useState<Partial<Record<MergeField, "primary" | "merged">>>({});
  const [amlNote, setAmlNote] = useState("");

  function fieldValue(c: ContactDetail, f: MergeField): string {
    switch (f) {
      case "last_name":
        return c.last_name ?? "—";
      case "first_name":
        return c.first_name ?? "—";
      case "org_name":
        return c.org_name ?? "—";
      case "display_name":
        return c.display_name;
      case "source_id":
        return c.source_label ?? "—";
      case "source_detail":
        return c.source_detail ?? "—";
      case "branch_id":
        return c.branch_id ? "Салбартай" : "—";
      case "consent":
        return CONSENT_STATUS_LABEL[c.consent as ConsentStatus]?.label ?? c.consent;
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await mergeContacts({
        primaryId: primary.id,
        mergedId: merged.id,
        choices: choices as Record<string, "primary" | "merged">,
        amlApprovalNote: amlNote.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Нэгтгэхэд алдаа гарлаа.");
        return;
      }
      router.push(`${basePath}/contacts/${primary.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <BackLink href={`${basePath}/contacts`} label="Харилцагчийн сан" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Бүртгэл нэгтгэх (F-108)</h1>
          <p className="text-sm text-muted">
            Холбоотой бүх бичлэг (сэжим, профайл, боломж, хэлцэл, баримт…) үндсэн бүртгэл рүү автоматаар шилжинэ;
            устгагдах талын түүх сэргээгдэхүйц архивлагдана.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setSwapped((v) => !v)}>
            <ArrowLeftRight className="size-4" /> Үндсэнийг солих
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            <GitMerge className="size-4" /> {pending ? "Нэгтгэж байна…" : "Нэгтгэх"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  <th className="px-5 py-2.5 font-medium">Талбар</th>
                  <th className="px-5 py-2.5 font-medium">
                    <div className="flex items-center gap-2">
                      <Badge tone="green">Үндсэн (үлдэнэ)</Badge>
                      <span className="font-semibold text-ink">{primary.display_name}</span>
                      <span className="font-mono text-subtle">{primary.number}</span>
                    </div>
                  </th>
                  <th className="px-5 py-2.5 font-medium">
                    <div className="flex items-center gap-2">
                      <Badge tone="amber">Нэгтгэгдэнэ (архив)</Badge>
                      <span className="font-semibold text-ink">{merged.display_name}</span>
                      <span className="font-mono text-subtle">{merged.number}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line bg-surface-2/40">
                  <td className="px-5 py-2 text-xs text-subtle">Бүртгэсэн огноо (эзэмшлийн нотолгоо)</td>
                  <td className="px-5 py-2 text-xs text-muted">{fmtDateTime(primary.created_at)}</td>
                  <td className="px-5 py-2 text-xs text-muted">{fmtDateTime(merged.created_at)}</td>
                </tr>
                {MERGE_FIELDS.map((f) => {
                  const pv = fieldValue(primary, f);
                  const mv = fieldValue(merged, f);
                  const same = pv === mv;
                  const sel = choices[f] ?? "primary";
                  return (
                    <tr key={f} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 font-medium text-ink">{MERGE_FIELD_LABEL[f]}</td>
                      {(["primary", "merged"] as const).map((side) => {
                        const val = side === "primary" ? pv : mv;
                        return (
                          <td key={side} className="px-5 py-2.5">
                            <label
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                                sel === side && !same
                                  ? "border-brand-300 bg-brand-50"
                                  : "border-transparent hover:border-line"
                              } ${same ? "opacity-60" : ""}`}
                            >
                              <input
                                type="radio"
                                name={`field-${f}`}
                                checked={sel === side}
                                disabled={same}
                                onChange={() => setChoices((prev) => ({ ...prev, [f]: side }))}
                                className="size-4"
                              />
                              <span className="text-sm text-ink">{val}</span>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h3 className="text-sm font-bold text-ink">Автоматаар нэгдэх зүйлс</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted">
              <li>Утас: {primary.phones.length + merged.phones.length} дугаар (давхардал нэгтгэгдэнэ)</li>
              <li>И-мэйл: {primary.emails.length + merged.emails.length} хаяг</li>
              <li>Харилцагчийн төрлүүд нэгтгэгдэнэ; шошго хадгалагдана</li>
              <li>Сэжим, профайл, боломж, хэлцэл, түрээс, баримт — бүгд үндсэн рүү</li>
              <li>
                Анхны бүртгэсэн огноо ({fmtDate(primary.created_at <= merged.created_at ? primary.created_at : merged.created_at)})
                + эх сурвалж merge түүхэд хадгалагдана (F-109)
              </li>
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="text-sm font-bold text-ink">МУТСТ-ийн зөвшөөрөл (нөхцөлт)</h3>
            <p className="mt-1 text-xs text-muted">
              Аль нэг бүртгэл нээлттэй МУТСТ кейстэй бол МУТСТ-ийн ажилтны зөвшөөрлийн тэмдэглэл заавал (F-109);
              хоёулаа идэвхтэй гэрээтэй бол систем нэгтгэхээс татгалзана.
            </p>
            <Field label="Зөвшөөрлийн тэмдэглэл">
              <Input value={amlNote} onChange={(e) => setAmlNote(e.target.value)} placeholder="МУТСТ-ийн ажилтны нэр, огноо" />
            </Field>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
