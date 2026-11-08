import { getLookups, getSettingValue, getZones, type CrmStaffContext, type LookupRow } from "@/lib/queries-crm-core";
import {
  getActivities,
  getLead,
  getLeadCardSettings,
  suggestedGradeOf,
  type ActivityTimelineRow,
  type LeadCardSettings,
  type LeadDetail,
} from "@/lib/queries-crm-leads";
import { findDuplicates, getContact360, getTagLookups, type DuplicateHit, type NeedProfileRow, type TagLookupRow } from "@/lib/queries-crm-contacts";
import { getLeadOwnership, getOwnerCandidates, type LeadOwnership, type OwnerCandidate } from "@/lib/queries-crm-ownership";
import { getVisiblePipelines } from "@/lib/queries-crm-pipeline";
import { getMatchesForProfile, type MatchRow } from "@/lib/queries-crm-matching";
import { normalizeScoreWeights, type ScoreWeights } from "@/lib/crm/scoring";
import type { LeadGrade } from "@/lib/constants-crm";

/**
 * Сэжим, харилцагчийн картын нэгдсэн уншилт (агент, оффисын панель ижил):
 * U3-ийн боломж үүсгэх, U4-ийн эзэмшлийн хэсэг, профайл, тохируулга,
 * үйл ажиллагааны түүхийг нэг дор бэлтгэнэ.
 */

export type ProfileLookups = {
  goals: LookupRow[];
  blockers: LookupRow[];
  decisionMakers: LookupRow[];
  conditions: LookupRow[];
  zones: string[];
};

export async function getProfileLookups(): Promise<ProfileLookups> {
  const [goals, blockers, decisionMakers, conditions, zones] = await Promise.all([
    getLookups("goal"),
    getLookups("blocker"),
    getLookups("decision_maker"),
    getLookups("condition"),
    getZones(),
  ]);
  const zoneNames = new Set<string>();
  for (const z of zones.filter((x) => x.is_active)) {
    zoneNames.add(z.district);
    if (z.khoroo) zoneNames.add(`${z.district}, ${z.khoroo}`);
    if (z.complex) zoneNames.add(z.complex);
  }
  return { goals, blockers, decisionMakers, conditions, zones: [...zoneNames].sort() };
}

export type LeadCardData = {
  lead: LeadDetail;
  ownership: LeadOwnership | null;
  ownerCandidates: OwnerCandidate[];
  duplicates: DuplicateHit[];
  activities: ActivityTimelineRow[];
  objections: { id: string; label: string }[];
  pipelines: { code: string; name: string }[];
  needProfiles: NeedProfileRow[];
  profileMatches: Record<string, MatchRow[]>;
  lookups: ProfileLookups;
  settings: LeadCardSettings;
  weights: ScoreWeights;
  suggestedGrade: LeadGrade | null;
  sources: LookupRow[];
};

export async function getLeadCardData(id: string, ctx: CrmStaffContext): Promise<LeadCardData | null> {
  const lead = await getLead(id);
  if (!lead) return null;
  const primaryPhone = lead.contact.phones.find((p) => p.is_primary) ?? lead.contact.phones[0];

  const [ownership, ownerCandidates, duplicates, activities, objections, pipelines, c360, lookups, settings, weights, sources] =
    await Promise.all([
      getLeadOwnership(id),
      getOwnerCandidates(ctx.officeId),
      findDuplicates({
        phone: primaryPhone?.raw,
        email: lead.contact.emails[0]?.email,
        name: lead.contact.display_name,
        excludeContactId: lead.contact.id,
      }),
      getActivities({ contactId: lead.contact.id }),
      getLookups("objection"),
      getVisiblePipelines(),
      getContact360(lead.contact.id),
      getProfileLookups(),
      getLeadCardSettings(),
      getSettingValue("lead_score_weights"),
      getLookups("lead_source"),
    ]);
  const needProfiles = c360?.needProfiles ?? [];
  const active = needProfiles.filter((p) => p.status === "active");
  const matches = await Promise.all(active.map((p) => getMatchesForProfile(p.id)));
  return {
    lead,
    ownership,
    ownerCandidates,
    duplicates,
    activities,
    objections: objections.map((o) => ({ id: o.id, label: o.label })),
    pipelines: pipelines.map((p) => ({ code: p.code, name: p.name })),
    needProfiles,
    profileMatches: Object.fromEntries(active.map((p, i) => [p.id, matches[i]])),
    lookups,
    settings,
    weights: normalizeScoreWeights(weights),
    suggestedGrade: suggestedGradeOf(lead.score, settings.thresholds),
    sources,
  };
}

export type ContactCardData = {
  data: NonNullable<Awaited<ReturnType<typeof getContact360>>>;
  activities: ActivityTimelineRow[];
  objections: { id: string; label: string }[];
  lookups: ProfileLookups;
  lostReasons: LookupRow[];
  tags: TagLookupRow[];
  sources: LookupRow[];
  pipelines: { code: string; name: string }[];
  ownerCandidates: OwnerCandidate[];
  settings: LeadCardSettings;
  profileMatches: Record<string, MatchRow[]>;
  /** Нээлттэй сэжим (байвал) — бүртгэл, боломж түүнд холбогдоно. */
  openLead: { id: string; status: string; grade: LeadGrade | null } | null;
};

export async function getContactCardData(id: string, ctx: CrmStaffContext): Promise<ContactCardData | null> {
  const data = await getContact360(id);
  if (!data) return null;
  const [activities, objections, lookups, lostReasons, tags, sources, pipelines, ownerCandidates, settings, matches] =
    await Promise.all([
      getActivities({ contactId: id }),
      getLookups("objection"),
      getProfileLookups(),
      getLookups("lost_reason"),
      getTagLookups(),
      getLookups("lead_source"),
      getVisiblePipelines(),
      getOwnerCandidates(ctx.officeId),
      getLeadCardSettings(),
      Promise.all(data.needProfiles.map((p) => getMatchesForProfile(p.id))),
    ]);
  const open = data.leads.find((l) => l.status === "new" || l.status === "active") ?? null;
  return {
    data,
    activities,
    objections: objections.map((o) => ({ id: o.id, label: o.label })),
    lookups,
    lostReasons,
    tags,
    sources,
    pipelines: pipelines.map((p) => ({ code: p.code, name: p.name })),
    ownerCandidates,
    settings,
    profileMatches: Object.fromEntries(data.needProfiles.map((p, i) => [p.id, matches[i]])),
    openLead: open ? { id: open.id, status: open.status, grade: (open.grade as LeadGrade | null) ?? null } : null,
  };
}
