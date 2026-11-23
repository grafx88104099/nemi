import type { Metadata } from "next";
import type * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Bookmark,
  Calculator,
  CalendarDays,
  Clock,
  Heart,
  Home as HomeIcon,
  Landmark,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Tag,
  Users,
  Wrench,
  Building2,
  type LucideIcon,
} from "lucide-react";

import { getHubData, type HubData } from "@/lib/queries-hub";
import { conversationLink, type HubSectionId } from "@/lib/hub";
import { VIEWING_STATUS } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/crm2/phone";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ListingRow } from "@/components/listings/ListingRow";
import { SavedSearchRow } from "@/components/listings/SavedSearchRow";
import { HubSections } from "@/components/hub/HubSections";

export const metadata: Metadata = {
  title: "Миний Нэми — Нэми",
  robots: { index: false, follow: false },
};

const TOOLS: { href: string; label: string; desc: string; icon: LucideIcon }[] = [
  { href: "/home-loans", label: "Зээлийн тооцоолуур", desc: "Сарын төлбөрөө тооцоол", icon: Landmark },
  { href: "/rent/afford", label: "Түрээс: хэдийг чадах вэ", desc: "Төсөвтөө тохирох түрээс", icon: Calculator },
  { href: "/my-home", label: "Гэрийн үнэлгээ", desc: "Гэрийнхээ үнийг мэд", icon: HomeIcon },
  { href: "/sell", label: "Хөрөнгөө зарах", desc: "Оффист зуучлуулах эсвэл өөрөө зарлах", icon: Tag },
  { href: "/tours", label: "Үзлэгийн цаг", desc: "Бүх товлолт", icon: CalendarDays },
  { href: "/account", label: "Профайл тохиргоо", desc: "Нэр, утас, нууцлал", icon: Settings },
];

/** «Миний Нэми» — нэвтэрсэн хэрэглэгчийн хайлт, хадгалсан, үзлэг, чат нэг дор. */
export default async function MePage() {
  const data = await getHubData();
  if (!data) return <LoginPrompt desc="Өөрийн хэсгээ харахын тулд нэвтэрнэ үү." next="/me" />;

  // Профайлын хуудастай ижил нэрийн fallback: нэр → и-мэйлийн нэр → утас → «Хэрэглэгч».
  const authPhone = data.user.phone ? formatPhone(data.user.phone) : "";
  const textName = data.profile?.full_name || data.user.email?.split("@")[0] || "";
  const name = textName || authPhone || "Хэрэглэгч";
  const initials =
    textName
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "Х";
  const role = data.profile?.role ?? "buyer";

  const roleLinks: { href: string; label: string }[] =
    role === "agent"
      ? [
          { href: "/agent", label: "Агентын самбар" },
          { href: "/agent/crm", label: "CRM" },
          { href: "/agent/chat", label: "Агентын чат" },
        ]
      : role === "office_admin" || role === "admin"
        ? [{ href: "/office", label: "Оффисын самбар" }]
        : [];

  const sections = buildSections(data);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar initials={initials} size="lg" color="#0F172A" />
        {/* min-w: утсан дээр нэр таслагдахын оронд «Профайл тохиргоо» доод мөрөнд шилжинэ. */}
        <div className="min-w-[12rem] flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-subtle">Миний Нэми</p>
          <h1 className="truncate text-2xl font-extrabold text-ink">{name}</h1>
          <p className="truncate text-sm text-muted">{data.user.email || authPhone}</p>
        </div>
        <ButtonLink href="/account" variant="outline" size="touch">
          <Settings className="size-4" aria-hidden /> Профайл тохиргоо
        </ButtonLink>
      </div>
      {roleLinks.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {roleLinks.map((l) => (
            <ButtonLink key={l.href} href={l.href} variant="secondary" size="touch">
              <LayoutDashboard className="size-4" aria-hidden /> {l.label}
            </ButtonLink>
          ))}
        </div>
      ) : null}

      <HubSections sections={sections} />
    </div>
  );
}

