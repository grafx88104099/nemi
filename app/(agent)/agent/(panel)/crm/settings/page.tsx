import { Card, CardBody } from "@/components/ui/card";
import { InstallPrompt } from "@/components/crm/mobile/InstallPrompt";
import { PushToggle } from "@/components/crm/mobile/PushToggle";
import { COMING_LATER_TEXT } from "@/lib/crm2/labels";

export const metadata = { title: "Тохиргоо — CRM" };

/** Агентын хувийн CRM тохиргоо: push мэдэгдэл, апп суулгах. Бусад нь дараагийн шатанд. */
export default function AgentCrmSettingsPage() {
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
      <p className="mt-3 text-sm text-muted">
        Мэдэгдлийн суваг зэрэг бусад хувийн тохиргоо: {COMING_LATER_TEXT.toLowerCase()}.
      </p>
    </div>
  );
}
