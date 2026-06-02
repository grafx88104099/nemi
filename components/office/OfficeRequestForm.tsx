"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { requestOffice } from "@/lib/actions/offices";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function OfficeRequestForm({ next = "/office-signup" }: { next?: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const r = await requestOffice({ name, phone, note });
      if (r.error === "auth") {
        router.push("/login?next=" + encodeURIComponent(next));
        return;
      }
      if (r.error) setErr("Алдаа гарлаа. Дахин оролдоно уу.");
      else setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-6 text-center">
        <h3 className="text-lg font-bold text-emerald-700">Хүсэлт илгээгдлээ ✓</h3>
        <p className="mt-1 text-sm text-muted">
          Админ хянаад баталгаажуулна. Батлагдсаны дараа танд мэдэгдэл ирж, оффисын
          самбар нээгдэнэ.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Оффисын нэр" htmlFor="name">
        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Жнь: Голден Хаус" />
      </Field>
      <Field label="Холбоо барих утас" htmlFor="phone">
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+976 ..." />
      </Field>
      <Field label="Нэмэлт мэдээлэл" htmlFor="note" hint="Үйл ажиллагаа, хаяг, агентын тоо г.м.">
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      </Field>
      {err && <p className="text-sm text-danger">{err}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Илгээж байна..." : "Хүсэлт илгээх"}
      </Button>
    </form>
  );
}
