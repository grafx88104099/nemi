import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Bell, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { panelLink } from "@/lib/crm/notify";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CRM_EVENT_LABEL, type CrmEventCode } from "@/lib/constants-crm";
import { cn } from "@/lib/utils";

/**
 * Удирдлагын мэдэгдлийн хуудас (§6.28): SLA зөрчил, 48 цагт холбогдоогүй
 * сэжим, халуун сэжим идэвхгүй, үзлэгийн хариу, саналын хугацаа г.м. бүх
 * мэдэгдэл нэг дор — уншаагүй/бүгд шүүлт, хуудаслалттай.
 */

export const metadata = { title: "Мэдэгдэл — CRM" };

type SearchParams = Promise<Record<string, string | undefined>>;

const PAGE_SIZE = 30;

type NoteRow = {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** notifications.type ('crm_<event>' / 'crm_<event>_esc') → монгол ангилал. */
function eventLabel(type: string | null): { label: string; escalated: boolean } | null {
  if (!type || !type.startsWith("crm_")) return null;
  const escalated = type.endsWith("_esc");
  const code = type.slice(4, escalated ? -4 : undefined) as CrmEventCode;
  const label = CRM_EVENT_LABEL[code];
  return label ? { label, escalated } : { label: "CRM", escalated };
}

const UB_DAY = new Intl.DateTimeFormat("mn-MN", {
  timeZone: "Asia/Ulaanbaatar",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});
const UB_TIME = new Intl.DateTimeFormat("mn-MN", { timeZone: "Asia/Ulaanbaatar", hour: "2-digit", minute: "2-digit" });
const UB_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" });

async function markAllRead() {
  "use server";
  await markNotificationsRead();
  revalidatePath("/office/crm/notifications");
  revalidatePath("/office", "layout");
}

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");

  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const crmOnly = sp.scope !== "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const supabase = await createClient();
  let q = supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at", { count: "exact" })
    .eq("user_id", ctx.profileId)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (unreadOnly) q = q.is("read_at", null);
  if (crmOnly) q = q.like("type", "crm_%");
  const [{ data, count, error }, { count: unreadCount }] = await Promise.all([
    q,
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.profileId)
      .is("read_at", null),
  ]);
  if (error) console.error("NotificationsPage:", error.message);
  const rows = (data ?? []) as NoteRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Өдрөөр бүлэглэнэ (УБ цагаар).
  const groups: { key: string; label: string; rows: NoteRow[] }[] = [];
  for (const r of rows) {
    const d = new Date(r.created_at);
    const key = UB_KEY.format(d);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, label: UB_DAY.format(d), rows: [r] });
  }

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = { filter: sp.filter, scope: sp.scope, page: undefined as string | undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    const s = params.toString();
    return `/office/crm/notifications${s ? `?${s}` : ""}`;
  };

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition",
      active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink hover:bg-surface-2"
    );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Мэдэгдэл</h1>
          <p className="text-sm text-muted">
            {unreadCount ? `${unreadCount} уншаагүй мэдэгдэл` : "Бүх мэдэгдлийг уншсан"}
          </p>
        </div>
        {unreadCount ? (
          <form action={markAllRead}>
            <Button type="submit" variant="outline" size="sm">
              <CheckCheck className="size-4" /> Бүгдийг уншсан болгох
            </Button>
          </form>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Шүүлт">
        <Link href={href({ filter: undefined })} className={chip(!unreadOnly)}>
          Бүгд
        </Link>
        <Link href={href({ filter: "unread" })} className={chip(unreadOnly)}>
          Уншаагүй
        </Link>
        <span className="mx-1 hidden w-px self-stretch bg-line sm:block" aria-hidden />
        <Link href={href({ scope: undefined })} className={chip(crmOnly)}>
          CRM
        </Link>
        <Link href={href({ scope: "all" })} className={chip(!crmOnly)}>
          Бүх төрөл
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Bell}
              title={unreadOnly ? "Уншаагүй мэдэгдэл алга" : "Мэдэгдэл алга"}
              description="SLA-ийн зөрчил, хугацаа хэтэрсэн дараагийн үйлдэл, халуун сэжим идэвхгүй болох зэрэг сануулга энд ирнэ."
              action={unreadOnly ? { label: "Бүх мэдэгдлийг харах", href: href({ filter: undefined }) } : undefined}
            />
          </CardBody>
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-1.5">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">{g.label}</h2>
            <Card>
              <CardBody className="p-0">
                <ul>
                  {g.rows.map((n) => {
                    const ev = eventLabel(n.type);
                    const link = n.link ? panelLink(n.link, "office_admin") : null;
                    const inner = (
                      <div className="flex gap-3 px-4 py-3">
                        <span
                          className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-500")}
                          aria-label={n.read_at ? undefined : "Уншаагүй"}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={cn("text-sm text-ink", n.read_at ? "font-medium" : "font-bold")}>
                              {n.title ?? "Мэдэгдэл"}
                            </span>
                            {ev ? <Badge tone={ev.escalated ? "rose" : "neutral"}>{ev.escalated ? `Эскалаци · ${ev.label}` : ev.label}</Badge> : null}
                          </div>
                          {n.body ? <p className="mt-0.5 text-sm text-muted">{n.body}</p> : null}
                        </div>
                        <time className="shrink-0 text-xs text-subtle" dateTime={n.created_at}>
                          {UB_TIME.format(new Date(n.created_at))}
                        </time>
                      </div>
                    );
                    return (
                      <li key={n.id} className="border-b border-line last:border-0">
                        {link ? (
                          <Link href={link} className="block hover:bg-surface-2">
                            {inner}
                          </Link>
                        ) : (
                          inner
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          </section>
        ))
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-2" aria-label="Хуудаслалт">
          {page > 1 ? (
            <Link href={href({ page: String(page - 1) })} className={chip(false)}>
              <ChevronLeft className="mr-1 size-4" /> Өмнөх
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={href({ page: String(page + 1) })} className={chip(false)}>
              Дараах <ChevronRight className="ml-1 size-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
