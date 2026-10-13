"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createComplaint, resolveComplaint } from "@/lib/actions/crm-post-sale";

/**
 * Гомдлын самбар (P-09 алхам 4) — NPS-ээс автомат/гараар нээгдсэн гомдлыг
 * төлөвөөр хянана. Ноцтой (serious) шийдэгдээгүй гомдол шимтгэлийн hold
 * нөхцөл (F-461) тул тодоор ялгаж үзүүлнэ.
 */

export type ComplaintRow = {
  id: string;
  contact_id: string;
  contact_name?: string | null;
  transaction_id: string | null;
  txn_number?: string | null;
  source: "nps" | "manual" | "maintenance";
  severity: "normal" | "serious";
  description: string;
  status: "open" | "in_progress" | "resolved";
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
};

const SOURCE_LABEL: Record<ComplaintRow["source"], string> = {
  nps: "NPS",
  manual: "Гараар",
  maintenance: "Засвар",
};

const STATUS_META: Record<ComplaintRow["status"], { label: string; tone: "amber" | "blue" | "green" }> = {
  open: { label: "Нээлттэй", tone: "amber" },
  in_progress: { label: "Шийдвэрлэж буй", tone: "blue" },
  resolved: { label: "Шийдвэрлэсэн", tone: "green" },
};

export function ComplaintShell({
  complaints,
  contactOptions = [],
  defaultContactId,
}: {
  complaints: ComplaintRow[];
  /** Гар бүртгэлийн харилцагчийн сонголт (id + нэр). */
  contactOptions?: { id: string; name: string }[];
  defaultContactId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | ComplaintRow["status"]>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [resolveFor, setResolveFor] = useState<ComplaintRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Шинэ гомдлын маягт.
  const [contactId, setContactId] = useState(defaultContactId ?? contactOptions[0]?.id ?? "");
  const [severity, setSeverity] = useState<"normal" | "serious">("normal");
  const [description, setDescription] = useState("");

  // Шийдвэрлэлтийн маягт.
  const [resolution, setResolution] = useState("");

  const rows = useMemo(
    () => (filter === "all" ? complaints : complaints.filter((c) => c.status === filter)),
    [complaints, filter]
  );
  const openSerious = complaints.filter((c) => c.severity === "serious" && c.status !== "resolved").length;

  function submitCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createComplaint({
        contactId,
        transactionId: null,
        source: "manual",
        severity,
        description: description.trim(),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setCreateOpen(false);
      setDescription("");
      setSeverity("normal");
      router.refresh();
    });
  }

  function submitResolve(status: "in_progress" | "resolved") {
    if (!resolveFor) return;
    setError(null);
    startTransition(async () => {
      const res = await resolveComplaint({
        id: resolveFor.id,
        status,
        resolution: resolution.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Алдаа гарлаа.");
        return;
      }
      setResolveFor(null);
      setResolution("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600" />
          <span className="text-sm font-semibold text-ink">Гомдол</span>
          {openSerious > 0 && <Badge tone="rose">Ноцтой нээлттэй: {openSerious}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-44">
            <option value="all">Бүх төлөв</option>
            <option value="open">Нээлттэй</option>
            <option value="in_progress">Шийдвэрлэж буй</option>
            <option value="resolved">Шийдвэрлэсэн</option>
          </Select>
          {contactOptions.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Гомдол бүртгэх
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Гомдлын бүртгэл алга.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map((c) => (
            <li key={c.id} className="space-y-1 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_META[c.status].tone}>{STATUS_META[c.status].label}</Badge>
                {c.severity === "serious" && <Badge tone="rose">Ноцтой</Badge>}
                <Badge tone="neutral">{SOURCE_LABEL[c.source]}</Badge>
                <span className="text-sm font-medium text-ink">{c.contact_name ?? c.contact_id}</span>
                {c.txn_number && <span className="text-xs text-subtle">{c.txn_number}</span>}
                <span className="ml-auto text-xs text-subtle">
                  {new Date(c.created_at).toLocaleDateString("mn-MN")}
                </span>
              </div>
              <p className="text-sm text-muted">{c.description}</p>
              {c.status === "resolved" ? (
                <p className="flex items-center gap-1 text-xs text-subtle">
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                  {c.resolution}
                  {c.resolved_at && ` (${new Date(c.resolved_at).toLocaleDateString("mn-MN")})`}
                </p>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setResolveFor(c)} disabled={pending}>
                  Шийдвэрлэх
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && !createOpen && !resolveFor && <p className="text-sm text-danger">{error}</p>}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Гомдол бүртгэх"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Болих
            </Button>
            <Button onClick={submitCreate} disabled={pending || !contactId || !description.trim()}>
              {pending ? "Хадгалж байна…" : "Бүртгэх"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Харилцагч">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {contactOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ноцтой байдал" hint="Ноцтой гомдол шийдэгдтэл холбогдох шимтгэл түр саатна (F-461).">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as "normal" | "serious")}>
              <option value="normal">Энгийн</option>
              <option value="serious">Ноцтой</option>
            </Select>
          </Field>
          <Field label="Агуулга">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Гомдлын дэлгэрэнгүй…"
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={!!resolveFor}
        onClose={() => setResolveFor(null)}
        title="Гомдол шийдвэрлэх"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResolveFor(null)}>
              Болих
            </Button>
            {resolveFor?.status === "open" && (
              <Button variant="secondary" onClick={() => submitResolve("in_progress")} disabled={pending}>
                Шийдвэрлэж эхлэх
              </Button>
            )}
            <Button onClick={() => submitResolve("resolved")} disabled={pending || !resolution.trim()}>
              {pending ? "Хадгалж байна…" : "Шийдвэрлэсэн болгох"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">{resolveFor?.description}</p>
          <Field label="Шийдвэрлэлтийн тайлбар" hint="«Шийдвэрлэсэн» төлөвт тайлбар заавал.">
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Хэрхэн шийдвэрлэсэн…"
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
