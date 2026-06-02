import Link from "next/link";

import { Card, CardBody } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Нууц үг сэргээх — Нэми" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardBody className="space-y-6 p-7">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-extrabold text-ink">Нууц үг сэргээх</h1>
          <p className="text-sm text-muted">И-мэйлээ оруулбал сэргээх холбоос илгээнэ</p>
        </div>
        <ForgotPasswordForm />
        <p className="text-center text-sm text-muted">
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">← Нэвтрэх</Link>
        </p>
      </CardBody>
    </Card>
  );
}
