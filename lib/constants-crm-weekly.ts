/**
 * Долоо хоногийн мөчлөгийн шошго, каталог (U7 — PRO-001 v2.1 §6.19–§6.25,
 * §6.30, §9.1, §9.5, §9.6). Дэлгэцэнд дотоод код гарахгүй — шошго бүр
 * журмын нэр томьёогоор. Тоон босго энд байхгүй (crm_settings 'weekly_cycle').
 */

export type WeeklyTier = "activity" | "pipeline" | "closing" | "discipline";

export const WEEKLY_TIER_LABEL: Record<WeeklyTier, string> = {
  activity: "Үйл ажиллагааны зорилт",
  pipeline: "Урсгалын зорилт",
  closing: "Хаалтын зорилт",
  discipline: "Сахилга, бүртгэлийн чанар",
};

export const WEEKLY_METRIC_CODES = [
  "outbound_contacts",
  "meaningful_conversations",
  "new_leads",
  "qualified_leads",
  "owner_meetings",
  "buyer_meetings",
  "new_listings",
  "showings",
  "offers",
  "negotiations",
  "closed_deals",
  "expected_net_fee",
  "overdue_followups",
  "hot_contacts",
  "revenue",
  "followup_on_time_pct",
  "crm_completeness_pct",
] as const;

export type WeeklyMetricCode = (typeof WEEKLY_METRIC_CODES)[number];

export type WeeklyMetricDef = {
  code: WeeklyMetricCode;
  label: string;
  tier: WeeklyTier;
  unit: "count" | "mnt" | "pct";
  /** lower = бага байх тусмаа сайн (хугацаа хэтэрсэн). */
  better: "higher" | "lower";
  /** §6.19-ийн 14 үзүүлэлтийн жагсаалтад орох эсэх. */
  inPlan: boolean;
  /** §9.1 маягтын мөр. */
  inReview: boolean;
  /** Агшин зургийн үзүүлэлт (долоо хоногийн тоо биш, тухайн мөчийн төлөв). */
  snapshot: boolean;
  /** Даваагийн картын (§6.21) талбарын нэр — байвал картад тусдаа гарна. */
  cardLabel?: string;
  /** Тооцооны товч тайлбар (өөрийн үгээр). */
  hint: string;
};

