import Link from "next/link";
import { ChevronRight, Info, Phone, Users } from "lucide-react";

import { fmtDateNum } from "@/lib/format";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { crm2Paths, type Crm2Panel } from "@/lib/crm2/paths";
import { formatPhone } from "@/lib/crm2/phone";
import { listContacts } from "@/lib/crm2/queries/contacts";
import { getStaffDirectory, getWorkStaff } from "@/lib/crm2/queries/lookups";
import type { Crm2Context, Crm2RecordStatus, Crm2StaffMember } from "@/lib/crm2/types";
import { Badge } from "@/components/ui/badge";
import {
  CodeChip,
  Crm2Empty,
  FilterBar,
  FilterChips,
  FilterClear,
  FilterPager,
  FilterProvider,
  FilterSearch,
  FilterSelect,
  LoadErrorState,
  NoAccessState,
  RecordStatusBadge,
  type FilterParams,
} from "@/components/crm2/ui";

import { NewContactButton } from "./NewContactButton";

/**
 * Харилцагчид (жагсаалт): нэр, код эсвэл дугаараар (жигдрүүлсэн, хэсэгчлэн) хайх,
 * хариуцагчаар шүүх, идэвхтэй/архив. Харах эрх RLS-ээр (хариуцагч, хэлцэлтэй агент,
 * ахлагч, менежер). «Шинэ харилцагч» — crm2_create_contact.
 */

const STATUS_OPTIONS = [
  { value: "active", label: "Идэвхтэй" },
  { value: "archived", label: "Архив" },
  { value: "all", label: "Бүгд" },
];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** «Шинэ харилцагч»-ийн хариуцагч сонголт: менежер — ажлын эрхтэн бүгд; ахлагч — багийнхан. */
export function contactAgentOptions(ctx: Crm2Context, workStaff: Crm2StaffMember[]): { value: string; label: string }[] {
  if (!ctx.isManager && !ctx.isTeamLead) return [];
  const list = ctx.isManager ? workStaff : workStaff.filter((s) => s.team_id && s.team_id === ctx.teamId);
  const others = list.filter((s) => s.profile_id !== ctx.profileId).map((s) => ({ value: s.profile_id, label: s.name }));
  if (others.length === 0) return [];
  return [{ value: ctx.profileId, label: "Би өөрөө" }, ...others];
}

export async function ContactsListView({ panel, searchParams }: { panel: Crm2Panel; searchParams: FilterParams }) {
  const ctx = await getCrm2Context();
  if (!ctx?.isMember) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">
        <NoAccessState description="CRM-ийн эрхтэй ажилтанд харагдана." />
      </div>
    );
  }
  const paths = crm2Paths(panel);
  const q = first(searchParams.q).trim();
  const statusRaw = first(searchParams.status);
  const status: Crm2RecordStatus | "all" = statusRaw === "archived" || statusRaw === "all" ? statusRaw : "active";
  const agent = first(searchParams.agent);
  const page = Number(first(searchParams.page)) || 1;
  // Олдоогүй харилцагчийн холбоосоос буцаасан (хайлт эхэлмэгц нуугдана).
  const missing = first(searchParams.missing) === "1" && !q;

  const settings = await getCrm2Settings();
  const [res, staff, workStaff] = await Promise.all([
    listContacts({ q, status, responsibleId: agent || null, page }),
    getStaffDirectory(),
    getWorkStaff(settings["roles.work"]),
  ]);

  const agentFilter = [
    { value: ctx.profileId, label: "Миний харилцагчид" },
    ...staff.filter((s) => s.profile_id !== ctx.profileId).map((s) => ({ value: s.profile_id, label: s.name })),
  ];
  const filtered = !!(q || agent || status !== "active");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Харилцагчид</h1>
          <p className="text-sm text-muted">
            Нэг хүн — нэг карт: дугаарууд, шаардлага, бүх хөрөнгийн хэлцэл. Нийт {res.total}.
          </p>
        </div>
        {ctx.canWork ? (
          <NewContactButton
            panel={panel}
            meId={ctx.profileId}
            agentOptions={contactAgentOptions(ctx, workStaff)}
            requirePhone={settings["contact.require_phone"]}
            className="self-start sm:self-auto"
          />
        ) : null}
      </div>

      {missing ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Таны нээсэн харилцагч олдсонгүй — хуучин CRM-ийн холбоос эсвэл харах эрхгүй харилцагч байж магадгүй. Нэр, дугаараар хайна уу.
        </div>
      ) : null}

      <FilterProvider params={searchParams}>
        <FilterBar className="mt-4">
          <FilterSearch placeholder="Нэр, код эсвэл утасны дугаар" />
          <FilterSelect name="agent" label="Хариуцагч" options={agentFilter} />
          <FilterChips name="status" options={STATUS_OPTIONS} defaultValue="active" label="Төлөв" />
          <FilterClear keys={["q", "agent", "status", "missing"]} />
        </FilterBar>

        <div className="mt-4">
          {res.error ? (
            <LoadErrorState retryHref={paths.contacts({ q: q || null, status: statusRaw || null, agent: agent || null, page: page > 1 ? page : null })} />
          ) : res.items.length === 0 && res.total > 0 ? (
            <Crm2Empty
              icon={Users}
              title="Энэ хуудсанд харилцагч алга"
              description="Хуудасны дугаар жагсаалтаас хэтэрсэн байна."
              action={{ label: "Эхний хуудас руу", href: paths.contacts({ q: q || null, status: statusRaw || null, agent: agent || null }) }}
            />
          ) : res.items.length === 0 ? (
            <Crm2Empty
              icon={Users}
              title="Харилцагч алга"
              description="Шинэ харилцагч бүртгэх эсвэл Staff хөрөнгийн картаас дуудлага бүртгэхэд энд харагдана."
              filtered={filtered}
              onClear={filtered ? { label: "Шүүлтүүр цэвэрлэх", href: paths.contacts() } : undefined}
            />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {res.items.map((c) => {
                const primary = c.phones[0];
                return (
                  <li key={c.id}>
                    <Link
                      href={paths.contact(c.id)}
                      className="flex items-center gap-3 px-3 py-3 transition hover:bg-surface-2 sm:px-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CodeChip code={c.code} />
                          <span className="truncate font-semibold text-ink">{c.full_name}</span>
                          {c.status !== "active" ? <RecordStatusBadge status={c.status} /> : null}
                        </div>
                        <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm text-muted sm:grid-cols-3">
                          <span className="inline-flex min-w-0 items-center gap-1 tabular-nums">
                            <Phone className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">
                              {primary ? formatPhone(primary.phone) : "Дугааргүй"}
                              {c.phones.length > 1 ? ` (+${c.phones.length - 1})` : ""}
                            </span>
                          </span>
                          <span className="truncate">
                            Хариуцагч: <span className="text-ink">{c.responsibleName ?? "—"}</span>
                          </span>
                          <span className="truncate">Шинэчилсэн {fmtDateNum(c.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.openDeals > 0 ? (
                          <Badge tone="brand" className="tabular-nums">
                            {c.openDeals}
                            <span className="hidden sm:inline"> нээлттэй хэлцэл</span>
                            <span className="sm:hidden"> хэлцэл</span>
                          </Badge>
                        ) : (
                          <span className="hidden text-xs text-subtle sm:inline">Нээлттэй хэлцэлгүй</span>
                        )}
                        <ChevronRight className="size-4 text-subtle" aria-hidden />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <FilterPager page={res.page} pageCount={res.pageCount} />
        </div>
      </FilterProvider>
    </div>
  );
}
