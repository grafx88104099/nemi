/**
 * `?next=` параметрийг аюулгүй болгох — зөвхөн өгөгдсөн prefix-тэй дотоод
 * зам зөвшөөрнө (open-redirect, login-loop-оос сэргийлнэ).
 */
export function safeNext(
  next: string | undefined,
  prefix: string,
  fallback: string
): string {
  if (
    next &&
    next.startsWith(prefix) &&
    !next.startsWith("//") &&
    next !== `${prefix}/login`
  ) {
    return next;
  }
  return fallback;
}
