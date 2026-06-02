"use client";

import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";

export function AgentLoginForm({ next = "/agent" }: { next?: string }) {
  return (
    <EmailPasswordForm
      redirectTo={next}
      submitLabel="Агентаар нэвтрэх"
      emailPlaceholder="agent@example.com"
      roleCheck={async (supabase, userId) => {
        const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
        if (data?.role !== "agent" && data?.role !== "admin" && data?.role !== "office_admin") {
          return "Танд агентын эрх байхгүй байна.";
        }
        return null;
      }}
    />
  );
}
