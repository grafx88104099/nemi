"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Copy, ExternalLink, KeyRound, SplitSquareHorizontal } from "lucide-react";

import { Button, buttonClasses } from "@/components/ui/button";
import { archiveMyDuplicate, flagDuplicate } from "@/lib/crm2/actions/duplicates";
import { logUiEvent } from "@/lib/crm2/actions/events";
import { PROPERTY_STATUS_LABEL } from "@/lib/crm2/labels";
import { crm2Paths, panelFromPathname } from "@/lib/crm2/paths";
import type { Crm2ApplyOutcome, Crm2PropertyDuplicate } from "@/lib/crm2/types";

const REASON_LABEL: Record<string, string> = {
  project_floor_area: "Төсөл, давхар, талбай ойролцоо",
  owner_phone: "Эзний утас ижил",
  listing: "Ижил зар",
};

const DISTINCT_NOTE_MAX = 1000;

/** logUiEvent fire-and-forget: сүлжээгүй үед ч алдаа гаргахгүй. */
function track(e: Parameters<typeof logUiEvent>[0]): void {
  try {
    const p: unknown = logUiEvent(e);
    if (p instanceof Promise) p.catch(() => {});
  } catch {
    /* хэмжилт — алгасна */
  }
}

type RowState =
  | { kind: "idle" }
  | { kind: "distinct_form"; note: string }
  | { kind: "sending"; note: string; action: "access" | "distinct" }
  | { kind: "access_sent" }
  | { kind: "distinct_sent" };

type ArchiveState = "idle" | "confirm" | "sending" | "applied" | "pending";

/**
 * «Ижил төстэй хөрөнгө оффист бүртгэлтэй» (P11). Хадгалсны дараа гарна; хадгалалтыг хэзээ ч хаахгүй.
 * Мөр бүрт: [Нээх] — зөвхөн can_open; [Хандах эрх хүсэх] — харах эрхгүй илэрцэд (token-оор);
 * [Тусдаа хөрөнгө] — шалтгаантай. «Давхардал — миний ноорогийг архивлах» — зөвшөөрөл шаардвал хүсэлт.
 * Эзний мэдээлэл огт харуулахгүй, фокус хулгайлахгүй (aria-live=polite).
 */
