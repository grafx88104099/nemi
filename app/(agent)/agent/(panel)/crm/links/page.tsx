import { Suspense } from "react";
import { redirect } from "next/navigation";

import { myCrmContext } from "@/lib/queries-crm-today";
import { getMyOpenHouses, getMyPublicLinks } from "@/lib/queries-crm-links";
import { CrmNav } from "@/components/crm/CrmNav";
import { LinksShell } from "@/components/crm/links/LinksShell";

export const metadata = { title: "Холбоос, тайлан — CRM" };

/** R9, R10, R11: харилцагчид гарах токентой холбоос, QR. */
export default async function LinksPage() {
  const ctx = await myCrmContext();
  if (!ctx) redirect("/agent");
  const [links, oh] = await Promise.all([getMyPublicLinks(), getMyOpenHouses()]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-4 sm:py-6">
      <div className="mb-4 hidden border-b border-line md:block">
        <CrmNav roles={ctx.roles} basePath="/agent/crm" />
      </div>
      <h1 className="mb-1 text-xl font-bold text-ink">Холбоос, тайлан</h1>
      <p className="mb-3 text-sm text-muted">
        Харилцагч нэвтрэлгүйгээр нээх хугацаатай холбоос. Хувийн мэдээлэл, бусад харилцагчийн мэдээлэл гарахгүй.
      </p>
      <Suspense>
        <LinksShell links={links.rows} openHouses={oh.rows} unavailable={links.unavailable || oh.unavailable} />
      </Suspense>
    </div>
  );
}
