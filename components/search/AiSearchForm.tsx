import { aiSearchAction } from "@/lib/actions/search";
import { filtersToParams, type ListingFilters } from "@/lib/listing-filters";
import { PendingSubmit } from "@/components/search/PendingSubmit";

/**
 * Сонголттой «AI-аар ойлгуулах» маягт (R08c). Server Component — JS-гүй ч ажиллана
 * (server action-ий progressive enhancement). Хэрэглэгч өөрөө дарсан үед л бичвэр
 * Anthropic руу очно. Дуудагч aiSearchEnabled() && shouldTryAi(q)-г шалгана.
 */
export function AiSearchForm({ f }: { f: ListingFilters }) {
  const params = [...filtersToParams(f, { withSort: true }).entries()];
  return (
    <form action={aiSearchAction} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="base" value="/listings" />
      {params.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <PendingSubmit idle="AI-аар ойлгуулах" pending="Ухаалаг хайлт…" />
      <span className="text-xs text-muted">Хайлтын бичвэр Anthropic (Claude) руу илгээгдэнэ.</span>
    </form>
  );
}
