import { getSettingHistory } from "@/lib/queries-crm-core";
import { requireSettingsAccess } from "../_lib/guard";
import { SettingEditor } from "../_components/SettingEditor";

export const metadata = { title: "Оноо, жин, босго — CRM тохиргоо" };

const KEYS: { key: string; title: string; description: string }[] = [
  { key: "lead_score_weights", title: "Сэжимийн онооны жин (F-112)", description: "100 онооны задаргааны жинүүд" },
  { key: "lead_grade_thresholds", title: "Ангиллын босго (A/B/C/D)", description: "Жишиг: a≥80, b≥60, c≥40" },
  { key: "match_weights", title: "Тохируулгын жин (F-251)", description: "location/budget/type_size/timeline/must_haves/nice_to_haves — жишиг 25/25/20/10/15/5" },
  { key: "match_thresholds", title: "Тохируулгын босго", description: "strong/possible босго — жишиг 80/65; adjacent_pct/size_partial_pct — хэсэгчилсэн %" },
  { key: "adjacent_zones", title: "Зэргэлдээ бүсийн зураглал", description: "{байршлын_код: [зэргэлдээ кодууд]} — хоосон бол зэргэлдээ оноо идэвхгүй" },
  { key: "aml_weights", title: "МУТСТ эрсдэлийн жин", description: "Жишиг: 30/25/20/15/10" },
  { key: "sla_first_contact_min", title: "Эхний холболтын SLA (минут, Д-02)", description: "Жишиг: 15" },
  { key: "recontact_frequency", title: "Эргэн холбогдолтын давтамж (Д-28/29)", description: "Ангилал бүрийн хоног — жишиг {a:3, b:7, c:21, d:60}" },
  { key: "inactivity_thresholds", title: "Идэвхгүйн босго (F-127/128)", description: "Ангилал бүрийн хоног — жишиг {a:14, b:30, c:60, d:90}; давбал хамгаалалтгүй" },
];

export default async function ScoringSettingsPage() {
  const ctx = await requireSettingsAccess();
  const histories = await Promise.all(KEYS.map((k) => getSettingHistory(k.key)));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Оноо, жин, босго</h1>
      <p className="text-sm text-muted">
        Хувилбартай параметрууд — шинэ утга зөвхөн урагш үйлчилнэ; тооцоо бүр ашигласан хувилбараа хадгална.
      </p>
      <div className="mt-6 space-y-4">
        {KEYS.map((k, i) => (
          <SettingEditor
            key={k.key}
            settingKey={k.key}
            title={k.title}
            description={k.description}
            versions={histories[i]}
            canEdit={ctx.canEdit}
          />
        ))}
      </div>
    </div>
  );
}
