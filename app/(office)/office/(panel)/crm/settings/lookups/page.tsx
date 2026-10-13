import { getAllLookups } from "@/lib/queries-crm-core";
import { requireSettingsAccess } from "../_lib/guard";
import { LookupsShell } from "./LookupsShell";

export const metadata = { title: "Лавлах жагсаалтууд — CRM тохиргоо" };

export default async function LookupSettingsPage() {
  const ctx = await requireSettingsAccess();
  const lookups = await getAllLookups();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Лавлах жагсаалтууд</h1>
      <p className="text-sm text-muted">
        «Админ өргөтгөнө» ангиллын утгууд — эх сурвалж, алдсан шалтгаан, шошго, засварын ангилал гэх мэт.
        «Бусад» маягийн утгад тайлбар заавал шаардах тохиргоотой (F-104).
      </p>
      <LookupsShell lookups={lookups} canEdit={ctx.canEdit} />
    </div>
  );
}
