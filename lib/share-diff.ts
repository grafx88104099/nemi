/**
 * Зар хуваалцлын diff — одоо хуваалцсан агентууд (current) болон
 * хэрэглэгчийн сонгосон (desired) хооронд НЭМЭХ / УСТГАХ жагсаалтыг гаргана.
 * Зөвхөн allowed (өөрийн оффисын идэвхтэй) агентуудыг зөвшөөрнө —
 * server action-д аюулгүй болгож шүүнэ. Цэвэр функц тул тестлэхэд хялбар.
 */
export function diffShares(
  current: string[],
  desired: string[],
  allowed: string[]
): { toAdd: string[]; toRemove: string[] } {
  const allowedSet = new Set(allowed);
  const currentSet = new Set(current);
  // desired-ийг allowed-оор шүүж, давхардлыг арилгана
  const desiredSet = new Set(desired.filter((id) => allowedSet.has(id)));

  const toAdd = [...desiredSet].filter((id) => !currentSet.has(id));
  // Зөвхөн allowed мужид байгаа агентын хуваалцлыг л устгана —
  // бусад оффисын/хуучирсан мөрийг санамсаргүй устгахаас сэргийлнэ.
  const toRemove = [...currentSet].filter(
    (id) => allowedSet.has(id) && !desiredSet.has(id)
  );

  return { toAdd, toRemove };
}
