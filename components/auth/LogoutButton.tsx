"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={logout} disabled={pending} className={className}>
      {children}
    </button>
  );
}
