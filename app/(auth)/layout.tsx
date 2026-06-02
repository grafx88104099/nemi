import Link from "next/link";

import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-bg p-4">
      <Link href="/" className="mb-8">
        <Logo color="#0F172A" className="h-8 w-auto" />
      </Link>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-xs text-subtle">
        © 2026 Нэми технологи · Баталгаатай үл хөдлөх
      </p>
    </div>
  );
}
