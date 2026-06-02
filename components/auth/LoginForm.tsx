"use client";

import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";

export function LoginForm({ next = "/" }: { next?: string }) {
  return <EmailPasswordForm redirectTo={next} showSignup />;
}
