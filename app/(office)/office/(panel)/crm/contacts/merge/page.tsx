import Link from "next/link";
import { redirect } from "next/navigation";

import { getCrmStaffContext } from "@/lib/queries-crm-core";
import { getContactPair } from "@/lib/queries-crm-contacts";
import { ContactMergeShell } from "@/components/crm/ContactMergeShell";

export const metadata = { title: "Бүртгэл нэгтгэх — CRM" };

type SearchParams = Promise<{ a?: string; b?: string }>;

/** F-108 merge дэлгэц (?a=&b=) — зөвхөн ops_qc (DESIGN §4.1). */
export default async function ContactMergePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCrmStaffContext();
  if (!ctx) redirect("/office");
  if (!ctx.roles.includes("ops_qc")) redirect("/office/crm/contacts");

  const { a, b } = await searchParams;
  if (!a || !b) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-extrabold text-ink">Бүртгэл нэгтгэх</h1>
        <p className="mt-2 text-sm text-muted">
          Харилцагчийн жагсаалтаас яг 2 бүртгэл сонгоод «Нэгтгэх» товчийг дарна уу (F-108).
        </p>
        <Link href="/office/crm/contacts" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
          Харилцагчийн сан руу буцах
        </Link>
      </div>
    );
  }

  const pair = await getContactPair(a, b);
  if (!pair) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-extrabold text-ink">Бүртгэл нэгтгэх</h1>
        <p className="mt-2 text-sm text-rose-600">Сонгосон бүртгэлүүд олдсонгүй эсвэл танд харах эрх алга.</p>
        <Link href="/office/crm/contacts" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
          Харилцагчийн сан руу буцах
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <ContactMergeShell a={pair.a} b={pair.b} basePath="/office/crm" />
    </div>
  );
}
