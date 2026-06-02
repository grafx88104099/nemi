"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Copy, Check } from "lucide-react";

import { createAgentByOffice } from "@/lib/actions/agent-account";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export function AddAgentForm() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", specialty: "" });
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ emailed: boolean; link?: string; reason?: string; email?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    startTransition(async () => {
      const sentTo = f.email.trim();
      const r = await createAgentByOffice(f);
      if (r.error) setErr(r.error);
      else {
        setResult({ emailed: !!r.emailed, link: r.actionLink, reason: r.reason, email: sentTo });
        setF({ name: "", email: "", phone: "", specialty: "" });
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Шинэ агент нэмэх
      </Button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h3 className="mb-3 font-bold text-ink">Шинэ агент нэмэх</h3>
      {result ? (
        <div className="space-y-3">
          <div className={`rounded-xl p-4 text-sm ${result.emailed ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {result.emailed ? (
              <>✓ Агент үүслээ. Нэвтрэх урилгыг <b>{result.email}</b> хаяг руу илгээлээ. Агент и-мэйл дээрх товчоор нууц үгээ үүсгэн самбартаа нэвтэрнэ.</>
            ) : (
              <>✓ Агент үүслээ. Гэхдээ и-мэйл илгээгдсэнгүй{result.reason ? ` (${result.reason})` : ""}. Доорх линкийг агентад дамжуулна уу:</>
            )}
          </div>
          {result.link && (
            <div>
              {result.emailed && <p className="mb-1 text-xs text-muted">Нөөц линк (и-мэйл очоогүй тохиолдолд):</p>}
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-2">
                <input readOnly value={result.link} className="flex-1 bg-transparent text-xs outline-none" onFocus={(e) => e.target.select()} />
                <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(result.link!); setCopied(true); } catch {} }} className="rounded-md p-1.5 text-brand-600 hover:bg-surface">
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
              </div>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => { setResult(null); setCopied(false); setOpen(false); }}>Хаах</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Нэр" htmlFor="an"><Input id="an" required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Б. Болд" /></Field>
            <Field label="Нэвтрэх и-мэйл" htmlFor="ae"><Input id="ae" type="email" required value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="agent@example.com" /></Field>
            <Field label="Утас" htmlFor="ap"><Input id="ap" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+976 ..." /></Field>
            <Field label="Мэргэшил" htmlFor="as"><Input id="as" value={f.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder="Орон сууц" /></Field>
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Үүсгэж байна..." : "Үүсгэх ба урих"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Болих</Button>
          </div>
        </form>
      )}
    </div>
  );
}
