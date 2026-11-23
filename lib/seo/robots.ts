/**
 * robots.txt-ийн хаалттай замууд (app/robots.ts). Бодит route-ын модноос:
 * (agent)/agent/{(panel),login}, (office)/office/{(panel),login}, (admin)/admin,
 * app/auth/*, app/api/*, (site)/(auth)-ийн хувийн хуудсууд, /me хаб.
 *
 * Анхаар: «/agent» эсвэл «/office»-г дангаар нь бичвэл /agents, /offices,
 * /office-signup-ийг ч хаана (prefix таарна). Тиймээс «/agent/» + «/agent$»
 * хэлбэрээр бичнэ — Google, Bing «$» төгсгөлийг дэмждэг.
 * /_next/image нээлттэй байх ёстой (og:image түүгээр дамжина).
 */
export const PRIVATE_PATHS = [
  "/agent/",
  "/agent$",
  "/office/",
  "/office$",
  "/admin",
  "/api/",
  "/auth/",
  "/account",
  "/me$",
  "/messages",
  "/my-listings",
  "/my-team",
  "/favorites",
  "/saved-searches",
  "/recently-viewed",
  "/tours",
  "/your-rental",
  "/sell/new",
  "/sell/edit/",
  "/sell/request",
  "/office-signup",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

/** Google-ийн тааруулалтыг дуурайна: «$»-аар төгссөн дүрэм яг таарна, бусад нь prefix. Тестэд ашиглана. */
export function isBlocked(path: string, rules: readonly string[] = PRIVATE_PATHS): boolean {
  return rules.some((r) => (r.endsWith("$") ? path === r.slice(0, -1) : path.startsWith(r)));
}
