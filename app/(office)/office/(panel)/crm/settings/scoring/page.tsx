import { getSettingHistory } from "@/lib/queries-crm-core";
import { requireSettingsAccess } from "../_lib/guard";
import { SettingEditor } from "../_components/SettingEditor";
import { SCORING_SECTIONS } from "../_components/setting-specs";

export const metadata = { title: "Оноо, жин, босго — CRM тохиргоо" };

/**
 * Оноо, ангилал, SLA, идэвхгүй/эргэлтийн босго, сан, маргааны хугацаа.
 * Босгыг Борлуулалт хариуцсан захирал тогтооно (§5, §6.26) — тэр дүрд
 * зөвшөөрсөн түлхүүрүүд засагдана; бусдыг Үйл ажиллагаа-ЧМТ / Системийн админ.
 */
export default async function ScoringSettingsPage() {
  const ctx = await requireSettingsAccess();
  const histories = await Promise.all(SCORING_SECTIONS.map((s) => getSettingHistory(s.key)));

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Оноо, жин, босго</h1>
      <p className="text-sm text-muted">
        Хувилбартай параметрүүд — шинэ утга зөвхөн урагш үйлчилнэ; тооцоо бүр ашигласан хувилбараа хадгална.
        Сэжим идэвхгүй болох, эргэлтэд буцаан оруулах босгыг Борлуулалт хариуцсан захирал тогтооно.
      </p>
      <div className="mt-6 space-y-4">
        {SCORING_SECTIONS.map((s, i) => (
          <SettingEditor
            key={s.key}
            settingKey={s.key}
            title={s.title}
            description={s.description}
            versions={histories[i]}
            canEdit={ctx.canEditSetting(s.key)}
            spec={s.spec}
          />
        ))}
      </div>
    </div>
  );
}
