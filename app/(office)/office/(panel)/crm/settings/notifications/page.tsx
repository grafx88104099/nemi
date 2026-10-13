import { getNotificationMatrix } from "@/lib/queries-crm-core";
import { requireSettingsAccess } from "../_lib/guard";
import { NotificationsShell } from "./NotificationsShell";

export const metadata = { title: "Мэдэгдлийн матриц — CRM тохиргоо" };

export default async function NotificationSettingsPage() {
  const ctx = await requireSettingsAccess();
  const matrix = await getNotificationMatrix();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-extrabold text-ink">Мэдэгдлийн матриц</h1>
      <p className="text-sm text-muted">
        Event бүрийн хүлээн авагч дүр, суваг (app/push/email/sms — email/sms заглушка), заавал ангилал (F-651/652).
        МУТСТ-ийн үйл явдалд агент/харилцагчид мэдэгдэл ХЭЗЭЭ Ч илгээгдэхгүй (ACC-25).
      </p>
      <NotificationsShell matrix={matrix} canEdit={ctx.canEdit} />
    </div>
  );
}
