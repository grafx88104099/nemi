import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/SignupForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <Card>
      <CardBody className="space-y-6 p-7">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-extrabold text-ink">Бүртгэл үүсгэх</h1>
          <p className="text-sm text-muted">Нэми-д тавтай морил</p>
        </div>
        <OAuthButtons />
        <div className="flex items-center gap-3 text-xs text-subtle">
          <span className="h-px flex-1 bg-line" />
          эсвэл и-мэйлээр
          <span className="h-px flex-1 bg-line" />
        </div>
        <SignupForm role="buyer" />
      </CardBody>
    </Card>
  );
}
