import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loginHref, safeNext } from "@/lib/nav";
import { PHONE_LOGIN_ENABLED } from "@/lib/auth/phone-login";
import { Card, CardBody } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/SignupForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  // Нэвтрэх ↔ бүртгүүлэх хооронд буцах замыг хадгална (зөвхөн дотоод зам).
  const next = safeNext(rawNext, "/", "/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <Card>
      <CardBody className="space-y-6 p-7">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-extrabold text-ink">Бүртгэл үүсгэх</h1>
          <p className="text-sm text-muted">Нэми-д тавтай морил</p>
        </div>
        <OAuthButtons next={next} />
        {PHONE_LOGIN_ENABLED ? (
          <p className="text-center text-sm">
            <Link href={`${loginHref(next)}&method=phone`} className="font-semibold text-brand-600 hover:underline">
              Утасны дугаараар бүртгүүлэх
            </Link>
          </p>
        ) : null}
        <div className="flex items-center gap-3 text-xs text-subtle">
          <span className="h-px flex-1 bg-line" />
          эсвэл и-мэйлээр
          <span className="h-px flex-1 bg-line" />
        </div>
        <SignupForm role="buyer" next={next} />
      </CardBody>
    </Card>
  );
}
