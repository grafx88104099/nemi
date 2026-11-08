import { SCORE_CRITERION_LABEL } from "@/lib/constants-crm";
import type { SettingFormSpec } from "@/lib/validation/crm-ownership";

/**
 * Бүтэцтэй тохиргооны маягтын тодорхойлолт (UX-11): түүхий JSON-ы оронд
 * талбар, хүрээ, нийлбэрийн шалгалт. Энд байхгүй түлхүүрийг «Нарийвчилсан»
 * JSON засварлагчаар засна.
 */

const grades = (unit: string, min: number, max: number) => [
  { name: "a", label: "A — Халуун", min, max, unit },
  { name: "b", label: "B — Дулаан", min, max, unit },
  { name: "c", label: "C — Ургуулах", min, max, unit },
  { name: "d", label: "D — Урт хугацааны", min, max, unit },
];

export type SettingSection = {
  key: string;
  title: string;
  description: string;
  spec: SettingFormSpec | null;
};

export const SCORING_SECTIONS: SettingSection[] = [
  {
    key: "lead_score_weights",
    title: "Сэжимийн онооны жин",
    description: "6 шалгуурын жин — нийлбэр 100.",
    spec: {
      kind: "map",
      sumTo: 100,
      fields: (Object.keys(SCORE_CRITERION_LABEL) as (keyof typeof SCORE_CRITERION_LABEL)[]).map((k) => ({
        name: k,
        label: SCORE_CRITERION_LABEL[k],
        min: 0,
        max: 100,
        unit: "оноо",
      })),
    },
  },
  {
    key: "lead_grade_thresholds",
    title: "Ангиллын босго",
    description: "Онооны доод хязгаар — A > B > C; үүнээс доош D.",
    spec: {
      kind: "map",
      descending: true,
      fields: [
        { name: "a", label: "A — Халуун", min: 1, max: 100, unit: "оноо" },
        { name: "b", label: "B — Дулаан", min: 1, max: 100, unit: "оноо" },
        { name: "c", label: "C — Ургуулах", min: 1, max: 100, unit: "оноо" },
      ],
    },
  },
  {
    key: "sla_first_contact_min",
    title: "Эхний холболтын хугацаа",
    description: "Дижитал сувгийн шинэ сэжимд ажлын цагаар хариу өгөх хугацаа.",
    spec: { kind: "scalar", field: { name: "value", label: "Хугацаа", min: 1, max: 240, unit: "минут" } },
  },
  {
    key: "lead_accept",
    title: "Хүлээн авах хугацаа",
    description: "Оноогдсон сэжмийг агент энэ хугацаанд хүлээн аваагүй бол дараагийн агентад шилжинэ.",
    spec: {
      kind: "toggle_map",
      toggle: { name: "enabled", label: "Хүлээн авах хугацаатай хуваарилалт идэвхтэй" },
      fields: [{ name: "window_min", label: "Хугацаа", min: 5, max: 240, unit: "минут" }],
    },
  },
  {
    key: "inactivity_thresholds",
    title: "Идэвхгүйн босго",
    description: "Сүүлийн бодит холболтоос хойш энэ хоног өнгөрвөл бүртгэл хамгаалалтгүй болно.",
    spec: { kind: "map", ascending: true, fields: grades("хоног", 1, 365) },
  },
  {
    key: "recycle_thresholds",
    title: "Эргэлтэд оруулах босго",
    description:
      "Бодит үйл ажиллагаагүй энэ хоног өнгөрсөн сэжмийг эргэлтэд оруулахаар хянан үзэж болно; шинэ сэжимд холболтгүй хоног.",
    spec: {
      kind: "map",
      fields: [
        ...grades("хоног", 1, 365),
        { name: "new_no_contact_days", label: "Шинэ, холболтгүй сэжим", min: 1, max: 60, unit: "хоног" },
      ],
    },
  },
  {
    key: "recontact_frequency",
    title: "Эргэн холбогдох давтамж",
    description: "Ангилал бүрийн анхдагч хоног.",
    spec: { kind: "map", ascending: true, fields: grades("хоног", 1, 180) },
  },
  {
    key: "pool_settings",
    title: "Эргэлтийн сан",
    description: "Агент нэг зэрэг хэдэн сэжим авах хүсэлт илгээж болох.",
    spec: {
      kind: "map",
      keepUnknown: true,
      fields: [{ name: "max_pending_claims", label: "Хүлээгдэж буй хүсэлтийн дээд тоо", min: 1, max: 50, unit: "ш" }],
    },
  },
  {
    key: "lead_dispute",
    title: "Эзэмшлийн маргаан",
    description: "Хариу өгөх, давж заалдах хугацаа.",
    spec: {
      kind: "map",
      keepUnknown: true,
      fields: [
        { name: "response_days", label: "Эзэмшигч хариу өгөх", min: 1, max: 30, unit: "хоног" },
        { name: "appeal_days", label: "Давж заалдах", min: 1, max: 60, unit: "хоног" },
      ],
    },
  },
  {
    key: "match_weights",
    title: "Тохируулгын жин",
    description: "Байршил, төсөв, төрөл/хэмжээ, хугацаа, заавал шаардлага, давуу тал — нийлбэр 100.",
    spec: {
      kind: "map",
      sumTo: 100,
      fields: [
        { name: "location", label: "Байршил", min: 0, max: 100 },
        { name: "budget", label: "Төсөв", min: 0, max: 100 },
        { name: "type_size", label: "Төрөл, хэмжээ", min: 0, max: 100 },
        { name: "timeline", label: "Хугацаа", min: 0, max: 100 },
        { name: "must_haves", label: "Заавал шаардлага", min: 0, max: 100 },
        { name: "nice_to_haves", label: "Давуу тал", min: 0, max: 100 },
      ],
    },
  },
  {
    key: "match_thresholds",
    title: "Тохируулгын босго",
    description: "Хүчтэй ба боломжит тохирлын доод оноо.",
    spec: {
      kind: "map",
      descending: true,
      keepUnknown: true,
      fields: [
        { name: "strong", label: "Хүчтэй тохирол", min: 1, max: 100, unit: "оноо" },
        { name: "possible", label: "Боломжит тохирол", min: 1, max: 100, unit: "оноо" },
      ],
    },
  },
  {
    key: "export_limits",
    title: "Экспортын хязгаар",
    description: "Удирдлага зөвшөөрөлгүй шууд татах дээд мөр, зөвшөөрлийн хүчинтэй хугацаа.",
    spec: {
      kind: "map",
      fields: [
        { name: "direct_max_rows", label: "Шууд экспортын дээд мөр", min: 1, max: 100000, unit: "мөр" },
        { name: "request_valid_hours", label: "Зөвшөөрлийн хугацаа", min: 1, max: 168, unit: "цаг" },
      ],
    },
  },
  {
    key: "contact_retention_years",
    title: "Хувь хүний мэдээллийн хадгалах хугацаа",
    description: "Хэлцлийн сүүлийн огнооноос тоолно; МУТСТ-ийн хадгалах хугацаанаас богиносгохгүй.",
    spec: { kind: "scalar", field: { name: "value", label: "Хугацаа", min: 1, max: 50, unit: "жил" } },
  },
  {
    key: "aml_weights",
    title: "МУТСТ эрсдэлийн жин",
    description: "Нарийвчилсан засварлагчаар засна.",
    spec: null,
  },
  {
    key: "adjacent_zones",
    title: "Зэргэлдээ бүсийн зураглал",
    description: "Байршлын код бүрд зэргэлдээ кодуудын жагсаалт — нарийвчилсан засварлагчаар.",
    spec: null,
  },
];
