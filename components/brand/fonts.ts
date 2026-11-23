import { Manrope } from "next/font/google";

/**
 * Manrope 800 — ЗӨВХӨН нүүрний H1 ба proof strip-ийн тоонд (.font-display).
 * Энэ модулийг ЗӨВХӨН app/(site)/page.tsx болон components/home/ProofStrip.tsx
 * импортлоно → preload зөвхөн "/" дээр. manrope.variable-ийг hero <section> дээр
 * тавина; --font-display нь `@theme inline` тул элемент бүр дээр шийдэгдэнэ.
 */
export const manrope = Manrope({
  weight: "800",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  display: "swap",
  variable: "--font-manrope",
  adjustFontFallback: true,
});
