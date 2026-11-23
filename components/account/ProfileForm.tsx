"use client";

import { useState, useTransition } from "react";

import { updateProfile } from "@/lib/actions/profile";
import { normalizePhone } from "@/lib/crm2/phone";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function ProfileForm({
  initial,
  email,
  phoneVerified = false,
}: {
  initial: { full_name: string; phone: string };
  email: string;
  /** profiles.phone_verified_at тогтсон (SMS OTP-оор баталгаажсан). */
  phoneVerified?: boolean;
}) {
  const [fullName, setFullName] = useState(initial.full_name);
  const [phone, setPhone] = useState(initial.phone);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Баталгаажсан дугаараа өөрчилж эхэлбэл тэмдэг алга болно (DB guard ч NULL болгоно).
  const showVerified =
    phoneVerified && !!normalizePhone(initial.phone) && normalizePhone(phone) === normalizePhone(initial.phone);

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
      {email ? (
        <Field label="И-мэйл">
          <Input value={email} disabled />
        </Field>
      ) : null}
      <Field label="Бүтэн нэр" htmlFor="fn">
        <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor="ph" className="block text-sm font-medium text-ink">
            Утас
          </label>
          {showVerified ? <span className="text-xs font-semibold text-emerald-600">Баталгаажсан ✓</span> : null}
        </div>
        <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+976 ..." />
        {showVerified ? (
          // Шинэ дугаарыг баталгаажуулах (updateUser({ phone })) урсгал одоогоор байхгүй —
          // «шинэ дугаараар нэвтэр» гэвэл өөр (шинэ) бүртгэл рүү оруулна. Тиймээс заахгүй.
          <p className="text-xs text-muted">Дугаараа өөрчилбөл баталгаажуулалт цуцлагдана.</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Хадгалж байна..." : "Хадгалах"}
        </Button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>
    </form>
  );
}