export function DuplicateNotice({
  propertyId,
  duplicates,
  onArchived,
}: {
  propertyId: string;
  duplicates: Crm2PropertyDuplicate[];
  onArchived?: (outcome: Crm2ApplyOutcome) => void;
}) {
  const pathname = usePathname();
  const paths = crm2Paths(panelFromPathname(pathname));
  const [rows, setRows] = React.useState<Record<string, RowState>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [archive, setArchive] = React.useState<ArchiveState>("idle");
  const [archiveError, setArchiveError] = React.useState<string | null>(null);

  const count = duplicates.length;
  const shownRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!count || shownRef.current === propertyId) return;
    shownRef.current = propertyId;
    const hidden = duplicates.filter((d) => !d.can_open).length;
    track({ event: "dup_shown", property_id: propertyId, meta: { count, hidden } });
  }, [count, duplicates, propertyId]);

  if (!count) return null;

  const rowOf = (token: string): RowState => rows[token] ?? { kind: "idle" };
  const setRow = (token: string, s: RowState) => setRows((r) => ({ ...r, [token]: s }));
  const setError = (token: string, text: string | null) =>
    setErrors((e) => {
      const next = { ...e };
      if (text) next[token] = text;
      else delete next[token];
      return next;
    });

  async function send(token: string, kind: "access" | "distinct", note?: string) {
    const prev = rowOf(token);
    setRow(token, { kind: "sending", note: note ?? "", action: kind });
    setError(token, null);
    try {
      const res = await flagDuplicate({ propertyId, token, kind, note: note?.trim() || undefined });
      if (!res.ok) {
        setRow(token, prev);
        setError(token, res.error);
        return;
      }
      setRow(token, { kind: kind === "access" ? "access_sent" : "distinct_sent" });
      track({ event: kind === "access" ? "dup_access_requested" : "dup_marked_distinct", property_id: propertyId });
    } catch {
      setRow(token, prev);
      setError(token, "Илгээж чадсангүй. Сүлжээгээ шалгаад дахин оролдоно уу.");
    }
  }

  async function doArchive() {
    setArchive("sending");
    setArchiveError(null);
    try {
      const res = await archiveMyDuplicate(propertyId);
      if (!res.ok) {
        setArchive("confirm");
        setArchiveError(res.error);
        return;
      }
      const outcome: Crm2ApplyOutcome = res.data === "pending" ? "pending" : "applied";
      setArchive(outcome);
      track({ event: "dup_archived_mine", property_id: propertyId, meta: { pending: outcome === "pending" } });
      onArchived?.(outcome);
    } catch {
      setArchive("confirm");
      setArchiveError("Архивлаж чадсангүй. Дахин оролдоно уу.");
    }
  }

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Давхардсан байж болзошгүй хөрөнгө"
      className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
    >
      <div className="flex items-start gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800">
          <Copy className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 leading-snug">
          <p className="text-sm font-semibold text-amber-900">Ижил төстэй хөрөнгө оффист бүртгэлтэй</p>
          <p className="text-xs text-amber-900">Таны бүртгэл хадгалагдсан. Давхардал эсэхийг шалгана уу.</p>
        </div>
      </div>

      <ul className="space-y-2">
        {duplicates.map((d) => {
          const st = rowOf(d.token);
          const err = errors[d.token];
          const sending = st.kind === "sending";
          const noteId = `dup-note-${d.token}`;
          const reasons = (d.reasons ?? []).map((r) => REASON_LABEL[r] ?? r).join(", ");
          return (
            <li key={d.token} className="space-y-2 rounded-lg bg-surface px-3 py-2.5">
              <div className="min-w-0 text-sm leading-snug">
                {d.can_open && d.code ? (
                  <p className="font-semibold text-ink">
                    {d.code}
                    {d.status ? <span className="font-normal text-muted"> · {PROPERTY_STATUS_LABEL[d.status]}</span> : null}
                  </p>
                ) : (
                  <p className="font-semibold text-ink">Оффисын өөр хөрөнгө</p>
                )}
                {d.can_open && d.agent_name ? <p className="text-xs text-muted">Агент: {d.agent_name}</p> : null}
                {reasons ? <p className="text-xs text-muted">{reasons}</p> : null}
              </div>

              {st.kind === "access_sent" ? (
                <p className="text-sm font-medium text-emerald-800">Хандах эрхийн хүсэлт илгээгдлээ</p>
              ) : st.kind === "distinct_sent" ? (
                <p className="text-sm font-medium text-emerald-800">Тусдаа хөрөнгө гэж тэмдэглэлээ — ахлагч шалгана</p>
              ) : st.kind === "distinct_form" || (st.kind === "sending" && st.action === "distinct") ? (
                <div className="space-y-2">
                  <label htmlFor={noteId} className="block text-sm font-medium text-ink">
                    Яагаад тусдаа хөрөнгө вэ?
                  </label>
                  <textarea
                    id={noteId}
                    rows={2}
                    maxLength={DISTINCT_NOTE_MAX}
                    value={st.note}
                    disabled={sending}
                    placeholder="Жишээ: өөр блок, өөр тоот"
                    onChange={(e) => setRow(d.token, { kind: "distinct_form", note: e.target.value })}
                    className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="md"
                      disabled={sending || !st.note.trim()}
                      onClick={() => send(d.token, "distinct", st.note)}
                    >
                      {sending ? "Илгээж байна…" : "Илгээх"}
                    </Button>
                    <Button type="button" size="md" variant="ghost" disabled={sending} onClick={() => setRow(d.token, { kind: "idle" })}>
                      Болих
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                  {d.can_open && d.property_id ? (
                    <Link
                      href={paths.property(d.property_id)}
                      className={buttonClasses("outline", "md", "px-3")}
                      onClick={() => track({ event: "dup_opened", property_id: propertyId })}
                    >
                      <ExternalLink className="size-4" aria-hidden />
                      Нээх
                    </Link>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      className="px-3"
                      disabled={sending}
                      onClick={() => send(d.token, "access")}
                    >
                      <KeyRound className="size-4" aria-hidden />
                      {sending ? "Илгээж байна…" : "Хандах эрх хүсэх"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    className="px-3"
                    disabled={sending}
                    onClick={() => setRow(d.token, { kind: "distinct_form", note: "" })}
                  >
                    <SplitSquareHorizontal className="size-4" aria-hidden />
                    Тусдаа хөрөнгө
                  </Button>
                </div>
              )}
              {err ? <p className="text-sm text-rose-700">{err}</p> : null}
            </li>
          );
        })}
      </ul>

      {archive === "applied" ? (
        <p className="text-sm font-medium text-emerald-800">Ноорог архивлагдлаа</p>
      ) : archive === "pending" ? (
        <p className="text-sm font-medium text-emerald-800">Архивлах хүсэлт илгээгдлээ</p>
      ) : archive === "confirm" || archive === "sending" ? (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
          <p className="text-sm text-ink">Энэ ноорогийг архивлах уу? Архиваас дахин сэргээж болно.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="danger" size="md" disabled={archive === "sending"} onClick={doArchive}>
              {archive === "sending" ? "Түр хүлээнэ үү…" : "Тийм, архивлах"}
            </Button>
            <Button type="button" variant="ghost" size="md" disabled={archive === "sending"} onClick={() => setArchive("idle")}>
              Болих
            </Button>
          </div>
          {archiveError ? <p className="text-sm text-rose-700">{archiveError}</p> : null}
        </div>
      ) : (
        <Button type="button" variant="outline" size="md" className="w-full" onClick={() => setArchive("confirm")}>
          <Archive className="size-4" aria-hidden />
          Давхардал — миний ноорогийг архивлах
        </Button>
      )}
    </section>
  );
}
