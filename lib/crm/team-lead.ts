/**
 * Багийн ахлагчийн санал, батлалт (20261110000100): оффисын админ томилбол шууд
 * хүчинтэй; баг удирдах эрхтэй бусад хүн санал болгож, оффисын админ батална.
 * Цэвэр функц — сервер, клиентийн аль алинд ажиллана.
 */

/** crm_team_propose_lead-ийн үр дүн: шууд томилогдсон эсвэл батлалт хүлээж байна. */
export type LeadProposeStatus = "applied" | "pending";

export type PendingLead = {
  profileId: string;
  name: string;
  proposedBy: { profileId: string; name: string } | null;
  proposedAt: string | null;
  /** Үзэж буй хэрэглэгч өөрөө санал болгосон — цуцалж болно. */
  byViewer: boolean;
};

const UNKNOWN_NAME = "Хэрэглэгч";

/** RPC-ийн текст үр дүн; 'applied'-аас бусад нь эрх идэвхжээгүй гэж үзнэ. */
export function parseProposeStatus(value: unknown): LeadProposeStatus {
  return value === "applied" ? "applied" : "pending";
}

/**
 * crm_teams-ийн саналын баганаас нэр шийдсэн санал. FK-гүй тул нэрийг roster-оос авна
 * (nameOf); олдохгүй бол ерөнхий нэр.
 */
export function resolvePendingLead(
  team: { pending_lead_profile_id: string | null; lead_proposed_by: string | null; lead_proposed_at: string | null },
  nameOf: (profileId: string) => string | undefined,
  viewerId: string | null
): PendingLead | null {
  const profileId = team.pending_lead_profile_id;
  if (!profileId) return null;
  const by = team.lead_proposed_by;
  return {
    profileId,
    name: nameOf(profileId) ?? UNKNOWN_NAME,
    proposedBy: by ? { profileId: by, name: nameOf(by) ?? UNKNOWN_NAME } : null,
    proposedAt: team.lead_proposed_at,
    byViewer: !!by && by === viewerId,
  };
}

/**
 * Гишүүний мөрөнд харуулах ахлагчийн товч: оффисын админ шууд томилно, бусад нь санал
 * болгоно. Одоогийн ахлагч (чөлөөлөх товчтой), санал болгогдсон хүн (батлалт хүлээж буй)
 * товчгүй. Ахлагчаар бичигдсэн ч эрхгүй хүнийг зөвхөн оффисын админ засна — RPC санал
 * болгохыг «аль хэдийн ахлагч» гэж татгалздаг.
 */
export function leadActionFor(
  profileId: string,
  team: {
    lead: { profileId: string } | null;
    brokenLead: { profileId: string } | null;
    pendingLead: { profileId: string } | null;
  },
  canApprove: boolean
): "appoint" | "propose" | null {
  if (team.lead?.profileId === profileId || team.pendingLead?.profileId === profileId) return null;
  if (canApprove) return "appoint";
  return team.brokenLead?.profileId === profileId ? null : "propose";
}

/**
 * Батлах/татгалзахын өмнө: санал одоо ч хүлээгдэж байгаа эсэх, хуудсанд харсан санал
 * (expected; өгөөгүй бол шалгахгүй) солигдоогүй эсэх. Хуудас хуучирсан бол өөр хүнийг
 * батлах, шийдэгдсэн саналд «амжилттай» гэхээс сэргийлнэ.
 */
export function staleProposalError(pending: string | null | undefined, expected?: string | null): string | null {
  if (!pending) return "Санал аль хэдийн шийдэгдсэн байна.";
  return !expected || pending === expected ? null : "Санал өөрчлөгдсөн байна. Хуудсаа шинэчилнэ үү.";
}

/** Ахлагч томилох/санал болгох/батласны дараах мэдэгдэл. */
export function leadChangeToast(status: LeadProposeStatus, name: string): { title: string; description?: string } {
  return status === "applied"
    ? { title: `${name} багийн ахлагч боллоо`, description: "Ахлагчийн эрх тэр даруй идэвхжлээ." }
    : {
        title: `«${name}»-г ахлагчаар санал болголоо`,
        description: "Оффисын админ батласны дараа ахлагчийн эрх идэвхжинэ.",
      };
}
