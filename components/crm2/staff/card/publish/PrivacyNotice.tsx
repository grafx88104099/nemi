import { Check, Lock, Stamp } from "lucide-react";

/**
 * Нийтэд юу гарах, юу хэзээ ч гарахгүйг тодорхой харуулна. Жагсаалтыг
 * crm2_listing_payload() (нийтэд гарах цорын ганц эх сурвалж) -тай тааруулж
 * бичсэн — DB талд талбар нэмэгдвэл энэ текстийг хамт шинэчилнэ.
 */
export function PrivacyNotice({ watermarkLabel }: { watermarkLabel?: string | null }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
          <Check className="size-3.5 shrink-0" aria-hidden /> Нийтэд гарах
        </p>
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          <li>Зарын гарчиг, танилцуулга (та өөрөө бичнэ)</li>
          <li>Үнэ, төгрөгөөр</li>
          <li>Дүүрэг, ерөнхий байршил, газрын зураг дээрх цэг</li>
          <li>Өрөө, талбай, давхар, ашиглалтад орсон он</li>
          <li>Онцлог, тохижилт</li>
          <li>Тамга дарагдсан зураг</li>
        </ul>
      </div>
      <div>
        <p className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
          <Lock className="size-3.5 shrink-0" aria-hidden /> Хэзээ ч гарахгүй
        </p>
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          <li>Эзний нэр, утас, эзний тэмдэглэл</li>
          <li>Үзүүлэх заавар, хаягийн дэлгэрэнгүй</li>
          <li>Дотоод тэмдэглэл, талбарын эх бичвэр</li>
          <li>Хөрөнгийн код, үүрэгт агентууд</li>
          <li>Зуучлалын гэрээний огноо, баталгаажуулалтын мэдээлэл</li>
        </ul>
      </div>
      <p className="flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
        <Stamp className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0">
          {watermarkLabel
            ? `Зураг бүр «${watermarkLabel}»-ийн тамгатайгаар зард орно — тамгагүй эх зураг нийтэд гарахгүй.`
            : "Зураг бүр оффисын тамгатайгаар зард орно — тамгагүй эх зураг нийтэд гарахгүй."}
        </span>
      </p>
    </div>
  );
}