function buildSections(d: HubData): { id: HubSectionId; node: React.ReactNode }[] {
  const out: { id: HubSectionId; node: React.ReactNode }[] = [];

  if (d.tours.length > 0) {
    out.push({
      id: "tours",
      node: (
        <HubSection title="Удахгүй болох үзлэг" icon={CalendarDays} href="/tours">
          <ul className="divide-y divide-line">
            {d.tours.map((t) => {
              const st = VIEWING_STATUS[t.status];
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    {t.listing?.photo ? (
                      <Image src={t.listing.photo} alt="" fill sizes="56px" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {t.listing ? (
                      <Link href={`/listings/${t.listing.id}`} className="block truncate text-sm font-semibold text-ink hover:underline">
                        {t.listing.title}
                      </Link>
                    ) : (
                      <span className="block truncate text-sm font-semibold text-ink">Зар</span>
                    )}
                    <p className="truncate text-xs text-muted">
                      {t.scheduled_at ? fmtDateTime(t.scheduled_at) : "—"}
                      {t.agent ? ` · ${t.agent.display_name}` : ""}
                    </p>
                  </div>
                  <Badge tone={st?.tone ?? "neutral"}>{st?.label ?? t.status}</Badge>
                </li>
              );
            })}
          </ul>
        </HubSection>
      ),
    });
  }

  out.push({
    id: "messages",
    node: (
      <HubSection title="Чат" icon={MessageCircle} href="/messages" count={d.unreadTotal} countLabel="уншаагүй">
        {d.conversations.length === 0 ? (
          <p className="text-sm text-muted">Харилцаа алга. Зар дээрээс «Чат бичих» дарна уу.</p>
        ) : (
          <ul className="space-y-1">
            {d.conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={conversationLink(c.id)}
                  className="flex min-h-11 items-center gap-3 rounded-xl p-2 transition hover:bg-surface-2"
                >
                  <Avatar
                    initials={c.agent?.avatar ?? "NA"}
                    src={c.agent?.avatar_url}
                    color={c.agent?.office?.color ?? "#C2410C"}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{c.agent?.display_name ?? "Агент"}</div>
                    <div className="truncate text-xs text-muted">{c.listing?.title ?? ""}</div>
                  </div>
                  {c.unread ? (
                    <>
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-brand-500" />
                      <span className="sr-only">уншаагүй</span>
                    </>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </HubSection>
    ),
  });

  out.push({
    id: "searches",
    node: (
      <HubSection title="Хадгалсан хайлт" icon={Bookmark} href="/saved-searches">
        {d.searches.length === 0 ? (
          <p className="text-sm text-muted">
            Хадгалсан хайлт алга.{" "}
            <Link href="/listings" className="font-semibold text-brand-600 hover:underline">
              Зар хайх
            </Link>
          </p>
        ) : (
          <div className="space-y-2">
            {d.searches.map((s) => (
              <SavedSearchRow
                key={s.id}
                id={s.id}
                name={s.name}
                filters={s.filters}
                alertEnabled={s.alertEnabled}
                newCount={s.newCount}
              />
            ))}
          </div>
        )}
      </HubSection>
    ),
  });

  out.push({
    id: "saved",
    node: (
      <HubSection title="Хадгалсан зар" icon={Heart} href="/favorites" count={d.saved.count}>
        {d.saved.items.length === 0 ? (
          <p className="text-sm text-muted">Зар үзээд ❤ дарж хадгална уу.</p>
        ) : (
          <ListingRow listings={d.saved.items} />
        )}
      </HubSection>
    ),
  });

  if (d.recent.length > 0) {
    out.push({
      id: "recent",
      node: (
        <HubSection title="Саяхан үзсэн" icon={Clock} href="/recently-viewed">
          <ListingRow listings={d.recent} />
        </HubSection>
      ),
    });
  }

  if (d.agents.length > 0) {
    out.push({
      id: "agents",
      node: (
        <HubSection title="Миний агентууд" icon={Users} href="/my-team">
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.agents.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <Avatar initials={a.avatar ?? "NA"} src={a.avatar_url} color={a.officeColor ?? "#C2410C"} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{a.display_name}</div>
                  {a.officeName ? <div className="truncate text-xs text-muted">{a.officeName}</div> : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {a.conversationId ? (
                    <ButtonLink href={conversationLink(a.conversationId)} variant="secondary" size="touch">
                      Чат
                    </ButtonLink>
                  ) : null}
                  <ButtonLink href={`/agents/${a.id}`} variant="outline" size="touch">
                    Профайл
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        </HubSection>
      ),
    });
  }

  if (d.owner.hasAny) {
    const c = d.owner.counts;
    out.push({
      id: "listings",
      node: (
        <HubSection title="Миний зарууд" icon={Building2} href="/my-listings">
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              ["Идэвхтэй", c.active],
              ["Хянагдаж буй", c.review],
              ["Ноорог", c.draft],
            ].map(([label, n]) => (
              <div key={label} className="rounded-xl bg-surface-2 p-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="text-xl font-extrabold text-ink">{n}</dd>
              </div>
            ))}
          </dl>
          {d.owner.requests > 0 ? (
            <p className="mt-3 text-sm text-muted">{d.owner.requests} зуучлуулах хүсэлт</p>
          ) : null}
        </HubSection>
      ),
    });
  }

  out.push({
    id: "tools",
    node: (
      <HubSection title="Хэрэгсэл" icon={Wrench}>
        <div className="grid grid-cols-2 gap-3">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:border-brand-200 hover:shadow-sm"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white">
                <t.icon className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{t.label}</div>
                <div className="hidden truncate text-xs text-muted sm:block">{t.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </HubSection>
    ),
  });

  return out;
}

function HubSection({
  title,
  icon: Icon,
  href,
  count,
  countLabel,
  children,
}: {
  title: string;
  icon: LucideIcon;
  href?: string;
  count?: number;
  countLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Icon className="size-5 text-brand-600" aria-hidden />
          {title}
          {count ? (
            <span className="rounded-full bg-brand-50 px-2 text-xs font-bold text-brand-700">
              {count}
              {countLabel ? <span className="sr-only"> {countLabel}</span> : null}
            </span>
          ) : null}
        </h2>
        {href ? (
          <Link href={href} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
            Бүгдийг үзэх <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
