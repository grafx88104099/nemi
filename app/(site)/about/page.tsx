export default function AboutPage() {
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
        <div className="grid grid-cols-3 gap-4 pt-4">
          {[["12,480+", "Идэвхтэй зар"], ["320+", "Баталгаажсан агент"], ["28", "Хамтрагч оффис"]].map(([n, l]) => (
            <div key={l} className="rounded-2xl bg-surface-2 p-4 text-center">
              <div className="text-2xl font-extrabold text-brand-600">{n}</div>
              <div className="text-sm text-muted">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
