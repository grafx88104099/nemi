/**
 * Staff шуурхай бүртгэлийн feature flag (P2) ба хэмжилтийн үйл явдлын жагсаалт — цэвэр модуль.
 * Тохиргоо (staff.quick_add = off | pilot | all, staff.quick_add_pilot = profile id[]) DB-д байхгүй
 * (хуучин DB, RPC алдаа) бол parseCrm2Settings анхдагчаар ('off') ажиллана — хүн бүр хуучин форм.
 */

export type QuickAddMode = "off" | "pilot" | "all";

type QuickAddSettings = {
  "staff.quick_add"?: QuickAddMode | string | null;
  "staff.quick_add_pilot"?: readonly string[] | null;
};

const MODES: readonly QuickAddMode[] = ["off", "pilot", "all"];

function modeOf(settings: QuickAddSettings | null | undefined): QuickAddMode {
  const m = settings?.["staff.quick_add"];
  return MODES.includes(m as QuickAddMode) ? (m as QuickAddMode) : "off";
}

/** Профайл туршилтын жагсаалтад байгаа эсэх (том/жижиг үсэг үл хамаарна). */
export function isPilot(settings: QuickAddSettings | null | undefined, profileId: string | null | undefined): boolean {
  if (!profileId) return false;
  const id = profileId.toLowerCase();
  return (settings?.["staff.quick_add_pilot"] ?? []).some((x) => typeof x === "string" && x.toLowerCase() === id);
}

/** Энэ хэрэглэгчид шуурхай бүртгэл нээлттэй эсэх. */
export function quickAddEnabled(settings: QuickAddSettings | null | undefined, profileId: string | null | undefined): boolean {
  const mode = modeOf(settings);
  if (mode === "all") return !!profileId;
  if (mode === "pilot") return isPilot(settings, profileId);
  return false;
}

export type StaffNewSearchParams = {
  full?: string | string[] | null;
  share?: string | string[] | null;
  draft?: string | string[] | null;
};

const first = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * /crm/staff/new аль дэлгэцийг нээх:
 *   1) хуваалцсан зар (?share=…) + бүртгэх эрх + шуурхай бүртгэл нээлттэй → 'quick' (зөвхөн тэр дэлгэц
 *      хуваалцсаныг уншина); туршилтад ороогүй хэрэглэгч бүрэн формд (хуваалцсаныг гараар бөглөх зөвлөгөөтэй);
 *   2) ?full=1 → 'full' («Бүрэн форм» үргэлж нээлттэй);
 *   3) feature flag асаалттай → 'quick'; бусад үед 'full'.
 */
export function staffNewScreen(
  settings: QuickAddSettings | null | undefined,
  profileId: string | null | undefined,
  sp: StaffNewSearchParams | null | undefined,
  canWork: boolean
): "quick" | "full" {
  const enabled = quickAddEnabled(settings, profileId);
  if (canWork && enabled && first(sp?.share).trim() !== "") return "quick";
  if (first(sp?.full) === "1") return "full";
  return enabled ? "quick" : "full";
}

/** Бүрэн форм хуваалцсан зараар нээгдсэн эсэх (шуурхай бүртгэлгүй хэрэглэгчид зөвлөгөө харуулна). */
export function sharedToFullForm(sp: StaffNewSearchParams | null | undefined): boolean {
  return first(sp?.share).trim() !== "";
}

/** AI-аар зарын текст задлах: оффис зөвшөөрсөн (ai.listing_parse) БА сервер дээр түлхүүр тохируулсан. */
export function aiParseAllowed(settings: { "ai.listing_parse"?: boolean | null } | null | undefined, envEnabled: boolean): boolean {
  return settings?.["ai.listing_parse"] === true && envEnabled === true;
}

/** crm2_ui_events-д бичиж болох үйл явдлууд (зөвхөн хугацаа, тоо, туг — хувийн утга бичихгүй). */
export const UI_EVENTS = [
  "quick_open",
  "quick_first_input",
  "quick_save",
  "quick_offline_queued",
  "quick_sent_background",
  "draft_stale",
  "full_open",
  "full_save",
  "draft_restored_auto",
  "draft_restore_offer",
  "draft_restored",
  "draft_new_started",
  "draft_discarded",
  "draft_discard_undone",
  "paste_parsed",
  "ai_parsed",
  "share_received",
  "offline_capture_received",
  "owner_contact_picked",
  "owner_pasted",
  "photos_picked",
  "owner_pending",
  "dup_shown",
  "dup_opened",
  "dup_access_requested",
  "dup_marked_distinct",
  "dup_archived_mine",
  "checklist_opened",
  "sheet_saved",
  "contract_draft_saved",
  "contract_pages_captured",
  "contract_submitted",
  "import_listing",
  "upload_failed",
  "upload_retry_ok",
  "heic_converted",
] as const;
export type UiEventName = (typeof UI_EVENTS)[number];

export const UI_FLOWS = ["quick", "full", "share", "import", "card"] as const;
export type UiFlow = (typeof UI_FLOWS)[number];

export function isUiEvent(v: string): v is UiEventName {
  return (UI_EVENTS as readonly string[]).includes(v);
}
