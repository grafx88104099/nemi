import { Card, CardBody } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Шинэ нууц үг — Нэми" };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardBody className="space-y-6 p-7">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-extrabold text-ink">Шинэ нууц үг</h1>
          <p className="text-sm text-muted">Шинэ нууц үгээ оруулна уу</p>
        </div>
        <ResetPasswordForm />
      </CardBody>
    </Card>
  );
}
