"use client";

import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";

export function AdminLoginForm({ next = "/admin" }: { next?: string }) {
  return (
    <EmailPasswordForm
      redirectTo={next}
      submitLabel="Backoffice нэвтрэх"
      emailPlaceholder="admin@nemi.mn"
      roleCheck={async (supabase, userId) => {
        const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
        if (data?.role !== "admin") return "Танд admin эрх байхгүй байна.";
        return null;
      }}
    />
  );
}
