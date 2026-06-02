"use client";

import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";

export function OfficeLoginForm({ next = "/office" }: { next?: string }) {
  return (
    <EmailPasswordForm
      redirectTo={next}
      submitLabel="Оффисын самбарт нэвтрэх"
      emailPlaceholder="office@nemi.mn"
      roleCheck={async (supabase, userId) => {
        const { data } = await supabase.from("profiles").select("role, office_id").eq("id", userId).single();
        if ((data?.role !== "office_admin" && data?.role !== "admin") || !data?.office_id) {
          return "Танд оффисын удирдлагын эрх байхгүй байна.";
        }
        return null;
      }}
    />
  );
}
