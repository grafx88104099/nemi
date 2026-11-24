"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Check, ImagePlus, Loader2, UserRoundSearch } from "lucide-react";

import { BottomSheet } from "@/components/crm2/ui/bottom-sheet";
import { OwnerPhoneField } from "@/components/crm2/staff/owner/OwnerPhoneField";
import { isFinal } from "@/components/crm2/staff/owner/owner-model";
import { updateContact } from "@/lib/crm2/actions/contacts";
import { setPropertyStatus, updateProperty } from "@/lib/crm2/actions/properties";
import { prepareImages, progressLabel } from "@/lib/crm2/device/image-prep";
import { enqueue, startQueue } from "@/lib/crm2/device/upload-queue";
import { OWNER_PENDING_LABEL } from "@/lib/crm2/labels";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { IncompleteItem } from "@/lib/crm2/queries/incomplete";
import type { Crm2FileLimits } from "@/lib/crm2/settings";
import { cn } from "@/lib/utils";

import { ContractCell, type ContractCellProps } from "./ContractCell";
import {
  PERCENT_TONE_CLASS,
  clampPercent,
  dragHasFiles,
  parseAreaCell,
  parsePriceCell,
  parseRoomsCell,
  percentTone,
  priceCellText,
  splitDroppedFiles,
  type CellParse,
} from "./incomplete-model";

/** Хоосон ноорогийг архивлах шалтгаан (түүхэнд). */
const STALE_ARCHIVE_REASON = "14+ хоног хоосон ноорог";

export type CompletionTableProps = {
  items: IncompleteItem[];
  panel: Crm2Panel;
  profileId: string;
  officeId: string;
  /** contact.sources (код → нэр). */
  sources: Record<string, string>;
  districts: string[];
  limits: Crm2FileLimits;
  showAgent: boolean;
  contract: Omit<ContractCellProps, "propertyId" | "label" | "needsWork">;
};

/**
 * Ширээний (≥1024px) гүйцэтгэлийн хүснэгт (P10): мөр дотроо эзний утас (шууд), эх сурвалж, дүүрэг,
 * талбай, өрөө, үнэ засна; гэрээний нүд ContractSheet-ийг drawer-т нээнэ; мөр дээр олон зураг
 * чирж оруулна (утсан дээрх шиг багасгаж, дараалалаар хуулна); 14+ хоног хоосон ноорогийг архивлана.
 * Засвар бүр серверийн дүрмээр (RLS, guard) шалгагдаж, амжилттай бол хуудас дахин тооцоологдоно.
 */