export const WEEKLY_METRICS: WeeklyMetricDef[] = [
  {
    code: "outbound_contacts",
    label: "Гадагш чиглэсэн холболт",
    tier: "activity",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: true,
    snapshot: false,
    hint: "Залгалт, зурвас, цахим шуудангаар хийсэн бүх оролдлого (холбогдож чадаагүй нь ч орно).",
  },
  {
    code: "meaningful_conversations",
    label: "Утга бүхий ярилцлага",
    tier: "activity",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: true,
    snapshot: false,
    hint: "Харилцагчтай холбогдож, хариу авсан бүртгэл.",
  },
  {
    code: "new_leads",
    label: "Шинэ сэжим",
    tier: "activity",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: false,
    snapshot: false,
    hint: "Долоо хоногт таны нэр дээр бүртгэгдсэн сэжим.",
  },
  {
    code: "qualified_leads",
    label: "Шалгуур хангасан сэжим",
    tier: "pipeline",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: true,
    snapshot: false,
    hint: "«Шалгуур хангасан» шатанд орсон боломж. Алдсан хэлцэл тоологдохгүй.",
  },
  {
    code: "owner_meetings",
    label: "Өмчлөгчтэй хийсэн уулзалт",
    tier: "activity",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: false,
    snapshot: false,
    hint: "Өмчлөгч (худалдагч, түрээслүүлэгч)-тэй болсон уулзалт.",
  },
  {
    code: "buyer_meetings",
    label: "Худалдан авагчтай хийсэн уулзалт",
    tier: "activity",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: false,
    snapshot: false,
    hint: "Худалдан авагч, түрээслэгчтэй болсон уулзалт.",
  },
  {
    code: "new_listings",
    label: "Шинэ листинг",
    tier: "pipeline",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: true,
    snapshot: false,
    cardLabel: "Шинэ листингийн зорилт",
    hint: "Таны татсан, долоо хоногт идэвхжсэн үл хөдлөх.",
  },
  {
    code: "showings",
    label: "Үзлэг",
    tier: "pipeline",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: true,
    snapshot: false,
    cardLabel: "Үзлэгийн зорилт",
    hint: "Хийгдсэн үзлэг (товлосон боловч болоогүй нь орохгүй).",
  },
  {
    code: "offers",
    label: "Үнийн санал",
    tier: "pipeline",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: true,
    snapshot: false,
    cardLabel: "Үнийн саналын зорилт",
    hint: "Бүртгэгдсэн анхны үнийн санал (хариу санал тусад нь).",
  },
  {
    code: "negotiations",
    label: "Хэлэлцээр",
    tier: "pipeline",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: true,
    snapshot: false,
    hint: "Хариу санал бүртгэгдсэн эсвэл «Хэлэлцээр» шатанд орсон боломж.",
  },
  {
    code: "closed_deals",
    label: "Хаасан хэлцэл",
    tier: "closing",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: true,
    snapshot: false,
    cardLabel: "Хаалтын зорилт",
    hint: "Амжилттай хаагдсан хэлцэл. Амжилтгүй хаагдсан нь тоологдохгүй.",
  },
  {
    code: "expected_net_fee",
    label: "Хүлээгдэж буй цэвэр зуучлалын орлого",
    tier: "closing",
    unit: "mnt",
    better: "higher",
    inPlan: true,
    inReview: false,
    snapshot: true,
    hint: "Нээлттэй боломжийн компанийн цэвэр хөлсийг шатны магадлалаар жинлэсэн дүн.",
  },
  {
    code: "overdue_followups",
    label: "Хугацаа хэтэрсэн эргэн холбогдолт",
    tier: "discipline",
    unit: "count",
    better: "lower",
    inPlan: true,
    inReview: false,
    snapshot: false,
    hint: "Долоо хоногийн аль нэг өдөр хугацаа нь хэтэрсэн дараагийн үйлдэл.",
  },
  {
    code: "hot_contacts",
    label: "Халуун харилцагч",
    tier: "pipeline",
    unit: "count",
    better: "higher",
    inPlan: true,
    inReview: false,
    snapshot: true,
    cardLabel: "Халуун сэжимийн тоо",
    hint: "A ангиллын идэвхтэй сэжим.",
  },
  {
    code: "revenue",
    label: "Орлого",
    tier: "closing",
    unit: "mnt",
    better: "higher",
    inPlan: false,
    inReview: true,
    snapshot: false,
    cardLabel: "Энэ долоо хоногийн орлогын зорилт",
    hint: "Санхүү баталгаажуулсан орлого (төлбөр орсон огноогоор).",
  },
  {
    code: "followup_on_time_pct",
    label: "Эргэн холбогдолтыг хугацаанд нь хийсэн хувь",
    tier: "discipline",
    unit: "pct",
    better: "higher",
    inPlan: false,
    inReview: true,
    snapshot: false,
    hint: "Хугацаа нь энэ долоо хоногт болсон алхмаас огноондоо бодит холболтоор хийгдсэн хувь.",
  },
  {
    code: "crm_completeness_pct",
    label: "CRM-ийн бүрэн байдлын хувь",
    tier: "discipline",
    unit: "pct",
    better: "higher",
    inPlan: false,
    inReview: true,
    snapshot: true,
    hint: "Чанарын 12 шалгуурт тэнцсэн бүртгэлийн хувь.",
  },
];

export const WEEKLY_METRIC_BY_CODE: Record<WeeklyMetricCode, WeeklyMetricDef> = Object.fromEntries(
  WEEKLY_METRICS.map((m) => [m.code, m])
) as Record<WeeklyMetricCode, WeeklyMetricDef>;

