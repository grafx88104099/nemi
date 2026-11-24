import { cn } from "@/lib/utils";

/**
 * Саарал «автомат» шошго — утга автоматаар (наасан текст, зар, төсөл, анхдагч) бөглөгдсөн, агент
 * баталгаажуулаагүй (crm2_properties.unconfirmed). Сервер ба клиент бүрэлдэхүүнд хоёуланд нь.
 */
export function AutoTag({ className, title = "Автоматаар бөглөсөн — шалгаад баталгаажуулна уу" }: { className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line",
        className
      )}
    >
      автомат
    </span>
  );
}