export function CompletionTable(props: CompletionTableProps) {
  const { items, showAgent } = props;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[1100px] text-sm">
        <caption className="sr-only">Дутуу хөрөнгийн гүйцэтгэлийн хүснэгт — нүдэн дээр дарж засна, мөр дээр зураг чирж оруулна</caption>
        <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted">
          <tr>
            <th scope="col" className="p-2 font-medium">Хөрөнгө</th>
            <th scope="col" className="w-36 p-2 font-medium">Гүйцэтгэл</th>
            {showAgent ? <th scope="col" className="p-2 font-medium">Агент</th> : null}
            <th scope="col" className="p-2 font-medium">Эзний утас</th>
            <th scope="col" className="p-2 font-medium">Эх сурвалж</th>
            <th scope="col" className="p-2 font-medium">Дүүрэг</th>
            <th scope="col" className="w-24 p-2 font-medium">м²</th>
            <th scope="col" className="w-20 p-2 font-medium">Өрөө</th>
            <th scope="col" className="w-32 p-2 font-medium">Үнэ (сая ₮)</th>
            <th scope="col" className="p-2 font-medium">Гэрээ</th>
            <th scope="col" className="p-2 font-medium">
              <span className="sr-only">Үйлдэл</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <Row key={it.id} item={it} {...props} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ item, panel, profileId, officeId, sources, districts, limits, showAgent, contract }: CompletionTableProps & { item: IncompleteItem }) {
  const router = useRouter();
  const p = crm2Paths(panel);
  const pct = clampPercent(item.percent);
  const tone = PERCENT_TONE_CLASS[percentTone(pct)];
  const f = item.fields;
  const [dragOver, setDragOver] = React.useState(false);
  const [dropMsg, setDropMsg] = React.useState<string | null>(null);
  const [archive, setArchive] = React.useState<"idle" | "busy" | "pending" | "applied" | { error: string }>("idle");

  const save = React.useCallback(
    async (patch: Parameters<typeof updateProperty>[1]): Promise<string | null> => {
      const res = await updateProperty(item.id, patch).catch(() => null);
      if (!res) return "Сүлжээ тасарлаа — дахин оролдоно уу";
      if (!res.ok) return res.error;
      router.refresh();
      return null;
    },
    [item.id, router]
  );

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const { images, rejected } = splitDroppedFiles(Array.from(e.dataTransfer.files));
    if (!images.length) {
      setDropMsg(rejected ? "Зөвхөн зураг чирж оруулна" : null);
      return;
    }
    const room = Math.max(0, limits.maxImages - item.imageCount);
    const take = images.slice(0, room);
    if (!take.length) {
      setDropMsg(`Зургийн дээд хязгаар (${limits.maxImages}) хүрсэн`);
      return;
    }
    const prepared = await prepareImages(take, (d, t) => setDropMsg(progressLabel(d, t)));
    let queued = 0;
    for (const [i, r] of prepared.entries()) {
      if (!r.ok) continue;
      try {
        await enqueue({
          profileId,
          target: {
            kind: "media",
            propertyId: item.id,
            clientKey: `property:${item.id}`,
            officeId,
            limits,
            sortOrder: 1000 + item.imageCount + i,
            isCover: item.imageCount === 0 && queued === 0,
          },
          blob: r.file,
          name: r.file.name,
        });
        queued += 1;
      } catch {
        // IDB боломжгүй — доорх тоонд орохгүй
      }
    }
    void startQueue(profileId);
    const failed = prepared.length - queued;
    const skipped = images.length - take.length + rejected;
    setDropMsg(
      [queued ? `${queued} зураг дараалалд` : null, failed ? `${failed} уншигдсангүй` : null, skipped ? `${skipped} алгассан` : null]
        .filter(Boolean)
        .join(" · ") || null
    );
  }

  async function doArchive() {
    setArchive("busy");
    const res = await setPropertyStatus({ property_id: item.id, status: "archived", reason: STALE_ARCHIVE_REASON }).catch(() => null);
    if (!res) return setArchive({ error: "Сүлжээ тасарлаа" });
    if (!res.ok) return setArchive({ error: res.error });
    setArchive(res.data);
    if (res.data === "applied") router.refresh();
  }

  const mntOnly = !f.currency || f.currency === "MNT";

  return (
    <tr
      className={cn("border-b border-line align-top last:border-0", dragOver && "bg-brand-50 outline-2 outline-dashed outline-brand-400")}
      onDragOver={(e) => {
        if (!dragHasFiles(e.dataTransfer.types)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(e) => void onDrop(e)}
    >
      <th scope="row" className="max-w-64 p-2 text-left font-normal">
        <Link href={p.property(item.id, undefined, { sheet: "checklist" })} className="group block rounded-lg p-1 hover:bg-surface-2">
          <span className="font-mono text-xs font-semibold text-ink">{item.code}</span>
          <span className="block truncate text-sm text-ink group-hover:underline">{item.title}</span>
        </Link>
        <p className="flex items-center gap-1 px-1 text-xs text-subtle">
          <ImagePlus className="size-3.5" aria-hidden />
          {dropMsg ?? `${item.imageCount} зураг · чирж нэмэх`}
        </p>
      </th>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className={cn("h-full", tone.bar)} style={{ width: `${pct}%` }} />
          </div>
          <span className={cn("text-xs font-semibold tabular-nums", tone.text)}>{pct}%</span>
        </div>
        <Link
          href={p.property(item.id, undefined, { sheet: item.next.target.sheet })}
          className="mt-1 block text-xs text-muted hover:text-ink hover:underline"
        >
          {item.next.label}
        </Link>
      </td>
      {showAgent ? <td className="p-2 text-xs text-muted">{item.listingAgentName ?? "—"}</td> : null}
      <td className="p-2">
        <OwnerCell item={item} panel={panel} profileId={profileId} sources={sources} />
      </td>
      <td className="p-2">
        <SourceCell item={item} sources={sources} />
      </td>
      <td className="p-2">
        <SelectCell
          label={`${item.code} дүүрэг`}
          value={f.district ?? ""}
          options={districts}
          onSave={(v) => save({ district: v || null })}
        />
      </td>
      <td className="p-2">
        <TextCell
          label={`${item.code} талбай`}
          value={f.area_m2 != null ? String(f.area_m2) : ""}
          inputMode="decimal"
          parse={parseAreaCell}
          onSave={(v) => save({ area_m2: v })}
        />
      </td>
      <td className="p-2">
        <TextCell
          label={`${item.code} өрөө`}
          value={f.rooms != null ? String(f.rooms) : ""}
          inputMode="numeric"
          parse={parseRoomsCell}
          onSave={(v) => save({ rooms: v })}
        />
      </td>
      <td className="p-2">
        {mntOnly ? (
          <TextCell
            label={`${item.code} үнэ, сая төгрөгөөр`}
            value={priceCellText(f.price)}
            inputMode="decimal"
            parse={parsePriceCell}
            onSave={(v) => save(v != null && !f.currency ? { price: v, currency: "MNT" } : { price: v })}
            suffix={f.price_basis === "per_m2" ? "/м²" : f.price_period === "month" ? "/сар" : undefined}
          />
        ) : (
          <Link href={p.property(item.id, undefined, { sheet: "price" })} className="text-xs text-muted hover:underline">
            {f.price != null ? `$${f.price.toLocaleString("en-US")}` : "—"} · засах
          </Link>
        )}
      </td>
      <td className="p-2">
        <ContractCell
          {...contract}
          propertyId={item.id}
          label={item.next.group === "contract" ? item.next.label : "Гэрээ"}
          needsWork={item.next.group === "contract"}
        />
      </td>
      <td className="p-2 text-right">
        {item.staleEmpty ? (
          archive === "pending" ? (
            <span className="text-xs font-medium text-amber-800" role="status">
              Хүсэлт илгээгдлээ
            </span>
          ) : archive === "applied" ? (
            <span className="text-xs font-medium text-emerald-700" role="status">
              Архивлагдлаа
            </span>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <span className="text-[11px] text-rose-700">14+ хоног хоосон ноорог</span>
              <button
                type="button"
                onClick={() => void doArchive()}
                disabled={archive === "busy"}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-2 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
              >
                {archive === "busy" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}
                Архивлах
              </button>
              {typeof archive === "object" ? (
                <span className="max-w-40 text-[11px] text-danger" role="alert">
                  {archive.error}
                </span>
              ) : null}
            </div>
          )
        ) : null}
      </td>
    </tr>
  );
}

// ── Нүднүүд ────────────────────────────────────────────────────────────────

type SaveFn<T> = (value: T) => Promise<string | null>;

function useCellSave<T>(onSave: SaveFn<T>) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const run = async (v: T) => {
    setBusy(true);
    setError(null);
    const err = await onSave(v);
    setBusy(false);
    setError(err);
    setSaved(!err);
    return !err;
  };
  return { busy, error, saved, run, setError };
}

