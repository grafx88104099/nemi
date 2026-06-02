"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldOff, ShieldCheck, Copy, Check, UserPlus } from "lucide-react";

import {
  setAgentTempPassword,
  provisionAgentLogin,
  setAgentLoginEnabled,
} from "@/lib/actions/agent-account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Account = { hasLogin: boolean; email: string | null; banned: boolean };

export function AgentAccountManager({ agentId, account }: { agentId: string; account: Account }) {
  const [pending, startTransition] = useTransition();
  const [creds, setCreds] = useState<{ email?: string; password: string } | null>(null);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {}
  }

  // Нэвтрэлтгүй → үүсгэх
  if (!account.hasLogin) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Энэ агент системд нэвтрэх бүртгэлгүй байна. И-мэйл оруулж нэвтрэлт үүсгэнэ үү.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@example.com" className="max-w-xs" />
          <Button
            size="sm"
            disabled={pending || !email}
            onClick={() =>
              run(async () => {
                const r = await provisionAgentLogin(agentId, email);
                if (r.error) setErr("Үүсгэхэд алдаа гарлаа (имэйл давхардсан байж магадгүй).");
                else if (r.password) setCreds({ email: r.email, password: r.password });
              })
            }
          >
            <UserPlus className="size-4" /> Нэвтрэлт үүсгэх
          </Button>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}
        {creds && <CredBox creds={creds} onCopy={copy} copied={copied} />}
      </div>
    );
  }

  // Нэвтрэлттэй
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink"><Mail className="size-4 text-muted" /> {account.email}</span>
        {account.banned ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700"><ShieldOff className="size-3" /> Идэвхгүй</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><ShieldCheck className="size-3" /> Идэвхтэй</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await setAgentTempPassword(agentId);
              if (r.password) setCreds({ password: r.password });
              else setErr("Алдаа гарлаа.");
            })
          }
        >
          <KeyRound className="size-4" /> Түр нууц үг үүсгэх
        </Button>
        <Button
          size="sm"
          variant={account.banned ? "secondary" : "outline"}
          disabled={pending}
          onClick={() => run(() => setAgentLoginEnabled(agentId, account.banned))}
        >
          {account.banned ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
          {account.banned ? "Нэвтрэлт сэргээх" : "Нэвтрэлт идэвхгүй болгох"}
        </Button>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      {creds && <CredBox creds={creds} onCopy={copy} copied={copied} />}
    </div>
  );
}

function CredBox({
  creds,
  onCopy,
  copied,
}: {
  creds: { email?: string; password: string };
  onCopy: (t: string) => void;
  copied: boolean;
}) {
  const text = creds.email ? `${creds.email} / ${creds.password}` : creds.password;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-800">⚠ Нэг удаа харагдана — агентад дамжуулна уу:</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="flex-1 rounded-lg bg-surface px-2 py-1.5 text-sm text-ink">{text}</code>
        <button type="button" onClick={() => onCopy(text)} className="rounded-md p-1.5 text-brand-600 hover:bg-surface">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
