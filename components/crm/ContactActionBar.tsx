"use client";

import { useState } from "react";
import { Copy, MessageSquareText, Phone, PenLine, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Нэг товшилтын холболтын мөр (UX-4, R17): Залгах (tel:), Мессеж (sms:),
 * дугаар хуулах, бэлэн зурвасын загварыг хуулж Messenger/чатад наах,
 * «Үр дүн бүртгэх». Утсан дээр доод хэсэгт наалттай, ширээн дээр мөр.
 * Автомат SMS илгээхгүй — агент өөрөө илгээнэ.
 */

export type MessageTemplate = { id: string; label: string; text: string };

export function defaultTemplates(name: string, agentName?: string | null): MessageTemplate[] {
  const hi = `Сайн байна уу${name ? `, ${name}` : ""}.`;
  const me = agentName ? ` Би ${agentName} байна.` : "";
  return [
    {
      id: "intro",
      label: "Танилцуулга",
      text: `${hi}${me} Таны үл хөдлөхийн хүсэлтийг хүлээж авлаа. Тохиромжтой цагаа хэлбэл холбогдож хэрэгцээг тань тодруулъя.`,
    },
    {
      id: "no_answer",
      label: "Холбогдож чадсангүй",
      text: `${hi}${me} Тантай утсаар холбогдох гэсэн боловч холбогдсонгүй. Танд ямар цаг тохиромжтой вэ?`,
    },
    {
      id: "options",
      label: "Сонголт илгээх",
      text: `${hi} Таны шаардлагад тохирох хэдэн сонголтыг бэлдлээ. Үзээд аль нь сонирхолтой байгааг хэлээрэй.`,
    },
    {
      id: "showing",
      label: "Үзлэг баталгаажуулах",
      text: `${hi} Үзлэгийн цагаа баталгаажуулъя. Тохирсон цагтаа уулзах газарт хүлээж байя.`,
    },
    {
      id: "follow_up",
      label: "Эргэн холбогдох",
      text: `${hi} Өмнө ярилцсаны дагуу эргэн холбогдож байна. Шийдвэрт тань нөлөөлж буй шинэ зүйл гарсан уу?`,
    },
  ];
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

async function copyText(text: string, okMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMessage);
  } catch {
    toast.error("Хуулж чадсангүй — гараар хуулна уу.");
  }
}

export function ContactActionBar({
  phone,
  email,
  name,
  agentName,
  onLog,
  logLabel = "Үр дүн бүртгэх",
  onCall,
  templates,
  className,
}: {
  phone: string | null;
  email?: string | null;
  name: string;
  agentName?: string | null;
  /** «Үр дүн бүртгэх» — түргэн бүртгэлийн хуудсыг нээнэ. */
  onLog?: () => void;
  logLabel?: string;
  /** Залгах товч дарагдахад (буцаж ирэхэд бүртгэлийн хуудас нээх тэмдэг). */
  onCall?: () => void;
  templates?: MessageTemplate[];
  className?: string;
}) {
  const [tplOpen, setTplOpen] = useState(false);
  const list = templates ?? defaultTemplates(name.split(" ").slice(-1)[0] ?? name, agentName);

  const buttons = (
    <>
      {phone ? (
        <a
          href={telHref(phone)}
          onClick={() => onCall?.()}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 md:h-9 md:flex-none"
        >
          <Phone className="size-4" /> Залгах
        </a>
      ) : null}
      {phone ? (
        <a
          href={`sms:${phone.replace(/[^\d+]/g, "")}`}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 md:h-9 md:flex-none"
        >
          <MessageSquareText className="size-4" /> Мессеж
        </a>
      ) : null}
      {!phone && email ? (
        <a
          href={`mailto:${email}`}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 md:h-9 md:flex-none"
        >
          <Mail className="size-4" /> И-мэйл
        </a>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="h-11 flex-1 md:h-9 md:flex-none"
        onClick={() => setTplOpen(true)}
        aria-label="Зурвасын загвар"
      >
        <Copy className="size-4" /> Загвар
      </Button>
      {onLog ? (
        <Button type="button" variant="secondary" className="h-11 flex-1 md:h-9 md:flex-none" onClick={onLog}>
          <PenLine className="size-4" /> {logLabel}
        </Button>
      ) : null}
    </>
  );

  return (
    <>
      {/* Ширээн дээр — мөр */}
      <div className={cn("hidden flex-wrap items-center gap-2 md:flex", className)}>{buttons}</div>
      {/* Утсан дээр — доод хэсэгт наалттай */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-surface/95 px-3 pt-2 backdrop-blur md:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {buttons}
      </div>
      <div className="h-16 md:hidden" aria-hidden />

      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="Зурвасын загвар">
        <div className="space-y-2">
          <p className="text-xs text-muted">Загварыг хуулаад Messenger, чат эсвэл мессежээр өөрөө илгээнэ үү.</p>
          {phone ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void copyText(phone, "Дугаар хуулагдлаа")}
            >
              <Copy className="size-4" /> Дугаар хуулах
            </Button>
          ) : null}
          <ul className="space-y-2">
            {list.map((t) => (
              <li key={t.id} className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{t.label}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void copyText(t.text, "Зурвас хуулагдлаа");
                      setTplOpen(false);
                    }}
                  >
                    <Copy className="size-4" /> Хуулах
                  </Button>
                </div>
                <p className="mt-1 text-sm text-muted">{t.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}
