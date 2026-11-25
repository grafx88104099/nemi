"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, Loader2, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { BottomSheet } from "@/components/crm2/ui/bottom-sheet";
import { ConfirmDialog } from "@/components/crm2/ui/confirm-dialog";
import { logUiEvent } from "@/lib/crm2/actions/events";
import { canViewRestrictedBrokerage, createBrokerageDraft, registerBrokerage } from "@/lib/crm2/actions/brokerage";
import { deleteBrokerageFile } from "@/lib/crm2/actions/media";
import { updateProperty } from "@/lib/crm2/actions/properties";
import { autoActivates, brokerageEndDateError, brokerageMaxEndDate, type ChecklistSheet } from "@/lib/crm2/checklist";
import { fmtIsoDate } from "@/lib/crm2/datetime";
import { useOnline } from "@/lib/crm2/device/network";
import { NOT_PDF_ERROR, enqueue, startQueue } from "@/lib/crm2/device/upload-queue";
import { contractPdfOnlyText, fmtFileSize, isPdfHeader, validateContractPdf, validateDocFile } from "@/lib/crm2/files";
import { BROKERAGE_STATUS_LABEL, PROPERTY_STATUS_LABEL, missingItemLabel } from "@/lib/crm2/labels";
import { crm2Paths, panelFromPathname, type Crm2Panel } from "@/lib/crm2/paths";
import type { BrokerageFileItem } from "@/lib/crm2/queries/properties";
import { fileLimits, type Crm2Settings } from "@/lib/crm2/settings";
import { uploadBrokerageFile } from "@/lib/crm2/storage";
import type { Crm2BrokerageRow, Crm2StaffMember } from "@/lib/crm2/types";

import { loadContractContext } from "./actions";
import { ActivationReadiness } from "./ActivationReadiness";
import { ContractAgentRow } from "./ContractAgentRow";
import {
  contractAgentPatch,
  contractMissing,
  contractPdf,
  effectiveContractOwner,
  endDateChips,
  extraDocs,
  fileCounts,
  initialContractForm,
  legacyContractImages,
  propertyGaps,
  registrantFillsContractAgent,
  termEndDate,
  type ContractForm,
  type PropertyGap,
} from "./contract-model";
import type { ContractContext } from "./contract-types";
import { ContractPdfSection } from "./ContractPdfSection";
import { DocPagesSheet, useContractUploads } from "./DocPagesSheet";
import { OwnerBlock, OwnerLine, ownerComplete } from "./OwnerBlock";
import { Chip, INPUT_CLASS, MissingList, SectionTitle } from "./parts";

export type ContractSheetProps = {
  propertyId: string;
  officeId: string;
  /** Бүртгэх ноорог (эсвэл харах бүртгэгдсэн гэрээ); null бол эхний PDF дээр шинэ ноорог үүсгэнэ. */
  contract: Crm2BrokerageRow | null;
  settings: Crm2Settings;
  staff: Crm2StaffMember[];
  onClose: () => void;
  /** Картаас (AgreementTab) бэлэн өгөгдөл; өгөхгүй бол loadContractContext()-оор ачаална. */
  context?: ContractContext | null;
  /** Өгөхгүй бол URL-аас. */
  panel?: Crm2Panel;
  open?: boolean;
  /**
   * Хөрөнгө идэвхжихэд дутуу мөрийг дарахад нөхөх цонх нээх (картын CardSheetHost). Өгөхгүй бол энэ
   * цонхыг хааж картын ?sheet= холбоос руу шилжинэ.
   */
  onOpenSheet?: (sheet: ChecklistSheet, field: string | null) => void;
};

const TITLE = "Гэрээ бүртгэх";

/**
 * «Гэрээ бүртгэх» доод цонх (20261125000100 — батлах алхамгүй), нэг дэлгэц, утсанд зориулсан:
 *   1) PMC-ийн тамга, гарын үсэгтэй гэрээг скан хийж НЭГ PDF болгох эсвэл PDF файл сонгох;
 *   2) «PMC-ийн тамга, гарын үсэгтэй»-г тэмдэглэх (PDF солигдвол дахин);
 *   3) дуусах огноо (анхдагч +brokerage.default_term_months), эхлэх = өнөөдөр;
 *   4) «Бүртгэх» → гэрээ шууд хүчинтэй, хөрөнгийн мэдээлэл бүрэн бол хөрөнгө идэвхтэй болно.
 * Ноорог (B### дугаартай) эхний PDF-ийг сонгох/скан хийх үед үүснэ (интернэт хэрэгтэй).
 */
