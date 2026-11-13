"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileSignature, RefreshCw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { BrokerageStatusBadge, CodeChip, ConfirmDialog } from "@/components/crm2/ui";
import { createBrokerageDraft, renewBrokerage, submitBrokerage, updateBrokerageDraft } from "@/lib/crm2/actions/brokerage";
import { renewableExpired } from "@/components/crm2/staff/card/logic";
import { deleteBrokerageFile } from "@/lib/crm2/actions/media";
import { fmtIsoDate, ubToday } from "@/lib/crm2/datetime";
import { validateDocFile } from "@/lib/crm2/files";
import { formatCommission } from "@/lib/crm2/money";
import type { BrokerageItem } from "@/lib/crm2/queries/properties";
import { brokerageCreateSchema, brokerageUpdateSchema } from "@/lib/crm2/schemas";
import { fileLimits, type Crm2Settings } from "@/lib/crm2/settings";
import { uploadBrokerageFile, uploadMany } from "@/lib/crm2/storage";
import type { Crm2StaffMember } from "@/lib/crm2/types";

import { BrokerageFields, DocList, type DocItem } from "./BrokerageFields";
import { FormAlert, FormSection } from "./fields";
import {
  brokerageHasInput,
  brokeragePayload,
  brokerageSubmitMissing,
  brokerageToForm,
  diffPayload,
  emptyBrokerageForm,
  fieldErrors,
  missingSentence,
  type BrokerageFormState,
  type OwnerRef,
} from "./form-model";

const LIVE = new Set(["draft", "pending", "active"]);

/**
 * Засах горимын зуучлалын гэрээний хэсэг: засах эрхтэй ноорог гэрээг засах,
 * файл хавсаргах, батлуулахаар илгээх; хүчинтэй гэрээгүй бол шинэ ноорог гэрээ
 * үүсгэх. Илгээсэн/батлагдсан гэрээний үйлдэл (батлах, буцааж авах, сунгах)
 * хөрөнгийн картын «Зуучлалын гэрээ» табад.
 */
