/** Түрээсийн төсөв — орлогын 30% дүрэм (дээд хязгаар 40%). */
export function recommendedRent(income: number, debts = 0) {
  const disposable = Math.max(0, income - debts);
  return {
    recommended: Math.round(disposable * 0.3),
    max: Math.round(disposable * 0.4),
  };
}
