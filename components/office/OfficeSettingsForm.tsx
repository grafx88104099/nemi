"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateMyOffice } from "@/lib/actions/offices";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

type OfficeFields = {
  name: string; logo: string; color: string;
  phone: string; email: string; address: string;
};

export function OfficeSettingsForm({ initial }: { initial: OfficeFields }) {
  const [f, setF] = useState<OfficeFields>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const set = <K extends keyof OfficeFields>(k: K, v: OfficeFields[K]) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const r = await updateMyOffice(f);
      if (!("error" in r)) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl text-xl font-bold text-white" style={{ background: f.color }}>
          {f.logo.slice(0, 3).toUpperCase()}
        </div>
        <span className="text-sm text-muted">Урьдчилан харах</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Оффисын нэр" htmlFor="name">
          <Input id="name" required value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Товчлол (лого)" htmlFor="logo" hint="2-3 үсэг">
          <Input id="logo" maxLength={3} value={f.logo} onChange={(e) => set("logo", e.target.value)} />
        </Field>
        <Field label="Утас" htmlFor="phone">
          <Input id="phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+976 ..." />
        </Field>
        <Field label="И-мэйл" htmlFor="email">
          <Input id="email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
      </div>
      <Field label="Хаяг" htmlFor="address">
        <Input id="address" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Дүүрэг, гудамж..." />
      </Field>
      <Field label="Брэнд өнгө" htmlFor="color">
        <input id="color" type="color" value={f.color} onChange={(e) => set("color", e.target.value)} className="h-11 w-20 rounded-lg border border-line" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Хадгалж байна..." : "Хадгалах"}</Button>
        {saved && <span className="text-sm font-medium text-emerald-600">Хадгалагдлаа ✓</span>}
      </div>
    </form>
  );
}