function TextCell<T>({
  label,
  value,
  inputMode,
  parse,
  onSave,
  suffix,
}: {
  label: string;
  value: string;
  inputMode: "decimal" | "numeric";
  parse: (text: string) => CellParse<T>;
  onSave: SaveFn<T>;
  suffix?: string;
}) {
  const [text, setText] = React.useState(value);
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value);
  }
  const { busy, error, saved, run, setError } = useCellSave(onSave);

  async function commit() {
    if (text.trim() === value.trim()) return;
    const parsed = parse(text);
    if (!parsed.ok) return setError(parsed.error);
    await run(parsed.value);
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        <input
          aria-label={label}
          value={text}
          inputMode={inputMode}
          enterKeyHint="done"
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setText(value);
              setError(null);
            }
          }}
          placeholder="—"
          aria-invalid={!!error}
          className={cn(
            "h-9 w-full min-w-0 rounded-lg border bg-surface px-2 text-sm tabular-nums text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-focus-soft",
            error ? "border-danger" : "border-transparent hover:border-line focus:border-line-strong"
          )}
        />
        {suffix ? <span className="shrink-0 text-xs text-subtle">{suffix}</span> : null}
        <CellState busy={busy} saved={saved && !error} />
      </div>
      {error ? (
        <p className="mt-0.5 text-[11px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SelectCell({
  label,
  value,
  options,
  onSave,
  emptyLabel = "—",
}: {
  label: string;
  value: string;
  options: readonly string[] | readonly { value: string; label: string }[];
  onSave: SaveFn<string>;
  emptyLabel?: string;
}) {
  const { busy, error, saved, run } = useCellSave(onSave);
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const known = !value || opts.some((o) => o.value === value);
  return (
    <div>
      <div className="flex items-center gap-1">
        <select
          aria-label={label}
          value={value}
          disabled={busy}
          onChange={(e) => void run(e.target.value)}
          className="h-9 w-full min-w-0 rounded-lg border border-transparent bg-surface px-1.5 text-sm text-ink hover:border-line focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus-soft"
        >
          <option value="">{emptyLabel}</option>
          {!known ? <option value={value}>{value}</option> : null}
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <CellState busy={busy} saved={saved && !error} />
      </div>
      {error ? (
        <p className="mt-0.5 text-[11px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CellState({ busy, saved }: { busy: boolean; saved: boolean }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center" aria-live="polite">
      {busy ? <Loader2 className="size-3.5 animate-spin text-muted" aria-label="Хадгалж байна" /> : null}
      {!busy && saved ? <Check className="size-3.5 text-emerald-600" aria-label="Хадгалагдлаа" /> : null}
    </span>
  );
}

function SourceCell({ item, sources }: { item: IncompleteItem; sources: Record<string, string> }) {
  const router = useRouter();
  const { owner } = item;
  if (owner.state !== "linked" || !owner.contactId) {
    return <span className="text-xs text-subtle">{owner.state === "hidden" ? "Харах эрхгүй" : "Эзэн алга"}</span>;
  }
  // «Бусад» тайлбар шаардана — картын эзний цонхоор.
  const options = Object.entries(sources)
    .filter(([code]) => code !== "other" || owner.source === "other")
    .map(([code, label]) => ({ value: code, label }));
  return (
    <SelectCell
      label={`${item.code} эзний эх сурвалж`}
      value={owner.source ?? ""}
      options={options}
      emptyLabel="Сонгоогүй"
      onSave={async (v) => {
        if (!v) return null;
        const res = await updateContact({ contact_id: owner.contactId as string, source: v }).catch(() => null);
        if (!res) return "Сүлжээ тасарлаа";
        if (!res.ok) return res.error;
        router.refresh();
        return null;
      }}
    />
  );
}

function OwnerCell({
  item,
  panel,
  profileId,
  sources,
}: {
  item: IncompleteItem;
  panel: Crm2Panel;
  profileId: string;
  sources: Record<string, string>;
}) {
  const router = useRouter();
  const p = crm2Paths(panel);
  const [open, setOpen] = React.useState(false);
  const { owner } = item;

  if (owner.state === "linked") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <Check className="size-3.5" aria-hidden /> Холбогдсон
      </span>
    );
  }
  if (owner.state === "hidden") return <span className="text-xs text-subtle">Харах эрхгүй</span>;
  if (owner.state === "pending") {
    // Хадгалсан утсыг картын эзний цонх урьдчилан бөглөнө (энд утас уншихгүй).
    return (
      <Link
        href={p.property(item.id, undefined, { sheet: "owner" })}
        className="inline-flex h-9 items-center gap-1 rounded-lg bg-amber-100 px-2 text-xs font-semibold text-amber-900 hover:bg-amber-200"
      >
        <UserRoundSearch className="size-3.5" aria-hidden />
        {OWNER_PENDING_LABEL}
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-lg border border-dashed border-line-strong px-2 text-xs font-medium text-ink hover:bg-surface-2"
      >
        + Утас оруулах
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={`${item.code} — эзэн`}>
        {open ? (
          <OwnerPhoneField
            idPrefix={`inc-${item.id}`}
            mode="live"
            meId={profileId}
            sources={sources}
            propertyId={item.id}
            flow="card"
            autoFocus
            onCancel={() => setOpen(false)}
            onSaved={(result) => {
              if (isFinal(result.status)) setOpen(false);
              router.refresh();
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}
