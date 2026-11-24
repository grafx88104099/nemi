"use client";

import { useGuardedLogout } from "@/components/crm2/shell/LogoutGuard";

/**
 * Гарах товч. signOut-оос өмнө CRM-ийн төхөөрөмж дээрх илгээгдээгүй зураг/бүртгэлийг шалгаж
 * анхааруулна, дараа нь төхөөрөмжийн өгөгдлийг цэвэрлэнэ (components/crm2/shell/LogoutGuard).
 */
export function LogoutButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { logout, pending, dialog } = useGuardedLogout();

  return (
    <>
      <button type="button" onClick={logout} disabled={pending} className={className}>
        {children}
      </button>
      {dialog}
    </>
  );
}