export function isWeeklyMetricCode(v: unknown): v is WeeklyMetricCode {
  return typeof v === "string" && (WEEKLY_METRIC_CODES as readonly string[]).includes(v);
}

/** Даваагийн картын (§6.21) зорилтын талбарууд — дарааллаар. */
export const CARD_TARGET_CODES: WeeklyMetricCode[] = [
  "revenue",
  "hot_contacts",
  "new_listings",
  "showings",
  "offers",
  "closed_deals",
];

/** Даваагийн танилцуулгын «гол 5–7 тоо» (§6.20.1). */
export const MEETING_KEY_CODES: WeeklyMetricCode[] = [
  "outbound_contacts",
  "meaningful_conversations",
  "qualified_leads",
  "new_listings",
  "showings",
  "offers",
  "closed_deals",
];

/** Хэлцлийн урсгалын тоо (§6.20.2). */
export const MEETING_PIPELINE_CODES: WeeklyMetricCode[] = [
  "hot_contacts",
  "showings",
  "offers",
  "negotiations",
  "expected_net_fee",
];

// ── Үнэлгээ (§6.25) ───────────────────────────────────────

export const SCORE_COMPONENTS = ["activity", "pipeline", "progress", "closing", "followup", "quality"] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

export const SCORE_COMPONENT_LABEL: Record<ScoreComponent, string> = {
  activity: "Үйл ажиллагааны зорилтын биелэлт",
  pipeline: "Шалгуур хангасан урсгалыг шинээр бүрдүүлсэн байдал",
  progress: "Үзлэг, үнийн санал, шатны ахилт",
  closing: "Хаалт, орлогын үр дүн",
  followup: "Эргэн холбогдолтыг хугацаанд нь хийсэн хувь",
  quality: "CRM-ийн бүрэн, чанартай байдал",
};

/** Үнэлгээний бүрэлдэхүүн бүрд орох үзүүлэлт. «stage_advances» нь урсгалын хөдөлгөөнөөс. */
export const SCORE_COMPONENT_METRICS: Record<ScoreComponent, (WeeklyMetricCode | "stage_advances")[]> = {
  activity: ["outbound_contacts", "meaningful_conversations", "new_leads", "owner_meetings", "buyer_meetings"],
  pipeline: ["qualified_leads", "new_listings"],
  progress: ["showings", "offers", "stage_advances"],
  closing: ["closed_deals", "revenue"],
  followup: ["followup_on_time_pct"],
  quality: ["crm_completeness_pct"],
};

export const STAGE_ADVANCES_LABEL = "Шатаар ахисан боломж";

// ── Төлөв ─────────────────────────────────────────────────

export type WeeklyStatus = "draft" | "submitted" | "approved" | "returned";

export const WEEKLY_STATUS_LABEL: Record<
  WeeklyStatus,
  { label: string; tone: "neutral" | "blue" | "green" | "amber" }
> = {
  draft: { label: "Ноорог", tone: "neutral" },
  submitted: { label: "Батлуулахаар илгээсэн", tone: "blue" },
  approved: { label: "Батлагдсан", tone: "green" },
  returned: { label: "Засуулахаар буцаасан", tone: "amber" },
};

export function weeklyStatusLabel(s: string | null | undefined) {
  return WEEKLY_STATUS_LABEL[(s ?? "draft") as WeeklyStatus] ?? WEEKLY_STATUS_LABEL.draft;
}

export type PlanItemKind = "top_deal" | "priority" | "obstacle" | "carry";

export const PLAN_ITEM_KIND_LABEL: Record<PlanItemKind, string> = {
  top_deal: "Хаах боломжтой шилдэг 3 хэлцэл",
  priority: "Тэргүүлэх 3 ажил",
  obstacle: "Саад",
  carry: "Дараагийн долоо хоногт шилжих тэргүүлэх 3 боломж",
};

export type MoveKind = "advanced" | "backward" | "won" | "lost" | "none";

