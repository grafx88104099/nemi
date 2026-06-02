import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Шинэ нууц үг — Нэми" };

// Нууц үг тохирсны дараа хэрэглэгчийн role-ийн дагуу очих самбар.
const DEST: Record<string, string> = {
  agent: "/agent",
  office_admin: "/office",
  admin: "/admin",
};

export default async function ResetPasswordPage() {
  // Callback session үүсгэсэн тул энд хэрэглэгчийн role унших боломжтой.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    role = profile?.role ?? null;
  }
  const dest = (role && DEST[role]) || "/login";
  // Урилгаар орсон агент анх удаа нэвтэрч байгаа тул тавтай морилно.
  const isAgentSetup = role === "agent";

  return (
    <Card>
      <CardBody className="space-y-6 p-7">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-extrabold text-ink">
            {isAgentSetup ? "Тавтай морилно уу! 🎉" : "Шинэ нууц үг"}
          </h1>
          <p className="text-sm text-muted">
            {isAgentSetup
              ? "Нэвтрэх нууц үгээ үүсгээд агентын самбартаа орно уу"
              : "Шинэ нууц үгээ оруулна уу"}
          </p>
        </div>
        <ResetPasswordForm next={dest} />
      </CardBody>
    </Card>
  );
}
