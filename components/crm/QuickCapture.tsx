"use client";

import { useState } from "react";
import { ClipboardPaste, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { parsePastedLead, type PastedLead } from "@/lib/crm/agent-core";

/**
 * Чатаас сэжим үүсгэх (R18): Messenger, чатаас хуулсан текстийг наахад утас,
 * и-мэйл, нэрийг таньж маягтыг урьдчилан бөглөнө. Текст серверт хадгалагдахгүй —
 * зөвхөн агентын баталгаажуулсан талбарууд маягтаар илгээгдэнэ.
 */
export function QuickCapture({ onParsed }: { onParsed: (p: PastedLead) => void }) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function apply(value: string) {
    const p = parsePastedLead(value);
    onParsed(p);
    const found = [p.phone ? "утас" : null, p.email ? "и-мэйл" : null, p.firstName ? "нэр" : null].filter(Boolean);
    setHint(found.length ? `Танигдсан: ${found.join(", ")}. Шалгаад дутууг нөхнө үү.` : "Утас, нэр танигдсангүй — гараар бөглөнө үү.");
  }

  async function pasteFromClipboard() {
    try {
      const v = await navigator.clipboard.readText();
      setText(v);
      apply(v);
    } catch {
      setHint("Санах ойноос уншиж чадсангүй — доорх талбарт наана уу.");
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">Чатаас наах</span>
        <Button type="button" size="sm" variant="outline" onClick={() => void pasteFromClipboard()}>
          <ClipboardPaste className="size-4" /> Наах
        </Button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Messenger, чатын зурвасыг энд наана уу…"
        className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{hint}</span>
        <Button type="button" size="sm" variant="ghost" disabled={!text.trim()} onClick={() => apply(text)}>
          <Wand2 className="size-4" /> Таних
        </Button>
      </div>
    </div>
  );
}
