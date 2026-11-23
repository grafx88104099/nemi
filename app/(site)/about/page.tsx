import { getPlatformStats } from "@/lib/platform-stats";
import { aboutStatItems } from "@/lib/platform-stats-core";

export default async function AboutPage() {
  // БОДИТ тоо (footer, ProofStrip-тэй ижил босго). Алдаа эсвэл бүгд босгоос доош → мөр нуугдана.
  const items = aboutStatItems(await getPlatformStats().catch(() => null));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-ink">Нэми-ийн тухай</h1>
      <div className="mt-6 space-y-4 text-muted">
        <p>
          Нэми бол Монголын үл хөдлөх хөрөнгийн зах зээлийг ил тод, баталгаатай
          болгох зорилготой платформ. Бид худалдан авагч, агент, оффисуудыг нэг
          дороос холбож, AI технологиор зөв шийдвэр гаргахад туслана.
        </p>
        <p>
          Зар бүр баталгаажуулалт дамждаг, агент бүр үнэлгээтэй, үнэ бүр ил тод.
          Манай зорилго — Монголд гэр худалдан авах, зарах үйл явцыг хамгийн
          найдвартай туршлага болгох.
        </p>
        {items.length > 0 ? (
          <ul className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3">
            {items.map((it) => (
              <li key={it.label} className="rounded-2xl bg-surface-2 p-4 text-center">
                <div className="text-2xl font-extrabold text-ink tabular-nums">{it.n}</div>
                <div className="text-sm text-muted">{it.label}</div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
