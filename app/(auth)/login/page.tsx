import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/nav";
import { Card, CardBody } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  // Зөвхөн дотоод зам — redirect болон нэвтэрсний дараах router.push хоёуланд.
  const next = safeNext(rawNext, "/", "/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Алдаатай ирсэн бол нэвтэрсэн хэрэглэгчийг ч дуугүй шилжүүлэхгүй — юу
  // болсныг нь харуулна.
  if (user && !error) redirect(next);

  return (
    <Card>
      <CardBody className="space-y-6 p-7">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-brand-600"
        >
          <ArrowLeft className="size-4" />
          Нүүр хуудас руу буцах
        </Link>
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-extrabold text-ink">Тавтай морил</h1>
          <p className="text-sm text-muted">Нэми бүртгэлдээ нэвтэрнэ үү</p>
        </div>
        {error === "auth" && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            Холбоос хүчингүй эсвэл хугацаа нь дууссан байна.{" "}
            <Link href="/forgot-password" className="font-semibold underline">
              Шинэ холбоос авах
            </Link>
          </p>
        )}
        <OAuthButtons next={next} />
        <div className="flex items-center gap-3 text-xs text-subtle">
          <span className="h-px flex-1 bg-line" />
          эсвэл и-мэйлээр
          <span className="h-px flex-1 bg-line" />
        </div>
        <LoginForm next={next} />
        <div className="border-t border-line pt-4 text-center text-xs text-muted">
          Мэргэжлийн нэвтрэлт:{" "}
          <Link href="/agent/login" className="font-semibold text-brand-600 hover:underline">Агент</Link>
          {" · "}
          <Link href="/office/login" className="font-semibold text-brand-600 hover:underline">Оффис</Link>
        </div>
        {process.env.NODE_ENV !== "production" && (
          <div className="rounded-xl border border-dashed border-line bg-surface-2 p-3 text-center text-xs text-muted">
            <span className="font-semibold text-brand-600">DEV тэмдэглэл</span> (production-д харагдахгүй)
            <div className="mt-1 font-mono text-ink/70">buyer@nemi.mn · buyer123</div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
