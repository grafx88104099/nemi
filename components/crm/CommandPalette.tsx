"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarCheck, FileSignature, Flame, Link2, ListChecks, Plus, Search, User, X } from "lucide-react";

import { searchCrm, type SearchHit } from "@/lib/actions/crm-worklists";
import { cn } from "@/lib/utils";

/**
 * Нэгдсэн хайлт (R29): Ctrl/⌘+K эсвэл доод цэсний «Хайх». Утас, нэр,
 * харилцагч/үл хөдлөх/хэлцлийн дугаараар — зөвхөн харах эрхтэй бүртгэл.
 * Хоосон үед түгээмэл үйлдлүүдийг санал болгоно.
 */

export const OPEN_SEARCH_EVENT = "crm:open-search";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

const KIND_ICON: Record<SearchHit["kind"], typeof User> = {
  contact: User,
  lead: Flame,
  property: Building2,
  transaction: FileSignature,
};

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  contact: "Харилцагч",
  lead: "Сэжим",
  property: "Үл хөдлөх",
  transaction: "Хэлцэл",
};

type Command = { label: string; href: string; icon: typeof User };

export function CommandPalette({ basePath = "/agent/crm" }: { basePath?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const commands: Command[] = useMemo(
    () => [
      { label: "Өнөөдөр", href: basePath, icon: CalendarCheck },
      { label: "Шинэ сэжим бүртгэх", href: `${basePath}/leads?new=1`, icon: Plus },
      { label: "Ажлын жагсаалт", href: `${basePath}/worklists`, icon: ListChecks },
      { label: "Сонголтын жагсаалт, тайлан, QR", href: `${basePath}/links`, icon: Link2 },
      { label: "Сэжим", href: `${basePath}/leads`, icon: Flame },
      { label: "Харилцагч", href: `${basePath}/contacts`, icon: User },
      { label: "Үл хөдлөх", href: `${basePath}/properties`, icon: Building2 },
    ],
    [basePath]
  );

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setHits([]);
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        close();
      }
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, [close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const res = await searchCrm(term, basePath);
      if (id === seq.current) {
        setHits(res);
        setActive(0);
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, basePath]);

  if (!open) return null;

  const showCommands = q.trim().length < 2;
  const rows: { key: string; label: string; sub: string | null; href: string; icon: typeof User; tag?: string }[] = showCommands
    ? commands.map((c) => ({ key: c.href, label: c.label, sub: null, href: c.href, icon: c.icon }))
    : hits.map((h) => ({ key: `${h.kind}:${h.id}`, label: h.label, sub: h.sub, href: h.href, icon: KIND_ICON[h.kind], tag: KIND_LABEL[h.kind] }));

  function go(href: string) {
    close();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-ink/40 p-3 pt-[10vh] backdrop-blur-sm" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="CRM хайлт"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLoading(e.target.value.trim().length >= 2);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && rows[active]) {
                e.preventDefault();
                go(rows[active].href);
              }
            }}
            placeholder="Утас, нэр, дугаараар хайх…"
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-subtle"
            inputMode="search"
            autoComplete="off"
          />
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Хаах">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {showCommands ? <p className="px-2 py-1 text-xs text-subtle">Түргэн үйлдэл</p> : null}
          {!showCommands && loading ? <p className="px-3 py-4 text-sm text-muted">Хайж байна…</p> : null}
          {!showCommands && !loading && rows.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">Илэрц олдсонгүй. Утасны сүүлийн 4+ оронг эсвэл нэрийн хэсгийг оруулж үзнэ үү.</p>
          ) : null}
          {rows.map((r, i) => (
            <button
              key={r.key}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.href)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
                i === active ? "bg-brand-50" : "hover:bg-surface-2"
              )}
            >
              <r.icon className="size-4 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                {r.sub ? <span className="block truncate text-xs text-muted">{r.sub}</span> : null}
              </span>
              {r.tag ? <span className="shrink-0 text-xs text-subtle">{r.tag}</span> : null}
            </button>
          ))}
        </div>
        <p className="hidden border-t border-line px-3 py-2 text-xs text-subtle sm:block">↑↓ сонгох · Enter нээх · Esc хаах · Ctrl+K</p>
      </div>
    </div>
  );
}