export function ContractSheet(props: ContractSheetProps) {
  const { propertyId, onClose } = props;
  const open = props.open ?? true;
  const router = useRouter();
  const pathname = usePathname();
  const panel = props.panel ?? panelFromPathname(pathname);
  const [loaded, setLoaded] = React.useState<ContractContext | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const ctx = loaded ?? props.context ?? null;

  const reload = React.useCallback(async () => {
    const res = await loadContractContext(propertyId).catch(() => null);
    if (!res) return;
    if (res.ok) {
      setLoaded(res.data);
      setLoadError(null);
    } else setLoadError(res.error);
  }, [propertyId]);

  const needLoad = open && !props.context && !loaded;
  React.useEffect(() => {
    if (!needLoad) return;
    let cancelled = false;
    loadContractContext(propertyId).then(
      (res) => {
        if (cancelled) return;
        if (res.ok) setLoaded(res.data);
        else setLoadError(res.error);
      },
      () => {
        if (!cancelled) setLoadError("Гэрээний мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [needLoad, propertyId]);

  const refresh = React.useCallback(async () => {
    router.refresh();
    await reload();
  }, [router, reload]);

  // «Гэрээ олдсонгүй»-оос «Шинээр бүртгэх» дарсан: зорилтот id-г орхиж (байгаа ноорог, эс бөгөөс шинэ).
  const [restart, setRestart] = React.useState(false);
  const draftInCtx = ctx?.contracts.find((c) => c.status === "draft")?.id ?? null;
  const currentId = savedId ?? (restart ? draftInCtx : (props.contract?.id ?? null));
  const item = ctx && currentId ? (ctx.contracts.find((c) => c.id === currentId) ?? null) : null;
  // Шинээр үүсгэсэн ноорог дахин ачаалтал засварлагч нээлттэй үлдэнэ (сонгосон PDF, огноо алдагдахгүй).
  const lost = !!ctx && currentId !== null && !item && savedId === null;

  if (!ctx || lost) {
    return (
      <BottomSheet open={open} onClose={onClose} title={TITLE}>
        {loadError && !lost ? (
          <div className="space-y-3">
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {loadError}
            </p>
            <Button
              type="button"
              size="touch"
              variant="outline"
              onClick={() => {
                setLoadError(null);
                void reload();
              }}
            >
              Дахин оролдох
            </Button>
          </div>
        ) : lost ? (
          // Дахин ачаалах нь тус болохгүй (id хэвээр) — шинээр бүртгэх эсвэл хаах.
          <div className="space-y-3">
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Энэ гэрээ олдсонгүй — өөр төхөөрөмжөөс хаагдсан эсвэл харах эрхгүй байж магадгүй.
            </p>
            <div className="flex flex-wrap gap-2">
              {ctx?.canEditProperty ? (
                <Button type="button" size="touch" onClick={() => setRestart(true)}>
                  <FileText className="size-4" aria-hidden /> Гэрээ шинээр бүртгэх
                </Button>
              ) : null}
              <Button type="button" size="touch" variant="outline" onClick={onClose}>
                Хаах
              </Button>
            </div>
          </div>
        ) : (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Ачаалж байна…
          </p>
        )}
      </BottomSheet>
    );
  }

  return (
    <ContractEditor
      {...props}
      open={open}
      panel={panel}
      ctx={ctx}
      item={item}
      draftId={item?.id ?? savedId}
      onCreated={(id) => {
        setSavedId(id);
        void refresh();
      }}
      refresh={refresh}
    />
  );
}

type Item = ContractContext["contracts"][number];

function ContractEditor({
  propertyId,
  officeId,
  settings,
  staff,
  onClose,
  onOpenSheet,
  open,
  panel,
  ctx,
  item,
  draftId,
  onCreated,
  refresh,
}: ContractSheetProps & {
  open: boolean;
  panel: Crm2Panel;
  ctx: ContractContext;
  item: Item | null;
  /** Ноорог гэрээний id (шинээр үүсгэсэн ч ctx дахин ачаалагдаагүй байж болно). */
  draftId: string | null;
  onCreated: (id: string) => void;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const meId = ctx.meId;
  const today = ctx.today;
  const limits = React.useMemo(() => {
    const l = fileLimits(settings);
    return { maxDocMb: l.maxDocMb, maxDocsPerContract: l.maxDocsPerContract };
  }, [settings]);
  const termMonths = ctx.termMonths;
  const sources = settings["contact.sources"];
  const ids = React.useId();

  const isDraft = !item || item.status === "draft";
  const editable = item ? item.status === "draft" && item.canEditDraft : ctx.canEditProperty;

  const [endDate, setEndDate] = React.useState(() => initialContractForm({ contract: item, today, termMonths }).end_date);
  /** Тамга тэмдэглэсэн PDF-ийн id — PDF солигдвол тэмдэглэгээ өөрөө арилна. */
  const [stampFor, setStampFor] = React.useState<string | null>(null);
  /** Гараар сонгосон гэрээ байгуулсан агент (null — RPC бөглөнө/баталгаажуулна). */
  const [agentChoice, setAgentChoice] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [busyText, setBusyText] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** Бүртгэх RPC-ийн алдааны талбар (aria-invalid, тухайн хэсэг рүү гүйлгэх). */
  const [serverField, setServerField] = React.useState<string | null>(null);
  const [pagesOpen, setPagesOpen] = React.useState(false);
  const [canRestricted, setCanRestricted] = React.useState<boolean | null>(null);
  const [confirm, setConfirm] = React.useState<null | { kind: "replace"; file: BrokerageFileItem } | { kind: "delete"; file: BrokerageFileItem }>(null);
  const creating = React.useRef<Promise<string | null> | null>(null);
  /** PDF сонгосноос дараалалд орох хүртэл (толгой шалгах, IDB-д битүүмжлэх) давхар сонголтыг хаана. */
  const picking = React.useRef(false);
  const dateRef = React.useRef<HTMLInputElement>(null);
  const online = useOnline();

  // Сервер дуусах огноог татгалзвал талбарт фокуслана — бүртгэж дууссаны дараа (тэр үед input идэвхтэй).
  React.useEffect(() => {
    if (serverField === "end_date" && !saving) dateRef.current?.focus();
  }, [serverField, saving]);

  const files = React.useMemo(() => item?.files ?? [], [item]);
  const pdf = contractPdf(files);
  const legacy = legacyContractImages(files);
  const extras = extraDocs(files);
  const stampConfirmed = !!pdf && stampFor === pdf.id;
  const form: ContractForm = { end_date: endDate, stamp_confirmed: stampConfirmed };

  // ── Өмчлөлийн баримт хавсаргах эрх ──
  React.useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    void canViewRestrictedBrokerage(draftId).then(
      (r) => {
        if (!cancelled) setCanRestricted(r.ok ? r.data : false);
      },
      () => {
        if (!cancelled) setCanRestricted(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const onUploaded = React.useCallback(() => void refresh(), [refresh]);
  const uploads = useContractUploads(meId, propertyId, draftId, onUploaded);

  // Гэрээний бодит эзэн (DB: coalesce(гэрээний эзэн, хөрөнгийн эзэн)) — сунгалтын ноорог өмнөх гэрээний
  // эзнийг өвлөж, хөрөнгийн одоогийн эзнээс өөр байж болно. Эзний хэсэг ч тэр харилцагчийг засна.
  const eff = effectiveContractOwner(ctx.owner, isDraft ? item : null);
  const ownerCtx: ContractContext = eff.fromContract ? { ...ctx, owner: eff.owner } : ctx;
  const ownerDiffers = eff.fromContract && ctx.owner !== "hidden" && eff.owner !== "hidden" && ctx.owner?.id !== eff.owner?.id;
  const o = eff.owner;
  const owner = o === "hidden" ? "hidden" : o ? { id: o.id, nameUnverified: o.name_unverified, source: o.source } : null;
  const missing = contractMissing(ctx.checklist, form, {
    status: "draft",
    owner,
    files: fileCounts(files),
    ownershipKnown: canRestricted !== false,
  });
  const dateError = brokerageEndDateError(endDate, today);
  const agentId = agentChoice ?? ctx.property.contract_agent_id;
  // RPC хоосон «гэрээ байгуулсан агент»-ыг бүртгэгчээр бөглөх эсэх (registrantFillsContractAgent).
  const fillsMe =
    editable && isDraft && registrantFillsContractAgent(ctx.property, { id: meId, isStaff: ctx.meIsStaff }, ctx.sameAgentMultiRole);
  const gaps = isDraft
    ? propertyGaps(ctx.checklist, agentId ?? (fillsMe ? meId : null))
    : propertyGaps(ctx.checklist, null, { registering: false });
  const busy = saving || !!busyText;
  // Хуулалтын төлөв: гэрээний PDF ба нэмэлт баримтыг ялгаж, сүлжээгүй үед «холбогдмогц» гэж хэлнэ.
  const isContractUpload = (i: (typeof uploads.items)[number]) => i.target.kind === "brokerage" && i.target.fileKind === "contract";
  const contractUploading = uploads.items.some((i) => isContractUpload(i) && i.status !== "failed");
  const extraUploading = uploads.items.some((i) => !isContractUpload(i) && i.status !== "failed");
  const uploadText = contractUploading
    ? online
      ? "Гэрээ хуулагдаж байна…"
      : "Интернэт холбогдмогц гэрээ хуулагдана"
    : extraUploading
      ? online
        ? "Баримт хуулагдаж байна…"
        : "Интернэт холбогдмогц баримт хуулагдана"
      : null;
  const canRegister = editable && isDraft && !!draftId && !!pdf && stampConfirmed && !dateError && missing.length === 0 && !busy && !uploads.uploading;

  // Сүүлд «Гэрээ буруу» гэж буцаагдсан гэрээ — дараа нь өөр гэрээ бүртгэгдээгүй бол шинэ ноорогт
  // агентад шалтгааныг харуулна.
  const lastInvalid =
    [...ctx.contracts].filter((c) => c.invalidated_at).sort((a, b) => (b.invalidated_at ?? "").localeCompare(a.invalidated_at ?? ""))[0] ?? null;
  const invalidated =
    isDraft &&
    lastInvalid &&
    !ctx.contracts.some((c) => c.id !== lastInvalid.id && (c.registered_at ?? c.approved_at ?? "") > (lastInvalid.invalidated_at ?? ""))
      ? lastInvalid
      : null;

  function openGap(key: string) {
    const g = gaps.find((x) => x.key === key);
    if (!g) return;
    if (onOpenSheet) {
      onOpenSheet(g.target.sheet, g.target.field);
      return;
    }
    onClose();
    router.push(crm2Paths(panel).property(propertyId, undefined, { sheet: g.target.sheet, field: g.target.field ?? undefined }), { scroll: false });
  }

  /** Бүртгэх RPC-ийн алдааны талбарын хэсгийг харагдуулна (PDF, тамга, эзэн, өмчлөлийн баримт). */
  function revealSection(field: string | null | undefined) {
    const section =
      field === "file" || field === "stamp_confirmed" || field === "ownership_doc"
        ? "pdf"
        : field === "owner" || field === "owner.full_name" || field === "owner.source"
          ? "owner"
          : null;
    if (!section) return;
    document.getElementById(`${ids}-${section}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /** Ноорог (B###) — эхний PDF/скан дээр нэг удаа үүсгэнэ. */
  async function ensureDraft(): Promise<string | null> {
    if (draftId) return draftId;
    if (creating.current) return creating.current;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("Гэрээний ноорог үүсгэхэд интернэт хэрэгтэй. Сүлжээнд холбогдоод дахин оролдоно уу.");
      return null;
    }
    const run = (async () => {
      setBusyText("Гэрээний ноорог үүсгэж байна…");
      setError(null);
      try {
        const res = await createBrokerageDraft({ property_id: propertyId, end_date: dateError ? undefined : endDate });
        if (!res.ok) {
          setError(res.error);
          return null;
        }
        logUiEvent({ event: "contract_draft_saved", flow: "card", property_id: propertyId, meta: { created: true } });
        onCreated(res.data.id);
        return res.data.id;
      } catch {
        setError("Сүлжээ тасарлаа. Дахин оролдоно уу.");
        return null;
      } finally {
        setBusyText(null);
        creating.current = null;
      }
    })();
    creating.current = run;
    return run;
  }

  async function scan() {
    if (busy) return;
    const id = await ensureDraft();
    if (id) setPagesOpen(true);
  }

  async function pickPdf(file: File) {
    if (busy || picking.current) return;
    setError(null);
    const invalid = validateContractPdf(file, limits);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    // Сонгосноос дараалалд орох хүртэл (том PDF-ийг утсан дээр битүүмжлэхэд секунд болно) сонгогчийг хаана —
    // дахин дарж хоёр PDF дараалалд оруулахгүй.
    picking.current = true;
    setBusyText("PDF бэлдэж байна…");
    try {
      let header = false;
      try {
        header = isPdfHeader(new Uint8Array(await file.slice(0, 5).arrayBuffer()));
      } catch {
        header = false;
      }
      if (!header) {
        toast.error(contractPdfOnlyText(file.name));
        return;
      }
      const id = await ensureDraft();
      if (!id) return;
      setStampFor(null);
      setBusyText("PDF бэлдэж байна…");
      try {
        await enqueue({ profileId: meId, target: { kind: "brokerage", contractId: id, fileKind: "contract", officeId, limits }, blob: file, name: file.name });
        void startQueue(meId);
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          toast.info("Гэрээний PDF утсан дээр хадгалагдлаа", { description: "Интернэт холбогдмогц өөрөө хуулагдана." });
        } else {
          toast.success("Гэрээний PDF хуулагдаж байна");
        }
      } catch (e) {
        if (e instanceof Error && e.message === NOT_PDF_ERROR) {
          toast.error(contractPdfOnlyText(file.name));
          return;
        }
        // Утсан дээр хадгалах боломжгүй — шууд хуулна.
        setBusyText("Гэрээ хуулагдаж байна…");
        const r = await uploadBrokerageFile({ file, officeId, contractId: id, limits, existing: files.length, kind: "contract" });
        if (!r.ok) toast.error(r.error);
        else await refresh();
      }
    } finally {
      picking.current = false;
      setBusyText(null);
    }
  }

  async function pickExtras(list: File[]) {
    if (!draftId || busy) return;
    let existing = files.length + uploads.items.length;
    let queued = 0;
    for (const file of list) {
      const invalid = validateDocFile(file, limits, existing);
      if (invalid) {
        toast.error(invalid);
        continue;
      }
      try {
        await enqueue({ profileId: meId, target: { kind: "brokerage", contractId: draftId, fileKind: "ownership", officeId, limits }, blob: file, name: file.name });
        queued++;
      } catch {
        const r = await uploadBrokerageFile({ file, officeId, contractId: draftId, limits, existing, kind: "ownership" });
        if (!r.ok) toast.error(r.error);
        else void refresh();
      }
      existing++;
    }
    if (queued) void startQueue(meId);
  }

  async function register() {
    if (!draftId || !canRegister) return;
    setSaving(true);
    setError(null);
    try {
      const patch = ctx.canEditProperty ? contractAgentPatch(agentChoice, ctx.property) : null;
      if (patch) {
        const a = await updateProperty(propertyId, patch);
        if (!a.ok) {
          setError(`Гэрээ байгуулсан агентыг хадгалж чадсангүй: ${a.error}`);
          return;
        }
      }
      setServerField(null);
      const r = await registerBrokerage({ contract_id: draftId, end_date: endDate, stamp_confirmed: stampConfirmed });
      if (!r.ok) {
        setError(r.error);
        setServerField(r.field ?? null);
        if (r.field === "stamp_confirmed") setStampFor(null);
        // end_date — бүртгэж дууссаны дараа (талбар идэвхжмэгц) доорх effect фокуслана.
        if (r.field !== "end_date") revealSection(r.field);
        return;
      }
      const d = r.data;
      logUiEvent({
        event: "contract_registered",
        flow: "card",
        property_id: propertyId,
        meta: { active: d.property_status === "active", missing: d.property_missing.length, already: !!d.already, agent_changed: !!patch },
      });
      if (d.property_status === "active") {
        toast.success(`${ctx.propertyCode} идэвхтэй боллоо · Гэрээ ${d.number} бүртгэгдлээ`);
      } else if (d.property_missing.length && (d.property_status === "draft" || d.property_status === "contract_ended")) {
        // DB (crm2_property_try_activate) ноорог болон энэ бүртгэлээр сунгагдсан «гэрээ дууссан» хөрөнгийг
        // мэдээлэл нөхөгдөхөд өөрөө идэвхжүүлнэ.
        toast.info(`Гэрээ ${d.number} бүртгэгдлээ — хөрөнгө идэвхжихэд дутуу`, {
          description: `${d.property_missing.map(missingItemLabel).join(", ")}. Нөхмөгц автоматаар идэвхжинэ.`,
        });
      } else {
        toast.success(`Гэрээ ${d.number} бүртгэгдлээ`, {
          description: `Хөрөнгийн төлөв: ${PROPERTY_STATUS_LABEL[d.property_status] ?? d.property_status}.`,
        });
      }
      router.refresh();
      onClose();
    } catch (e) {
      console.error("ContractSheet register:", e);
      setError("Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  }

  const gapRows = gaps.map((g: PropertyGap) => ({ key: g.key, label: g.label, openable: g.target.sheet !== "contract" }));
  const title = item ? (isDraft ? `${TITLE} · ${item.number}` : `Гэрээ · ${item.number}`) : TITLE;

  const footer =
    editable && isDraft ? (
      <div className="space-y-1.5">
        {error ? (
          <p id={`${ids}-err`} role="alert" className="break-words text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!canRegister}
          aria-describedby={missing.length ? `${ids}-missing` : undefined}
          onClick={() => void register()}
        >
          {uploadText && !online ? (
            <WifiOff className="size-4" aria-hidden />
          ) : saving || uploadText ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden />
          )}
          <span className="min-w-0 truncate">{uploadText ?? (saving ? "Бүртгэж байна…" : "Бүртгэх")}</span>
        </Button>
        {!uploadText && missing.length ? (
          <p className="text-center text-xs text-muted">{missing.length} зүйл дутуу</p>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <BottomSheet open={open && !pagesOpen} onClose={() => !busy && onClose()} title={title} footer={footer}>
        <div className="min-w-0 space-y-5">
          {!isDraft && item ? (
            <RegisteredView item={item} ctx={ctx} pdf={pdf} gapRows={gapRows} onOpenGap={openGap} />
          ) : !editable ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
              {item ? "Энэ ноорог гэрээг бүртгэх эрхгүй." : "Гэрээ бүртгэх эрхгүй — хөрөнгийн үүрэгт агент бүртгэнэ."}
            </p>
          ) : (
            <p className="text-sm text-muted">
              PMC-ийн тамга, гарын үсэгтэй гэрээгээ PDF-ээр оруулж бүртгэмэгц (батлуулахгүй) гэрээ хүчинтэй болж, хөрөнгийн мэдээлэл
              бүрэн бол хөрөнгө идэвхтэй болно.
            </p>
          )}

          {invalidated && editable ? (
            <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">
                Өмнөх гэрээ {invalidated.number} «Гэрээ буруу» гэж буцаагдсан
                {invalidated.termination_reason ? ` — ${invalidated.termination_reason.replace(/^Гэрээ буруу:\s*/, "")}` : ""}. Зөв PDF-ээ
                оруулж дахин бүртгэнэ үү.
              </span>
            </p>
          ) : null}

          {isDraft && (editable || item) ? (
            <>
              <div id={`${ids}-pdf`} className="scroll-mt-4">
                <ContractPdfSection
                  pdf={pdf}
                  legacy={legacy}
                  extras={extras}
                  uploads={uploads}
                  editable={editable}
                  canRestricted={draftId ? canRestricted : false}
                  extrasOpen={missing.includes("ownership_doc")}
                  stampConfirmed={stampConfirmed}
                  stampErrorId={serverField === "stamp_confirmed" && error ? `${ids}-err` : undefined}
                  onStamp={(v) => {
                    setStampFor(v && pdf ? pdf.id : null);
                    if (serverField === "stamp_confirmed") setServerField(null);
                  }}
                  onScan={() => void scan()}
                  onPickPdf={(f) => void pickPdf(f)}
                  onReplace={() => pdf && setConfirm({ kind: "replace", file: pdf })}
                  onDeleteFile={(f) => setConfirm({ kind: "delete", file: f })}
                  onPickExtras={(list) => void pickExtras(list)}
                  onRetry={(id) => void uploads.retry(id)}
                  onRemove={(id) => void uploads.remove(id)}
                  disabled={busy}
                />
              </div>
              {busyText ? (
                <p role="status" className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> {busyText}
                </p>
              ) : null}

              <section className="space-y-2" aria-label="Хугацаа">
                <SectionTitle>Хугацаа</SectionTitle>
                <p className="text-sm text-muted">Эхлэх: өнөөдөр ({fmtIsoDate(today)}) — бүртгэсэн өдөр.</p>
                <div className="space-y-1.5">
                  <label htmlFor={`${ids}-end`} className="block text-sm font-medium text-ink">
                    Дуусах огноо
                  </label>
                  <input
                    ref={dateRef}
                    id={`${ids}-end`}
                    type="date"
                    value={endDate}
                    min={today}
                    max={brokerageMaxEndDate(today)}
                    disabled={!editable || busy}
                    aria-invalid={!!dateError || (serverField === "end_date" && !!error)}
                    aria-describedby={
                      [dateError ? `${ids}-end-err` : null, serverField === "end_date" && error ? `${ids}-err` : null]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      if (serverField === "end_date") setServerField(null);
                    }}
                    className={INPUT_CLASS}
                  />
                  {dateError ? (
                    <p id={`${ids}-end-err`} className="text-xs text-danger">
                      {dateError}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Хугацааны түргэн сонголт">
                  {endDateChips(termMonths).map((m) => {
                    const end = termEndDate(today, m);
                    return (
                      <Chip
                        key={m}
                        on={!!end && end === endDate}
                        disabled={!editable || busy || !end}
                        onClick={() => {
                          if (!end) return;
                          setEndDate(end);
                          if (serverField === "end_date") setServerField(null);
                        }}
                      >
                        +{m} сар
                      </Chip>
                    );
                  })}
                </div>
              </section>

              <div id={`${ids}-owner`} className="scroll-mt-4 space-y-1.5">
                {ownerComplete(ownerCtx.owner) ? (
                  <OwnerLine ctx={ownerCtx} panel={panel} />
                ) : (
                  <OwnerBlock ctx={ownerCtx} sources={sources} panel={panel} disabled={busy} onChanged={() => void refresh()} />
                )}
                {ownerDiffers ? (
                  <p className="px-1 text-xs text-muted">
                    Энэ гэрээнд өмнөх гэрээний эзэн бичигдэнэ — хөрөнгийн одоогийн эзнээс өөр.
                  </p>
                ) : null}
              </div>

              <ContractAgentRow
                value={agentId}
                fallbackMe={!agentId && fillsMe}
                onChange={setAgentChoice}
                staff={staff}
                meId={meId}
                teamIds={ctx.teamIds}
                canChange={editable && ctx.canEditProperty}
                disabled={busy}
              />

              {editable ? <MissingList id={`${ids}-missing`} items={missing} title="Бүртгэхэд дутуу:" /> : null}
              {editable ? (
                <MissingList
                  items={gapRows}
                  tone="muted"
                  title="Хөрөнгө идэвхжихэд дутуу (дараа нь нөхөж болно):"
                  onOpen={openGap}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </BottomSheet>

      {draftId && editable && isDraft ? (
        <DocPagesSheet
          open={open && pagesOpen}
          onClose={() => setPagesOpen(false)}
          profileId={meId}
          propertyId={propertyId}
          officeId={officeId}
          contractId={draftId}
          limits={limits}
          onQueued={() => {
            setStampFor(null);
            if (typeof navigator !== "undefined" && navigator.onLine === false) {
              toast.info("Гэрээ PDF болж утсан дээр хадгалагдлаа", { description: "Интернэт холбогдмогц өөрөө хуулагдана." });
            } else {
              toast.success("Гэрээ PDF болж хуулагдаж байна");
            }
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "replace" ? "Одоогийн PDF-ийг солих уу?" : "Файл устгах уу?"}
        description={
          confirm?.kind === "replace"
            ? "Одоогийн PDF устгагдана. Дараа нь шинээр скан хийх эсвэл PDF файл сонгоно."
            : (confirm?.file.file_name ?? undefined)
        }
        confirmLabel={confirm?.kind === "replace" ? "Солих" : "Устгах"}
        tone="danger"
        onConfirm={async () => {
          const c = confirm;
          if (!c) return null;
          const res = await deleteBrokerageFile(c.file.id);
          if (!res.ok) return res.error;
          if (c.kind === "replace" || c.file.id === pdf?.id) setStampFor(null);
          toast.success(c.kind === "replace" ? "Хуучин PDF устгагдлаа — шинээ оруулна уу" : "Файл устгагдлаа");
          await refresh();
          return null;
        }}
      />
    </>
  );
}

/** Бүртгэгдсэн (эсвэл хүчингүй болсон) гэрээ — зөвхөн харна. */
function RegisteredView({
  item,
  ctx,
  pdf,
  gapRows,
  onOpenGap,
}: {
  item: Item;
  ctx: ContractContext;
  pdf: BrokerageFileItem | null;
  gapRows: { key: string; label: string; openable: boolean }[];
  onOpenGap: (key: string) => void;
}) {
  const active = item.status === "active";
  // Ноорог (эсвэл энэ гэрээгээр сунгагдсан «гэрээ дууссан») хөрөнгө — мэдээлэл нөхөгдөхөд DB өөрөө идэвхжүүлнэ.
  const autoPending = autoActivates({ status: ctx.propertyStatus, status_changed_at: ctx.checklist.property.status_changed_at }, item);
  return (
    <div className="space-y-3">
      <p
        className={
          active
            ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            : "rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted"
        }
      >
        {active
          ? `Энэ гэрээ бүртгэгдсэн (${item.start_date ? fmtIsoDate(item.start_date) : "—"} – ${item.end_date ? fmtIsoDate(item.end_date) : "—"}). Засахгүй — буруу бол батлагч эсвэл багийн ахлагч «Гэрээ буруу» гэж буцаана; хугацааг «Сунгах»-аар.`
          : `Энэ гэрээ ${BROKERAGE_STATUS_LABEL[item.status].toLowerCase()} — картын «Зуучлалын гэрээ» хэсгээс харна.`}
      </p>
      {pdf ? (
        <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm">
          <FileText className="size-4 shrink-0 text-muted" aria-hidden />
          {pdf.url ? (
            <a
              href={pdf.url}
              target="_blank"
              rel="noopener noreferrer"
              className="-my-1.5 flex min-h-11 min-w-0 flex-1 items-center font-medium text-brand-700 hover:underline"
            >
              <span className="min-w-0 truncate">{pdf.file_name || "Гэрээ (PDF)"}</span>
            </a>
          ) : (
            <span className="min-w-0 flex-1 truncate">{pdf.file_name || "Гэрээ (PDF)"}</span>
          )}
          <span className="shrink-0 text-xs text-muted">{fmtFileSize(pdf.size_bytes)}</span>
        </div>
      ) : null}
      {autoPending ? (
        gapRows.length ? (
          <MissingList
            items={gapRows}
            title="Хөрөнгө идэвхжихэд дутуу (нөхмөгц автоматаар идэвхжинэ):"
            className="border-amber-300"
            onOpen={onOpenGap}
          />
        ) : (
          <ActivationReadiness propertyId={ctx.propertyId} state={{ kind: "ready" }} />
        )
      ) : null}
    </div>
  );
}
