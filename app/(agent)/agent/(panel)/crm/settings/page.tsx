import { headers } from "next/headers";

import { Card, CardBody } from "@/components/ui/card";
import { InstallPrompt } from "@/components/crm/mobile/InstallPrompt";
import { PushToggle } from "@/components/crm/mobile/PushToggle";
import { COMING_LATER_TEXT } from "@/lib/crm2/labels";
import { getCrm2Context, getCrm2Settings } from "@/lib/crm2/context";
import { isPilot, quickAddEnabled } from "@/lib/crm2/feature-flags";
import { quickAddSettingText, sharePlatform } from "@/lib/crm2/share-help";

export const metadata = { title: "Тохиргоо — CRM" };

/**
 * Агентын хувийн CRM тохиргоо: push мэдэгдэл, апп суулгах. Оффисын тохиргооноос
 * агентад хамаатай хэсгийг (шуурхай бүртгэл, өдрийн сануулга) ЗӨВХӨН уншиж харуулна —
 * өөрчлөхийг оффисын удирдлага /office/crm/settings/policies-д хийнэ.
 */
export default async function AgentCrmSettingsPage() {
  const ctx = await getCrm2Context();
  const settings = ctx?.isMember ? await getCrm2Settings() : null;
  const quick = settings && ctx ? quickAddEnabled(settings, ctx.profileId) : false;
  const digestScope = settings?.["digest.scope"] ?? "off";
  const digest =
    !!settings && !!ctx && (digestScope === "all" || (digestScope === "pilot" && isPilot(settings, ctx.profileId)));
  // «Хуваалцах» зөвхөн Android-д — iPhone-д хуулж буулгахыг зааварлана.
  const platform = sharePlatform((await headers()).get("user-agent"));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6 md:px-6">
      <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Тохиргоо</h1>
      <Card className="mt-4">
        <CardBody className="space-y-3 p-4 sm:p-5">
          <p className="font-semibold text-ink">Утасны мэдэгдэл</p>
          <PushToggle />
          <InstallPrompt />
        </CardBody>
      </Card>

      {settings ? (
        <Card className="mt-4">
          <CardBody className="p-4 sm:p-5">
            <p className="font-semibold text-ink">Оффисын тохиргоо</p>
            <dl className="mt-2 divide-y divide-line text-sm">
              <div className="py-2.5">
                <dt className="text-muted">Шуурхай бүртгэл</dt>
                <dd className="mt-0.5 font-medium text-ink">{quickAddSettingText(quick, platform)}</dd>
              </div>
              <div className="py-2.5">
                <dt className="text-muted">Өдрийн дутуу бүртгэлийн сануулга</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {digest ? "Өдөрт нэг удаа, 19:00 цагт ирнэ (шөнө мэдэгдэл явахгүй)." : "Танд илгээгдэхгүй."}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">Эдгээрийг оффисын удирдлага тохируулна.</p>
          </CardBody>
        </Card>
      ) : null}

      <p className="mt-3 text-sm text-muted">
        Мэдэгдлийн суваг зэрэг бусад хувийн тохиргоо: {COMING_LATER_TEXT.toLowerCase()}.
      </p>
    </div>
  );
}
