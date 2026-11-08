"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Link2, Plus, Printer, QrCode as QrIcon, Search, Share2, FileBarChart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Field } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { QrCode } from "@/components/crm/links/QrCode";
import {
  createCollectionLink,
  createOpenHouse,
  createOwnerReportLink,
  getCollectionOptions,
  revokeOpenHouse,
  revokePublicLink,
  searchLinkProperties,
  updateOwnerReportNote,
  type CollectionOption,
} from "@/lib/actions/crm-public-links";
import { searchOpportunitySources } from "@/lib/actions/crm-opportunities";
import type { MyLinkRow, MyOpenHouseRow } from "@/lib/queries-crm-links";
import type { DealSourceOption, PropertyOption } from "@/lib/queries-crm-pipeline";
import { LINK_STATE_LABEL, OPEN_HOUSE_STATE_LABEL } from "@/lib/crm/public-links-labels";
import { MATCH_RESPONSE_LABEL } from "@/lib/constants-crm";
import { fmtMNT, fmtShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Харилцагчид гарах холбоос (R9, R10, R11): сонголтын жагсаалт, өмчлөгчийн
 * явцын тайлан, нээлттэй үзлэгийн/байнгын QR. Холбоос, QR-ыг зөвхөн
 * үүсгэх үед нэг удаа харуулна — DB-д hash л хадгалагдана.
 */

type Tab = "collections" | "owner" | "qr";
type Result = { kind: "collection" | "owner_report" | "open_house"; url: string; title: string };

function fmtDt(iso: string | null): string {
  if (!iso) return "—";
  return fmtShortDateTime(iso);
}

export function LinksShell({ links, openHouses, unavailable }: { links: MyLinkRow[]; openHouses: MyOpenHouseRow[]; unavailable: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const initialTab: Tab = sp.get("tab") === "qr" || sp.get("new") === "open_house" ? "qr" : sp.get("tab") === "owner" ? "owner" : "collections";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [form, setForm] = useState<"collection" | "owner_report" | "open_house" | null>(
    sp.get("new") === "collection" ? "collection" : sp.get("new") === "open_house" ? "open_house" : sp.get("new") === "owner_report" ? "owner_report" : null
  );
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (sp.get("new")) router.replace("/agent/crm/links" + (tab !== "collections" ? `?tab=${tab}` : ""), { scroll: false });
    // зөвхөн анх ачаалахад
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (unavailable) {
    return <EmptyState title="Холбоосын боломж идэвхжээгүй байна" description="Өгөгдлийн сангийн шинэчлэл хүлээгдэж байна." />;
  }

  const collections = links.filter((l) => l.kind === "collection");
  const reports = links.filter((l) => l.kind === "owner_report");

  return (
    <div>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        items={[
          { value: "collections", label: `Сонголтын жагсаалт (${collections.length})` },
          { value: "owner", label: `Өмчлөгчийн тайлан (${reports.length})` },
          { value: "qr", label: `Нээлттэй үзлэг, QR (${openHouses.length})` },
        ]}
        className="mb-3"
      />

      {tab === "collections" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => setForm("collection")}>
              <Plus className="size-4" /> Шинэ жагсаалт
            </Button>
            <p className="text-xs text-muted">3–7 листингийг нэг холбоосоор илгээж, харилцагч нэвтрэлгүйгээр хариу өгнө.</p>
          </div>
          {collections.length === 0 ? (
            <EmptyState compact icon={Link2} title="Жагсаалт илгээгээгүй байна" description="Харилцагчийн тохируулгаас 3–7 листинг сонгож холбоос үүсгэнэ." />
          ) : (
            <ul className="space-y-2">
              {collections.map((l) => (
                <LinkCard key={l.id} row={l} />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "owner" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => setForm("owner_report")}>
              <Plus className="size-4" /> Шинэ тайлангийн холбоос
            </Button>
            <p className="text-xs text-muted">Өмчлөгч листингийнхээ явцыг (санал болголт, үзлэг, ангилсан санал, үнийн түүх) харна.</p>
          </div>
          {reports.length === 0 ? (
            <EmptyState compact icon={FileBarChart} title="Тайлангийн холбоос алга" description="Листинг сонгож өмчлөгчид илгээх холбоос үүсгэнэ." />
          ) : (
            <ul className="space-y-2">
              {reports.map((l) => (
                <LinkCard key={l.id} row={l} />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "qr" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => setForm("open_house")}>
              <QrIcon className="size-4" /> Шинэ QR
            </Button>
            <p className="text-xs text-muted">Зочин QR уншуулж бүртгүүлэхэд сэжим листингийн агентад шууд үүсч, эхний холболтын хугацаа эхэлнэ.</p>
          </div>
          {openHouses.length === 0 ? (
            <EmptyState compact icon={QrIcon} title="QR бүртгэл алга" description="Нээлттэй үзлэг эсвэл үл хөдлөхийн байнгын QR үүсгэнэ." />
          ) : (
            <ul className="space-y-2">
              {openHouses.map((o) => (
                <OpenHouseCard key={o.id} row={o} />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {form === "collection" ? <CollectionForm onClose={() => setForm(null)} onDone={(r) => { setForm(null); setResult(r); setTab("collections"); }} /> : null}
      {form === "owner_report" ? <OwnerReportForm onClose={() => setForm(null)} onDone={(r) => { setForm(null); setResult(r); setTab("owner"); }} /> : null}
      {form === "open_house" ? <OpenHouseForm onClose={() => setForm(null)} onDone={(r) => { setForm(null); setResult(r); setTab("qr"); }} /> : null}
      {result ? <ResultModal result={result} onClose={() => setResult(null)} /> : null}
    </div>
  );
}

function LinkCard({ row }: { row: MyLinkRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState(row.note ?? "");
  const st = LINK_STATE_LABEL[row.state];
  const responded = row.items.filter((i) => i.response).length;
  return (
    <li className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">
          {row.kind === "collection" ? row.contact_name ?? "Харилцагч" : row.property_label ?? "Үл хөдлөх"}
        </span>
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className="text-xs text-muted">
          {row.open_count} удаа нээсэн{row.last_opened_at ? ` · сүүлд ${fmtDt(row.last_opened_at)}` : ""} · дуусах {fmtDt(row.expires_at)}
        </span>
        {row.state === "active" ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await revokePublicLink(row.id);
                if (!r.ok) toast.error(r.error ?? "Цуцалж чадсангүй.");
                else {
                  toast.success("Холбоос цуцлагдлаа");
                  router.refresh();
                }
              })
            }
          >
            Цуцлах
          </Button>
        ) : null}
      </div>
      {row.kind === "collection" ? (
        <>
          <p className="mt-1 text-xs text-muted">
            {responded}/{row.items.length} листингт хариу өгсөн
            {row.contact_id ? (
              <>
                {" · "}
                <Link href={row.lead_id ? `/agent/crm/leads/${row.lead_id}` : `/agent/crm/contacts/${row.contact_id}`} className="text-brand-700 hover:underline">
                  Карт нээх
                </Link>
              </>
            ) : null}
          </p>
          <ul className="mt-2 space-y-1">
            {row.items.map((i) => (
              <li key={i.property_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{i.label}</span>
                {i.response ? (
                  <Badge tone={MATCH_RESPONSE_LABEL[i.response].tone}>{MATCH_RESPONSE_LABEL[i.response].label}</Badge>
                ) : (
                  <span className="text-xs text-subtle">Хариу хүлээгдэж байна</span>
                )}
                {i.comment ? <span className="w-full text-xs text-muted">«{i.comment}»</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Өмчлөгчид харагдах дараагийн алхам" disabled={row.state !== "active"} />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || row.state !== "active" || note === (row.note ?? "")}
            onClick={() =>
              start(async () => {
                const r = await updateOwnerReportNote(row.id, note);
                if (!r.ok) toast.error(r.error ?? "Хадгалж чадсангүй.");
                else {
                  toast.success("Дараагийн алхам шинэчлэгдлээ");
                  router.refresh();
                }
              })
            }
          >
            Хадгалах
          </Button>
        </div>
      )}
    </li>
  );
}

function OpenHouseCard({ row }: { row: MyOpenHouseRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const st = OPEN_HOUSE_STATE_LABEL[row.state];
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{row.title || row.property_label}</span>
        <span className="block text-xs text-muted">
          {row.kind === "permanent" ? "Байнгын QR" : `Нээлттэй үзлэг · ${fmtDt(row.starts_at)} – ${fmtDt(row.ends_at)}`} · {row.visit_count} бүртгэл
        </span>
      </span>
      <Badge tone={st.tone}>{st.label}</Badge>
      {row.state !== "revoked" && row.state !== "closed" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await revokeOpenHouse(row.id);
              if (!r.ok) toast.error(r.error ?? "Цуцалж чадсангүй.");
              else {
                toast.success("QR цуцлагдлаа");
                router.refresh();
              }
            })
          }
        >
          Цуцлах
        </Button>
      ) : null}
      <Link href={`/agent/crm/properties/${row.property_id}`} className="text-xs text-brand-700 hover:underline">
        Үл хөдлөх
      </Link>
    </li>
  );
}

// ── Маягтууд ─────────────────────────────────────────────

function CollectionForm({ onClose, onDone }: { onClose: () => void; onDone: (r: Result) => void }) {
  const [q, setQ] = useState("");
  const [sources, setSources] = useState<DealSourceOption[]>([]);
  const [picked, setPicked] = useState<DealSourceOption | null>(null);
  const [options, setOptions] = useState<CollectionOption[]>([]);
  const [consent, setConsent] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (picked || q.trim().length < 2) return;
    const t = setTimeout(async () => setSources(await searchOpportunitySources(q)), 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  async function choose(s: DealSourceOption) {
    setPicked(s);
    setLoading(true);
    const r = await getCollectionOptions(s.contact_id);
    setLoading(false);
    if (r.error) toast.error(r.error);
    setOptions(r.options);
    setConsent(r.consent);
    setSel(r.options.slice(0, 5).map((o) => o.property_id));
  }

  function save() {
    if (!picked) return;
    start(async () => {
      const r = await createCollectionLink({
        contactId: picked.contact_id,
        leadId: picked.kind === "lead" ? picked.id : null,
        propertyIds: sel,
        title,
      });
      if (r.error || !r.url) {
        toast.error(r.error ?? "Үүсгэж чадсангүй.");
        return;
      }
      onDone({ kind: "collection", url: r.url, title: picked.label });
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Сонголтын жагсаалт илгээх"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={save} disabled={!picked || pending || consent === "declined"}>
            Холбоос үүсгэх ({sel.length})
          </Button>
        </div>
      }
    >
      {!picked ? (
        <Field label="Харилцагч">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Нэр, утас…" className="pl-9" autoFocus />
          </div>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {(q.trim().length >= 2 ? sources : []).map((s) => (
              <li key={`${s.kind}:${s.id}`}>
                <button type="button" onClick={() => choose(s)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-surface-2">
                  <span className="block text-sm font-medium text-ink">{s.label}</span>
                  <span className="block text-xs text-muted">{s.kind === "lead" ? "Нээлттэй сэжим" : "Харилцагч"}{s.sub ? ` · ${s.sub}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </Field>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="font-medium text-ink">{picked.label}</span>
            <button type="button" className="ml-auto text-xs text-brand-700" onClick={() => { setPicked(null); setOptions([]); setSel([]); }}>
              Солих
            </button>
          </div>
          {consent === "declined" ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">Харилцагч мэдээлэл хүлээн авахаас татгалзсан тул холбоос илгээхгүй.</p>
          ) : null}
          {loading ? <p className="text-sm text-muted">Тохирох листинг хайж байна…</p> : null}
          {!loading && options.length === 0 ? (
            <EmptyState compact title="Тохирох идэвхтэй листинг алга" description="Харилцагчийн хэрэгцээний профайлыг бөглөхөд тохируулга гарна." />
          ) : null}
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {options.map((o) => {
              const on = sel.includes(o.property_id);
              return (
                <li key={o.property_id}>
                  <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2", on ? "border-brand-300 bg-brand-50" : "border-line")}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setSel((s) => (on ? s.filter((x) => x !== o.property_id) : [...s, o.property_id]))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{o.number} · {o.name}</span>
                      <span className="block text-xs text-muted">
                        {o.price ? fmtMNT(o.price) : o.rent_price ? `${fmtMNT(o.rent_price)} / сар` : "Үнэ бүртгэгдээгүй"}
                        {o.strength === "strong" ? " · Хүчтэй тохирол" : o.strength === "possible" ? " · Боломжит" : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Field label="Гарчиг (заавал биш)">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Жишээ: Хан-Уулын 3 өрөө сонголтууд" maxLength={80} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function PropertyPicker({ value, onChange }: { value: PropertyOption | null; onChange: (p: PropertyOption | null) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PropertyOption[]>([]);
  useEffect(() => {
    if (value || q.trim().length < 1) return;
    const t = setTimeout(async () => setRows(await searchLinkProperties(q)), 250);
    return () => clearTimeout(t);
  }, [q, value]);
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
        <span className="font-medium text-ink">{value.number} · {value.name}</span>
        <button type="button" className="ml-auto text-xs text-brand-700" onClick={() => onChange(null)}>
          Солих
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Үл хөдлөхийн дугаар, нэр…" className="pl-9" autoFocus />
      </div>
      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {(q.trim().length >= 1 ? rows : []).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onChange(p)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-surface-2">
              <span className="block text-sm font-medium text-ink">{p.number} · {p.name}</span>
              <span className="block text-xs text-muted">{p.status === "active" ? "Идэвхтэй листинг" : "Идэвхгүй"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OwnerReportForm({ onClose, onDone }: { onClose: () => void; onDone: (r: Result) => void }) {
  const [prop, setProp] = useState<PropertyOption | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal
      open
      onClose={onClose}
      title="Өмчлөгчийн явцын тайлан"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Болих
          </Button>
          <Button
            disabled={!prop || pending}
            onClick={() =>
              start(async () => {
                if (!prop) return;
                const r = await createOwnerReportLink({ propertyId: prop.id, note });
                if (r.error || !r.url) toast.error(r.error ?? "Үүсгэж чадсангүй.");
                else onDone({ kind: "owner_report", url: r.url, title: `${prop.number} · ${prop.name}` });
              })
            }
          >
            Холбоос үүсгэх
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Үл хөдлөх">
          <PropertyPicker value={prop} onChange={setProp} />
        </Field>
        <Field label="Дараагийн алхам" hint="Өмчлөгчид тайлан дээр харагдана. Дараа нь шинэчилж болно.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Жишээ: Бямба гарагт нээлттэй үзлэг зохион байгуулна" maxLength={500} />
        </Field>
        <p className="text-xs text-muted">Тайланд худалдан авагчийн нэр, утас, үнийн саналын дүн гарахгүй.</p>
      </div>
    </Modal>
  );
}

function toIso(local: string): string | null {
  if (!local) return null;
  const t = Date.parse(local);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function OpenHouseForm({ onClose, onDone }: { onClose: () => void; onDone: (r: Result) => void }) {
  const [prop, setProp] = useState<PropertyOption | null>(null);
  const [kind, setKind] = useState<"open_house" | "permanent">("open_house");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal
      open
      onClose={onClose}
      title="Нээлттэй үзлэгийн QR"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Болих
          </Button>
          <Button
            disabled={!prop || pending || (kind === "open_house" && (!starts || !ends))}
            onClick={() =>
              start(async () => {
                if (!prop) return;
                const r = await createOpenHouse({ propertyId: prop.id, kind, startsAt: toIso(starts), endsAt: toIso(ends), title });
                if (r.error || !r.url) toast.error(r.error ?? "Үүсгэж чадсангүй.");
                else onDone({ kind: "open_house", url: r.url, title: title || `${prop.number} · ${prop.name}` });
              })
            }
          >
            QR үүсгэх
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Үл хөдлөх">
          <PropertyPicker value={prop} onChange={setProp} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {(["open_house", "permanent"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn("rounded-xl border px-3 py-2 text-left text-sm", kind === k ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line text-ink")}
            >
              <span className="block font-medium">{k === "open_house" ? "Нээлттэй үзлэг" : "Байнгын QR"}</span>
              <span className="block text-xs text-muted">{k === "open_house" ? "Тодорхой цагт" : "Хаалга, зар дээр"}</span>
            </button>
          ))}
        </div>
        {kind === "open_house" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Эхлэх">
              <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </Field>
            <Field label="Дуусах">
              <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </Field>
          </div>
        ) : null}
        <Field label="Гарчиг (заавал биш)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Жишээ: Бямба гарагийн нээлттэй үзлэг" maxLength={80} />
        </Field>
        <p className="text-xs text-muted">Бүртгүүлсэн зочин листингийн агентын сэжим болж, давхардлын шалгалтаар дамжина.</p>
      </div>
    </Modal>
  );
}

function ResultModal({ result, onClose }: { result: Result; onClose: () => void }) {
  const message =
    result.kind === "collection"
      ? `Сайн байна уу! Таны хэрэгцээнд тохирох сонголтуудыг бэлтгэлээ. Таалагдсан эсэхээ эндээс тэмдэглээрэй: ${result.url}`
      : result.kind === "owner_report"
        ? `Сайн байна уу! Таны үл хөдлөхийн борлуулалтын явцын тайлан: ${result.url}`
        : result.url;
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Хуулагдлаа");
    } catch {
      toast.error("Хуулж чадсангүй — гараар сонгож хуулна уу.");
    }
  }
  async function share() {
    try {
      await navigator.share({ title: result.title, text: message });
    } catch {
      // хэрэглэгч цуцалсан
    }
  }
  return (
    <Modal open onClose={onClose} title={result.kind === "open_house" ? "QR бэлэн боллоо" : "Холбоос бэлэн боллоо"}>
      <div className="space-y-3">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Аюулгүй байдлын үүднээс холбоосыг зөвхөн одоо харуулна. Хуулж эсвэл хэвлэж авна уу — дахин хэрэгтэй бол шинээр үүсгэнэ.
        </p>
        {result.kind === "open_house" ? (
          <div className="flex flex-col items-center gap-2 print:gap-4" id="qr-print">
            <p className="text-center text-sm font-semibold text-ink">{result.title}</p>
            <QrCode text={result.url} size={240} />
            <p className="text-center text-xs text-muted">Утасны камераар уншуулж бүртгүүлнэ үү</p>
          </div>
        ) : null}
        <div className="break-all rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink">{result.url}</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => copy(result.url)}>
            <Copy className="size-4" /> Холбоос хуулах
          </Button>
          {result.kind !== "open_house" ? (
            <Button size="sm" variant="outline" onClick={() => copy(message)}>
              <Copy className="size-4" /> Зурвас хуулах
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Хэвлэх
            </Button>
          )}
          {typeof navigator !== "undefined" && "share" in navigator ? (
            <Button size="sm" variant="outline" onClick={share}>
              <Share2 className="size-4" /> Хуваалцах
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
