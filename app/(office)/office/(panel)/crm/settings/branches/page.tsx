import { BackLink } from "@/components/ui/back-link";
import { getBranches } from "@/lib/queries-crm-core";
import { requireSettingsAccess } from "../_lib/guard";
import { BranchesShell } from "./BranchesShell";

export const metadata = { title: "Салбар — CRM тохиргоо" };

export default async function BranchSettingsPage() {
  const ctx = await requireSettingsAccess();
  const branches = await getBranches();

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <BackLink href="/office/crm/settings" label="Тохиргоо руу буцах" />
      <h1 className="text-2xl font-extrabold text-ink">Салбар</h1>
      <p className="text-sm text-muted">
        Баг бүр нэг салбарт харьяалагдана — шинэ баг үүсгэхийн өмнө салбараа нэмнэ. Өөрчлөлт аудитад бүртгэгдэнэ.
      </p>
      <BranchesShell branches={branches} canEdit={ctx.canEdit} />
    </div>
  );
}