export const MOVE_KIND_LABEL: Record<MoveKind, { label: string; tone: "green" | "rose" | "amber" | "neutral" | "brand" }> = {
  advanced: { label: "Ахисан", tone: "green" },
  backward: { label: "Ухарсан", tone: "amber" },
  won: { label: "Амжилттай хаагдсан", tone: "brand" },
  lost: { label: "Амжилтгүй хаагдсан", tone: "rose" },
  none: { label: "Хөдөлгөөнгүй", tone: "neutral" },
};

// ── Хурал (§6.30, §9.5, §9.6) ─────────────────────────────

export type MeetingKind = "monday" | "friday";

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  monday: "Долоо хоногийн борлуулалтын хурал",
  friday: "Баасан гарагийн дүн шинжилгээ",
};

/** §9.5 хөтөлбөрийн хэсгүүдийн шошго — минут нь тохиргооноос. */
export const AGENDA_SECTION_LABEL: Record<string, string> = {
  dashboard: "Багийн хяналтын самбар: өнгөрсөн долоо хоног, энэ долоо хоногийн зорилт",
  agents: "Агент тус бүрийн танилцуулга, хэвийн бус тохиолдол",
  pipeline: "Халуун урсгал, хаах боломжтой хэлцэл, саад",
  coaching: "Дадлагажуулалтын зөвлөмж, шийдвэр, амлалт",
};

/** Агентын 3–5 минутын танилцуулгын дараалал (§6.20). */
export const PRESENTATION_STEPS = [
  "Өнгөрсөн долоо хоног: төлөвлөгөө ба гүйцэтгэл",
  "Хэлцлийн урсгал",
  "Энэ долоо хоногийн зорилт",
  "Тэргүүлэх 3 ажил",
  "Саад",
  "Амлалт",
] as const;

/** §9.6 Баасан гарагийн дүн шинжилгээний хэсэг → гаралт. */
export const FRIDAY_PROGRAM: { section: string; output: string }[] = [
  { section: "Төлөвлөгөө ба гүйцэтгэл", output: "Үнэлгээний оноо" },
  { section: "Урсгалын хөдөлгөөн", output: "Шилжих ажлын жагсаалт" },
  { section: "Хугацаа хэтэрсэн эргэн холбогдолт", output: "Нөхөн сэргээх арга хэмжээ" },
  { section: "Алдсан шалтгаан", output: "Сургамж" },
  { section: "Хаалт, орлого", output: "Бодит гүйцэтгэл" },
  { section: "Дараагийн долоо хоногийн тэргүүлэх 3 ажил", output: "Тэргүүлэх чиглэлийн төсөл" },
  { section: "Дадлагажуулалтын хэрэгцээ", output: "Дараагийн уулзалт" },
];

export type DecisionKind = "decision" | "commitment" | "coaching" | "obstacle";

export const DECISION_KIND_LABEL: Record<DecisionKind, string> = {
  decision: "Шийдвэр",
  commitment: "Амлалт",
  coaching: "Дадлагажуулалт",
  obstacle: "Саадын шийдэл",
};

export type AnomalyKind =
  | "no_plan"
  | "plan_not_approved"
  | "low_score"
  | "overdue"
  | "target_gap"
  | "no_activity"
  | "hot_without_step";

export const ANOMALY_LABEL: Record<AnomalyKind, string> = {
  no_plan: "Долоо хоногийн төлөвлөгөө бөглөөгүй",
  plan_not_approved: "Төлөвлөгөө батлагдаагүй",
  low_score: "Өнгөрсөн долоо хоногийн оноо доогуур",
  overdue: "Хугацаа хэтэрсэн эргэн холбогдолт олон",
  target_gap: "Зорилтоос их хоцорсон",
  no_activity: "Утга бүхий ярилцлага бүртгэгдээгүй",
  hot_without_step: "Дараагийн үйлдэлгүй халуун сэжим",
};
