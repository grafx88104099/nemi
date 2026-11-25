/**
 * CRM-ийн мэдэгдлийн төрөл (notifications.type) → монгол ангилал. Цэвэр модуль (мэдэгдлийн хуудас, тест).
 * DB-ийн crm2_notify(…, '<төрөл>', …) бүр энд нэртэй байна (notification-labels.test.ts миграцаас шалгана).
 * Одоо үүсэхгүй болсон төрлийн нэрийг түүхэн мөрт зориулж «(хуучин)» гэж үлдээнэ.
 */
export const NOTIFICATION_EVENT_LABEL: Record<string, string> = {
  // Зуучлалын гэрээ (20261125000100: батлах алхамгүй — бүртгэл ба «Гэрээ буруу»)
  crm2_brokerage_registered: "Зуучлалын гэрээ бүртгэгдсэн",
  crm2_brokerage_invalid: "Гэрээ буруу — ноорог руу буцсан",
  crm2_brokerage_migrated: "Зуучлалын гэрээ PDF-ээр бүртгэх (шинэ дүрэм)",
  crm2_brokerage_pending: "Зуучлалын гэрээ батлах (хуучин)",
  crm2_brokerage_decided: "Зуучлалын гэрээний шийдвэр (хуучин)",
  crm2_brokerage_expiring: "Зуучлалын гэрээ дуусах гэж буй",
  crm2_property_ended: "Хөрөнгийн гэрээ дууссан",
  crm2_request: "Хүсэлт",
  crm2_request_decided: "Хүсэлтийн шийдвэр",
  crm2_request_call: "Дуудлагатай шилжүүлэх хүсэлт",
  crm2_request_call_unrecorded: "Харилцагч өөр агенттай холбогдсон",
  crm2_request_call_skipped: "Хадгалсан дуудлага бүртгэгдсэнгүй",
  crm2_waitlist_match: "Хүлээлгийн жагсаалт: хөрөнгө олдлоо",
  crm2_activation_blocked: "Хөрөнгө идэвхжсэнгүй — дутуу зүйлтэй (хуучин)",
  crm2_activation_ready: "Хөрөнгийг идэвхжүүлэхэд бэлэн (хуучин)",
  crm2_duplicate: "Давхардсан байж болзошгүй хөрөнгө",
  crm2_duplicate_resolved: "Давхардлын шийдвэр",
  crm2_incomplete_digest: "Өнөөдрийн дутуу бүртгэл",
  crm2_contact_transferred: "Харилцагч шилжсэн",
  crm2_deal_transferred: "Хэлцэл шилжсэн",
  crm_team_lead: "Багийн ахлагч",
  crm_team_lead_proposal: "Ахлагчийн санал",
  crm_team_lead_approved: "Ахлагч батлагдсан",
  crm_team_lead_rejected: "Ахлагчийн санал татгалзсан",
  crm_offboarding: "Гарах ажилтан",
};

/** CRM-ийн бус төрөлд null; мэдэгдэхгүй CRM төрөлд (хуучин crm_* г.м.) «CRM». */
export function notificationEventLabel(type: string | null | undefined): string | null {
  if (!type || !type.startsWith("crm")) return null;
  return NOTIFICATION_EVENT_LABEL[type] ?? "CRM";
}
