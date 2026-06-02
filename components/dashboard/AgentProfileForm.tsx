"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateMyAgentProfile, type AgentProfileInput } from "@/lib/actions/agents";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { OfficeImageUpload } from "@/components/office/OfficeImageUpload";

export function AgentProfileForm({ initial }: { initial: AgentProfileInput }) {
  const [f, setF] = useState<AgentProfileInput>(initial);
  const [areasText, setAreasText] = useState(initial.areas.join(", "));
  const [langText, setLangText] = useState(initial.languages.join(", "));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const set = <K extends keyof AgentProfileInput>(k: K, v: AgentProfileInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    const payload: AgentProfileInput = {
      ...f,
      areas: areasText.split(",").map((s) => s.trim()).filter(Boolean),
      languages: langText.split(",").map((s) => s.trim()).filter(Boolean),
    };
    startTransition(async () => {
      const r = await updateMyAgentProfile(payload);
      if (r.error) setErr("Хадгалахад алдаа гарлаа.");
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const ta = "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      <OfficeImageUpload label="Профайл зураг" value={f.avatar_url} onChange={(v) => set("avatar_url", v)} variant="square" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Нэр" htmlFor="dn">
          <Input id="dn" required value={f.display_name} onChange={(e) => set("display_name", e.target.value)} />
        </Field>
        <Field label="Товчлол (аватар)" htmlFor="av" hint="2-3 үсэг">
          <Input id="av" maxLength={3} value={f.avatar} onChange={(e) => set("avatar", e.target.value)} />
        </Field>
        <Field label="Утас" htmlFor="ph">
          <Input id="ph" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+976 ..." />
        </Field>
        <Field label="Хариу өгөх хугацаа" htmlFor="rt" hint="жнь: ~15 минут">
          <Input id="rt" value={f.response_time} onChange={(e) => set("response_time", e.target.value)} />
        </Field>
      </div>
      <Field label="Мэргэшил" htmlFor="sp">
        <Input id="sp" value={f.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder="жнь: Лакшери орон сууц" />
      </Field>
      <Field label="Үйлчлэх бүс нутаг" htmlFor="ar" hint="таслалаар тусгаарла">
        <Input id="ar" value={areasText} onChange={(e) => setAreasText(e.target.value)} placeholder="Хан-Уул, Сүхбаатар" />
      </Field>
      <Field label="Хэл" htmlFor="lg" hint="таслалаар тусгаарла">
        <Input id="lg" value={langText} onChange={(e) => setLangText(e.target.value)} placeholder="Монгол, Англи" />
      </Field>
      <Field label="Танилцуулга (bio)" htmlFor="bio">
        <textarea id="bio" rows={4} className={ta} value={f.bio} onChange={(e) => set("bio", e.target.value)} />
      </Field>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Хадгалж байна..." : "Хадгалах"}</Button>
        {saved && <span className="text-sm font-medium text-emerald-600">Хадгалагдлаа ✓</span>}
      </div>
    </form>
  );
}
