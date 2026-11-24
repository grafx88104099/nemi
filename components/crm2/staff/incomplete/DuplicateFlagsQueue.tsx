"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";

import { resolveDuplicate } from "@/lib/crm2/actions/duplicates";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import type { DuplicateFlagListItem } from "@/lib/crm2/queries/duplicates";
import { fmtShortDateTime } from "@/lib/format";

import { DUP_KIND_LABEL, dupReasonsText } from "./incomplete-model";

type Decision = "distinct" | "duplicate" | "dismissed";

const DECISIONS: { value: Decision; label: string }[] = [
  { value: "distinct", label: "Тусдаа хөрөнгө" },
  { value: "duplicate", label: "Давхардсан" },
  { value: "dismissed", label: "Хаах" },
];

/**
 * Давхардлын тэмдэглэлийн дараалал (ахлагч, менежер). Харах эрхгүй хөрөнгийн код огт харагдахгүй
 * («харах эрхгүй»). Эзний мэдээлэл байхгүй — зөвхөн шалтгаан, агентын тайлбар.
 */
export function DuplicateFlagsQueue({ flags, panel }: { flags: DuplicateFlagListItem[]; panel: Crm2Panel }) {
  const p = crm2Paths(panel);
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Record<string, Decision>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  if (!flags.length) return null;

  async function decide(id: string, status: Decision) {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    const res = await resolveDuplicate({ flagId: id, status }).catch(() => null);
    setBusy(null);
    if (!res || !res.ok) {
      setErrors((e) => ({ ...e, [id]: res && !res.ok ? res.error : "Сүлжээ тасарлаа" }));
      return;
    }
    setDone((d) => ({ ...d, [id]: status }));
    router.refresh();
  }

  const open = flags.filter((f) => !done[f.id]);

  return (
    <section aria-label="Давхардлын тэмдэглэл" className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Copy className="size-4 text-brand-600" aria-hidden />
        Давхардлын тэмдэглэл ({open.length})
      </h2>
      {open.length === 0 ? <p className="mt-2 text-sm text-muted">Бүгдийг шийдвэрлэлээ.</p> : null}
      <ul className="mt-2 divide-y divide-line">
        {open.map((f) => (
          <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="flex flex-wrap items-center gap-1.5">
                <Link href={p.property(f.property.id)} className="font-mono text-xs font-semibold text-ink hover:underline">
                  {f.property.code ?? "Хөрөнгө"}
                </Link>
                <span className="text-muted">↔</span>
                {f.match.id ? (
                  <Link href={p.property(f.match.id)} className="font-mono text-xs font-semibold text-ink hover:underline">
                    {f.match.code ?? "Хөрөнгө"}
                  </Link>
                ) : (
                  <span className="text-xs text-subtle">харах эрхгүй хөрөнгө</span>
                )}
              </p>
              <p className="mt-0.5 text-muted">
                {DUP_KIND_LABEL[f.kind]} · {dupReasonsText(f.reasons)}
              </p>
              {f.agentNote ? <p className="mt-0.5 line-clamp-2 text-ink">«{f.agentNote}»</p> : null}
              <p className="mt-0.5 text-xs text-subtle">
                {f.flaggedByName ?? "Агент"} · {fmtShortDateTime(f.flaggedAt)}
              </p>
              {errors[f.id] ? (
                <p className="mt-1 text-xs text-danger" role="alert">
                  {errors[f.id]}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              {DECISIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  disabled={busy === f.id}
                  onClick={() => void decide(f.id, d.value)}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
                >
                  {busy === f.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                  {d.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
