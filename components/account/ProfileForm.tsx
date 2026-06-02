"use client";

import { useState, useTransition } from "react";

import { updateProfile } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function ProfileForm({
  initial,
  email,
}: {
  initial: { full_name: string; phone: string };
  email: string;
}) {
  const [fullName, setFullName] = useState(initial.full_name);
  const [phone, setPhone] = useState(initial.phone);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await updateProfile({ full_name: fullName, phone });
      setMsg(res.ok ? "Хадгалагдлаа ✓" : "Алдаа гарлаа.");
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="И-мэйл">
        <Input value={email} disabled />
      </Field>
      <Field label="Бүтэн нэр" htmlFor="fn">
        <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <Field label="Утас" htmlFor="ph">
        <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+976 ..." />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Хадгалж байна..." : "Хадгалах"}
        </Button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>
    </form>
  );
}
