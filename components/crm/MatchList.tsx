"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, RefreshCcw, Send, TriangleAlert } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Field } from "@/components/ui/input";
import { MatchResponseButtons } from "@/components/crm/MatchResponseButtons";
import {
  recomputeMatchesForProfile,
  recomputeMatchesForProperty,
  suggestMatch,
} from "@/lib/actions/crm-matching";
import { fmtMNT, fmtDate } from "@/lib/format";
import { MATCH_STRENGTH_LABEL, type MatchStrength } from "@/lib/constants-crm";
import type { MatchRow } from "@/lib/queries-crm-matching";
import type { MatchBreakdownItem } from "@/lib/crm/matching";

/**
 * Тохируулгын жагсаалт (F-251/252/256/257/258): оноогоор эрэмбэлэгдсэн,
 * задаргаа нээгддэг, таслагдсан нь шалтгаантай тусад нь; санал болгох
 * (сул/таслагдсанд үндэслэл заавал, давхардлын анхааруулгатай) + 4 хариу.
 * perspective: 'profile' = профайлд объектууд, 'property' = объектод харилцагчид.
 */
export function MatchList({
  rows,
  perspective,
  targetId,
  basePath,
  canRecompute = true,
}: {
  rows: MatchRow[];
  perspective: "profile" | "property";
  /** perspective='profile' → need_profile_id; 'property' → property_id. */
  targetId: string;
  basePath: string;
  canRecompute?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openBreakdown, setOpenBreakdown] = useState<string | null>(null);
  const [suggestTarget, setSuggestTarget] = useState<MatchRow | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [duplicate, setDuplicate] = useState<{ id: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ok = rows.filter((r) => !r.deal_breaker_hit);
  const cut = rows.filter((r) => r.deal_breaker_hit);

  function recompute() {
    setError(null);
    startTransition(async () => {
      const res =
        perspective === "profile"
          ? await recomputeMatchesForProfile(targetId)
          : await recomputeMatchesForProperty(targetId);
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      router.refresh();
    });
  }

  function submitSuggest(row: MatchRow, confirmDuplicate: boolean) {
    setError(null);
    startTransition(async () => {
      const needsOverride = row.deal_breaker_hit || row.strength === "weak";
      const res = await suggestMatch(row.id, {
        overrideReason: needsOverride ? overrideReason.trim() : undefined,
        confirmDuplicate,
      });
      if (res.duplicateWarning) {
        setDuplicate({ id: row.id, message: res.duplicateWarning });
        return;
      }
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setSuggestTarget(null);
      setOverrideReason("");
      setDuplicate(null);
      router.refresh();
    });
  }

  function rowTitle(r: MatchRow) {
    if (perspective === "profile") {
      return (
        <Link href={`${basePath}/properties/${r.property_id}`} className="font-semibold text-ink hover:text-brand-700">
          {r.property_name ?? "?"} <span className="font-mono text-xs text-subtle">{r.property_number}</span>
        </Link>
      );
    }
    return (
      <Link href={`${basePath}/contacts/${r.contact_id}`} className="font-semibold text-ink hover:text-brand-700">
        {r.contact_name ?? "?"}
      </Link>
    );
  }

  function renderRow(r: MatchRow) {
    const breakdown = (Array.isArray(r.breakdown) ? r.breakdown : []) as unknown as MatchBreakdownItem[];
    const open = openBreakdown === r.id;
    const price =
      r.property_service_kind === "sale" ? r.property_price : (r.property_rent_price ?? r.property_price);
    return (
      <div key={r.id} className="border-b border-line px-4 py-3 last:border-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {rowTitle(r)}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
              {perspective === "profile" && price != null ? <span>{fmtMNT(Number(price))}</span> : null}
              {perspective === "property" && r.profile_type ? <span>Профайл: {r.profile_type}</span> : null}
              <span>Тооцсон: {fmtDate(r.computed_at)}</span>
              {r.suggested_at ? <span>· Санал болгосон: {fmtDate(r.suggested_at)}</span> : null}
              {r.manual_override_reason ? (
                <span className="text-amber-700">· Гар үндэслэл: {r.manual_override_reason}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-ink">{Number(r.score).toFixed(0)}</span>
            <Badge tone={MATCH_STRENGTH_LABEL[r.strength as MatchStrength]?.tone ?? "neutral"}>
              {MATCH_STRENGTH_LABEL[r.strength as MatchStrength]?.label ?? r.strength}
            </Badge>
            <button
              type="button"
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-700 hover:underline"
              onClick={() => setOpenBreakdown(open ? null : r.id)}
            >
              {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              Задаргаа
            </button>
          </div>
        </div>

        {r.deal_breaker_hit ? (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
            <TriangleAlert className="size-3.5" />
            Таслагдсан: {r.deal_breaker_reasons.join(", ") || "таслах нөхцөл зөрчсөн"} (F-252)
          </p>
        ) : null}

        {open ? (
          <div className="mt-2 grid gap-1 rounded-xl bg-surface-2 p-3 sm:grid-cols-2">
            {breakdown.map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted">{b.label}</span>
                <span className="font-semibold text-ink">
                  {b.earned}/{b.weight}
                  <span className="ml-1 font-normal text-subtle">({b.detail})</span>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {r.suggested_at ? (
            <MatchResponseButtons matchId={r.id} response={r.response} responseReason={r.response_reason} />
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setOverrideReason("");
                setDuplicate(null);
                if (r.deal_breaker_hit || r.strength === "weak") {
                  setSuggestTarget(r);
                } else {
                  submitSuggest(r, false);
                }
              }}
            >
              <Send className="size-3.5" /> Санал болгох
            </Button>
          )}
        </div>
        {duplicate?.id === r.id && suggestTarget === null ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>{duplicate.message}</span>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => submitSuggest(r, true)}>
              Тийм, дахин санал болгох
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDuplicate(null)}>
              Болих
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {ok.length} тохироо · {cut.length} таслагдсан
        </p>
        {canRecompute ? (
          <Button size="sm" variant="outline" onClick={recompute} disabled={pending}>
            <RefreshCcw className="size-3.5" /> {pending ? "Тооцож байна…" : "Дахин тооцох"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <Card>
        <CardBody className="p-0">
          {ok.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-subtle">
              Тохироо алга — профайл/объектын мэдээллийг бүрэн бөглөөд «Дахин тооцох» дарна уу.
            </p>
          ) : (
            ok.map(renderRow)
          )}
        </CardBody>
      </Card>

      {cut.length > 0 ? (
        <div>
          <h4 className="mb-1.5 inline-flex items-center gap-1 text-sm font-bold text-rose-700">
            <TriangleAlert className="size-4" /> Таслагдсан (deal breaker, F-252/258)
          </h4>
          <Card>
            <CardBody className="p-0">{cut.map(renderRow)}</CardBody>
          </Card>
        </div>
      ) : null}

      {/* Сул/таслагдсаныг гараар санал болгох — үндэслэл заавал (F-252) */}
      <Modal
        open={!!suggestTarget}
        onClose={() => setSuggestTarget(null)}
        title="Гараар санал болгох — үндэслэл"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setSuggestTarget(null)} disabled={pending}>
              Болих
            </Button>
            <Button
              onClick={() => suggestTarget && submitSuggest(suggestTarget, duplicate?.id === suggestTarget.id)}
              disabled={pending || !overrideReason.trim()}
            >
              {pending
                ? "Илгээж байна…"
                : duplicate && suggestTarget && duplicate.id === suggestTarget.id
                  ? "Тийм, дахин санал болгох"
                  : "Санал болгох"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {suggestTarget?.deal_breaker_hit ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Таслах нөхцөл зөрчсөн: {suggestTarget.deal_breaker_reasons.join(", ") || "—"}. Оноо өндөр байсан ч
              автомат санал болголтод ораагүй (F-252).
            </p>
          ) : (
            <p className="text-xs text-muted">Сул тохироог зөвхөн агентын бичгэн тайлбартай санал болгоно (F-250).</p>
          )}
          {duplicate && suggestTarget && duplicate.id === suggestTarget.id ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {duplicate.message}
            </p>
          ) : null}
          <Field label="Агентын үндэслэл (заавал)">
            <Input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Яагаад энэ объектыг санал болгож байгаа тайлбар…"
            />
          </Field>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
