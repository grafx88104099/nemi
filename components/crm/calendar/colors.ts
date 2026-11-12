import { CalendarDays, Eye, Flag, Globe, Handshake, ListTodo, type LucideIcon } from "lucide-react";

import {
  CALENDAR_BUSY_TITLE,
  CALENDAR_EVENT_KIND_LABEL,
  CALENDAR_SOURCE_LABEL,
  PERSON_COLOR_COUNT,
  type CalendarColorKey,
  type CalendarSource,
} from "@/lib/crm/calendar-view";

/**
 * Календарийн өнгө (Tailwind-д бүтэн класс мөр байх ёстой — динамикаар бүү угсар).
 * block — цагийн торын хайрцаг, сарын/жагсаалтын мөр; dot — тэмдэг, тайлбар.
 */
export type ColorClasses = { block: string; dot: string };

const STRIPES = "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(100,116,139,0.14)_6px_12px)]";

export const COLOR_BY_KEY: Record<CalendarColorKey, ColorClasses> = {
  meeting: { block: "border-sky-500 bg-sky-100 text-sky-950", dot: "bg-sky-500" },
  call: { block: "border-violet-500 bg-violet-100 text-violet-950", dot: "bg-violet-500" },
  showing: { block: "border-emerald-500 bg-emerald-100 text-emerald-950", dot: "bg-emerald-500" },
  personal: { block: "border-pink-500 bg-pink-100 text-pink-950", dot: "bg-pink-500" },
  other: { block: "border-zinc-500 bg-zinc-100 text-zinc-900", dot: "bg-zinc-500" },
  task: { block: "border-amber-500 bg-amber-100 text-amber-950", dot: "bg-amber-500" },
  next_step: { block: "border-orange-500 bg-orange-100 text-orange-950", dot: "bg-orange-500" },
  opportunity_meeting: { block: "border-indigo-500 bg-indigo-100 text-indigo-950", dot: "bg-indigo-500" },
  viewing: { block: "border-teal-500 bg-teal-100 text-teal-950", dot: "bg-teal-500" },
  busy: { block: `border-slate-400 bg-slate-100 text-slate-600 ${STRIPES}`, dot: "bg-slate-400" },
};

/** Олон хүн давхарлахад хүний өнгө (PERSON_COLOR_COUNT ширхэг). */
export const PERSON_COLORS: readonly ColorClasses[] = [
  { block: "border-blue-600 bg-blue-100 text-blue-950", dot: "bg-blue-600" },
  { block: "border-emerald-600 bg-emerald-100 text-emerald-950", dot: "bg-emerald-600" },
  { block: "border-purple-600 bg-purple-100 text-purple-950", dot: "bg-purple-600" },
  { block: "border-rose-600 bg-rose-100 text-rose-950", dot: "bg-rose-600" },
  { block: "border-amber-600 bg-amber-100 text-amber-950", dot: "bg-amber-600" },
  { block: "border-cyan-600 bg-cyan-100 text-cyan-950", dot: "bg-cyan-600" },
  { block: "border-lime-600 bg-lime-100 text-lime-950", dot: "bg-lime-600" },
  { block: "border-fuchsia-600 bg-fuchsia-100 text-fuchsia-950", dot: "bg-fuchsia-600" },
];

export function personColor(index: number): ColorClasses {
  return PERSON_COLORS[((index % PERSON_COLOR_COUNT) + PERSON_COLOR_COUNT) % PERSON_COLOR_COUNT] ?? PERSON_COLORS[0];
}

export const SOURCE_ICON: Record<CalendarSource, LucideIcon> = {
  event: CalendarDays,
  task: ListTodo,
  next_step: Flag,
  showing: Eye,
  opportunity_meeting: Handshake,
  viewing: Globe,
};

/** Тайлбарын (legend) дараалал ба шошго. */
export const COLOR_LEGEND: { key: CalendarColorKey; label: string }[] = [
  { key: "meeting", label: CALENDAR_EVENT_KIND_LABEL.meeting },
  { key: "call", label: CALENDAR_EVENT_KIND_LABEL.call },
  { key: "showing", label: CALENDAR_SOURCE_LABEL.showing },
  { key: "personal", label: CALENDAR_EVENT_KIND_LABEL.personal },
  { key: "other", label: CALENDAR_EVENT_KIND_LABEL.other },
  { key: "task", label: CALENDAR_SOURCE_LABEL.task },
  { key: "next_step", label: CALENDAR_SOURCE_LABEL.next_step },
  { key: "opportunity_meeting", label: CALENDAR_SOURCE_LABEL.opportunity_meeting },
  { key: "viewing", label: CALENDAR_SOURCE_LABEL.viewing },
  { key: "busy", label: CALENDAR_BUSY_TITLE },
];
