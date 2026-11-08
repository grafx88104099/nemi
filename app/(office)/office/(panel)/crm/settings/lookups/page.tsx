import { getAllLookups } from "@/lib/queries-crm-core";
import { requireLookupsAccess } from "../_lib/guard";
import { LookupsShell } from "./LookupsShell";

export const metadata = { title: "Лавлах жагсаалтууд — CRM тохиргоо" };

export default async function LookupSettingsPage() {
  const ctx = await requireLookupsAccess();
  const lookups = await getAllLookups();

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Лавлах жагсаалтууд</h1>
      <p className="text-sm text-muted">
        Эх сурвалж, алдсан шалтгаан, шошго, засварын ангилал гэх мэт сонголтын утгууд. «Бусад» маягийн утгад тайлбар
        заавал шаардаж болно. Сэжимийн эх сурвалжийн лавлахыг Маркетингийн мэргэжилтэн тодорхойлно.
      </p>
      <LookupsShell lookups={lookups} editableKinds={ctx.editableKinds} />
    </div>
  );
}
