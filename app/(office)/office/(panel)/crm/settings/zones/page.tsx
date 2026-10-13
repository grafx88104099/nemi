import { getBranches, getTeams, getZones } from "@/lib/queries-crm-core";
import { requireSettingsAccess } from "../_lib/guard";
import { ZonesShell } from "./ZonesShell";

export const metadata = { title: "Бүс, салбар, баг — CRM тохиргоо" };

export default async function ZoneSettingsPage() {
  const ctx = await requireSettingsAccess();
  const [branches, teams, zones] = await Promise.all([getBranches(), getTeams(), getZones()]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Бүс, салбар, баг</h1>
      <p className="text-sm text-muted">
        Бүсийн лавлах (F-207) объектын салбарыг автоматаар тогтооно; өөрчлөлт бүр аудитад бүртгэгдэнэ.
      </p>
      <ZonesShell branches={branches} teams={teams} zones={zones} canEdit={ctx.canEdit} />
    </div>
  );
}