export function BrokerageEditSection({
  propertyId,
  officeId,
  contracts,
  propertyOwner,
  staff,
  responsibleStaff,
  me,
  settings,
  agreementHref,
}: {
  propertyId: string;
  officeId: string;
  contracts: BrokerageItem[];
  propertyOwner: OwnerRef | null;
  staff: Crm2StaffMember[];
  /** Гэрээний хариуцагч болгож болох ажилтан (brokerageResponsibleAllowed). */
  responsibleStaff?: Crm2StaffMember[];
  me: string;
  settings: Crm2Settings;
  /** Картын «Зуучлалын гэрээ» таб. */
  agreementHref: string;
}) {
  const live = contracts.filter((c) => LIVE.has(c.status));
  const draft = live.find((c) => c.status === "draft" && c.canEditDraft) ?? null;
  const others = live.filter((c) => c !== draft);
  // Дууссан гэрээтэй бол шинэ хугацааг «Сунгах»-аар (хувилбар холбогдоно), холбоогүй шинэ гэрээгээр биш.
  const toRenew = live.length === 0 ? renewableExpired(contracts) : null;

  return (
    <FormSection
      id="staff-brokerage"
      title="Зуучлалын гэрээ"
      icon={FileSignature}
      locked
      description="Эзэнтэй байгуулсан гэрээ батлагдмагц хөрөнгө Staff-д идэвхтэй болно."
    >
      {others.length ? (
        <ul className="space-y-2">
          {others.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5">
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <CodeChip code={c.number} />
                <BrokerageStatusBadge status={c.status} />
                <span className="text-muted">
                  {[
                    c.start_date && c.end_date ? `${fmtIsoDate(c.start_date)} – ${fmtIsoDate(c.end_date)}` : null,
                    formatCommission(c.commission_type, c.commission_value, c.commission_currency),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <Link href={agreementHref} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                Гэрээний таб
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {draft ? (
        <ContractEditor
          key={draft.id}
          contract={draft}
          propertyId={propertyId}
          officeId={officeId}
          propertyOwner={propertyOwner}
          staff={staff}
          responsibleStaff={responsibleStaff}
          me={me}
          settings={settings}
        />
      ) : toRenew ? (
        <RenewPrompt contract={toRenew} agreementHref={agreementHref} />
      ) : live.length === 0 ? (
        <>
          {contracts.length ? (
            <p className="text-sm text-muted">Өмнөх гэрээ цуцлагдсан — шинэ гэрээ өмнөхтэй холбогдохгүй.</p>
          ) : null}
          <ContractEditor
            propertyId={propertyId}
            officeId={officeId}
            propertyOwner={propertyOwner}
            staff={staff}
            responsibleStaff={responsibleStaff}
            me={me}
            settings={settings}
          />
        </>
      ) : others.some((c) => c.status === "draft") ? (
        <p className="text-sm text-muted">Ноорог гэрээг засах эрхгүй байна — гэрээний хариуцагч засна.</p>
      ) : (
        <p className="text-sm text-muted">Сунгалт, цуцлалт, батлалт хөрөнгийн картын «Зуучлалын гэрээ» табад.</p>
      )}
    </FormSection>
  );
}

/** Дууссан гэрээг сунгах: шинэ ноорог хувилбар үүсгээд (нөхцөл хуулагдана) энд засна. */
function RenewPrompt({ contract, agreementHref }: { contract: BrokerageItem; agreementHref: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function renew() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await renewBrokerage(contract.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Сунгалтын ноорог үүслээ", { description: "Шинэ хугацаа, файлаа оруулаад батлуулахаар илгээнэ үү." });
      router.refresh();
    } catch (err) {
      console.error("RenewPrompt:", err);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex flex-wrap items-center gap-2">
        <CodeChip code={contract.number} />
        <BrokerageStatusBadge status={contract.status} />
        <span>
          {contract.end_date ? `${fmtIsoDate(contract.end_date)}-нд дууссан. ` : "Дууссан. "}
          Шинэ хугацааны гэрээг сунгалтаар үүсгэнэ — өмнөх гэрээний хувилбартай холбогдоно.
        </span>
      </p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {contract.canRenew ? (
        <Button type="button" onClick={renew} disabled={pending}>
          <RefreshCw className="size-4" aria-hidden /> {pending ? "Түр хүлээнэ үү…" : "Сунгах"}
        </Button>
      ) : (
        <p className="text-sm">
          Сунгах эрхгүй байна — гэрээний хариуцагч эсвэл хөрөнгийн засварлагч сунгана.{" "}
          <Link href={agreementHref} className="font-semibold underline">
            Гэрээний таб
          </Link>
        </p>
      )}
    </div>
  );
}

function ownerOf(c: BrokerageItem | undefined, fallback: OwnerRef | null): OwnerRef | null {
  if (!c) return fallback;
  if (!c.owner_contact_id) return null;
  return c.owner ? { id: c.owner.id, name: c.owner.full_name, code: c.owner.code } : { id: c.owner_contact_id, name: "Харилцагч" };
}

function ContractEditor({
  contract,
  propertyId,
  officeId,
  propertyOwner,
  staff,
  responsibleStaff,
  me,
  settings,
}: {
  /** Засах ноорог; өгөөгүй бол шинэ гэрээ. */
  contract?: BrokerageItem;
  propertyId: string;
  officeId: string;
  propertyOwner: OwnerRef | null;
  staff: Crm2StaffMember[];
  responsibleStaff?: Crm2StaffMember[];
  me: string;
  settings: Crm2Settings;
}) {
  const router = useRouter();
  const limits = fileLimits(settings);
  const initial = React.useMemo(
    () => ({ form: contract ? brokerageToForm(contract) : emptyBrokerageForm(), owner: ownerOf(contract, propertyOwner) }),
    [contract, propertyOwner]
  );
  const [form, setForm] = React.useState<BrokerageFormState>(initial.form);
  const [owner, setOwner] = React.useState<OwnerRef | null>(initial.owner);
  const [baseline, setBaseline] = React.useState(initial);
  // Хадгалсны дараа серверээс ирсэн мөрөөр сэргээнэ.
  const [syncedAt, setSyncedAt] = React.useState(contract?.updated_at ?? null);
  if (contract && contract.updated_at !== syncedAt) {
    setSyncedAt(contract.updated_at);
    setForm(initial.form);
    setOwner(initial.owner);
    setBaseline(initial);
  }

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [uploadText, setUploadText] = React.useState<string | null>(null);
  const [fileErrors, setFileErrors] = React.useState<string[]>([]);
  const [removeFile, setRemoveFile] = React.useState<DocItem | null>(null);

  const files = contract?.files ?? [];
  const payload = brokeragePayload(form, owner?.id ?? null);

  function validate(): boolean {
    const parsed = contract
      ? brokerageUpdateSchema.safeParse({ contract_id: contract.id, ...payload })
      : brokerageCreateSchema.safeParse({ property_id: propertyId, ...payload });
    if (parsed.success) {
      setErrors({});
      return true;
    }
    setErrors(fieldErrors(parsed.error));
    setServerError("Гэрээний алдаатай талбаруудыг засна уу.");
    return false;
  }

  /** Өөрчлөлтийг хадгална → амжилттай бол true. */
  async function save(quiet = false): Promise<boolean> {
    setServerError(null);
    if (!validate()) return false;
    if (!contract) {
      if (!brokerageHasInput(form) && !owner) {
        setServerError("Гэрээний мэдээллийг бөглөнө үү.");
        return false;
      }
      const res = await createBrokerageDraft({ property_id: propertyId, ...payload });
      if (!res.ok) {
        setServerError(res.error);
        return false;
      }
      toast.success(`Ноорог гэрээ ${res.data.number} үүслээ`, { description: "Одоо гэрээний файлаа хавсаргаад батлуулахаар илгээнэ үү." });
      router.refresh();
      return true;
    }
    const diff = diffPayload(brokeragePayload(baseline.form, baseline.owner?.id ?? null), payload);
    if (Object.keys(diff).length === 0) {
      if (!quiet) toast.info("Өөрчлөлт алга");
      return true;
    }
    const res = await updateBrokerageDraft({ contract_id: contract.id, ...diff });
    if (!res.ok) {
      setServerError(res.error);
      return false;
    }
    setBaseline({ form, owner });
    if (!quiet) toast.success("Гэрээ хадгалагдлаа");
    router.refresh();
    return true;
  }

  async function onSave() {
    setBusy(true);
    try {
      await save();
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!contract) return;
    setServerError(null);
    const missing = brokerageSubmitMissing(form, {
      ownerId: owner?.id ?? null,
      fileCount: files.length,
      requireOwner: settings["brokerage.require_owner"],
      requireFile: settings["brokerage.require_file"],
      today: ubToday(),
    });
    if (missing.length) {
      setServerError(`Батлуулахаар илгээхэд дутуу: ${missingSentence(missing)}.`);
      return;
    }
    setBusy(true);
    try {
      if (!(await save(true))) return;
      const res = await submitBrokerage(contract.id);
      if (!res.ok) {
        setServerError(res.error);
        return;
      }
      toast.success("Гэрээ батлуулахаар илгээгдлээ", { description: "Батлагч батлахад хөрөнгө идэвхжинэ." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onAddFiles(list: File[]) {
    if (!contract) return;
    const valid: File[] = [];
    const problems: string[] = [];
    for (const f of list) {
      const e = validateDocFile(f, limits, files.length + valid.length);
      if (e) problems.push(e);
      else valid.push(f);
    }
    setFileErrors(problems);
    if (!valid.length) return;
    setBusy(true);
    setUploadText(`Хуулж байна… 0/${valid.length}`);
    try {
      const res = await uploadMany(
        valid,
        (file) => uploadBrokerageFile({ file, officeId, contractId: contract.id, limits }),
        (done, total) => setUploadText(`Хуулж байна… ${done}/${total}`)
      );
      if (res.errors.length) setFileErrors((prev) => [...prev, ...res.errors]);
      if (res.ok.length) toast.success(`${res.ok.length} файл хавсаргалаа`);
    } finally {
      setBusy(false);
      setUploadText(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {contract ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CodeChip code={contract.number} />
          <BrokerageStatusBadge status={contract.status} />
          {contract.version > 1 ? <span className="text-muted">Сунгалт · {contract.version}-р хувилбар</span> : null}
          {contract.rejection_note ? (
            <span className="w-full rounded-lg bg-rose-50 px-2 py-1 text-rose-800">Татгалзсан шалтгаан: {contract.rejection_note}</span>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">Хүчинтэй гэрээ алга. Шинэ ноорог гэрээ үүсгээд файлаа хавсаргаж батлуулна.</p>
      )}

      <BrokerageFields
        idPrefix={contract ? `bc-${contract.id.slice(0, 8)}` : "bc-new"}
        value={form}
        onChange={(v) => {
          setForm(v);
          setErrors({});
        }}
        owner={owner}
        onOwnerChange={setOwner}
        requireOwner={settings["brokerage.require_owner"]}
        staff={staff}
        responsibleStaff={responsibleStaff}
        me={me}
        errors={errors}
        disabled={busy}
      />

      {contract ? (
        <>
          <DocList
            items={files.map((f) => ({ id: f.id, name: f.file_name || "Файл", size: f.size_bytes, url: f.url }))}
            onAdd={onAddFiles}
            onRemove={(item) => setRemoveFile(item)}
            disabled={busy}
            canAdd={contract.canAttach && files.length < limits.maxDocsPerContract}
            busyText={uploadText}
            hint={`PDF, JPEG, PNG, WebP, ≤${limits.maxDocMb} МБ.${
              settings["brokerage.require_file"] ? " Батлуулахад дор хаяж нэг файл заавал." : ""
            }`}
          />
          {fileErrors.length ? (
            <FormAlert tone="warn">
              <ul className="list-inside list-disc space-y-0.5">
                {fileErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </FormAlert>
          ) : null}
        </>
      ) : null}

      {serverError ? <FormAlert>{serverError}</FormAlert> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant={contract ? "outline" : "primary"} onClick={() => void onSave()} disabled={busy}>
          {busy && !uploadText ? "Түр хүлээнэ үү…" : contract ? "Гэрээ хадгалах" : "Ноорог гэрээ үүсгэх"}
        </Button>
        {contract ? (
          <Button type="button" onClick={() => void onSubmit()} disabled={busy}>
            <Send className="size-4" aria-hidden />
            Батлуулахаар илгээх
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={!!removeFile}
        onClose={() => setRemoveFile(null)}
        title="Файлыг устгах уу?"
        description={removeFile ? `«${removeFile.name}» гэрээнээс хасагдаж устгагдана.` : undefined}
        confirmLabel="Устгах"
        tone="danger"
        onConfirm={async () => {
          if (!removeFile) return null;
          const res = await deleteBrokerageFile(removeFile.id);
          if (!res.ok) return res.error;
          toast.success("Файл устгагдлаа");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
