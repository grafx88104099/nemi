"use client"; // Алдааны хил Client Component байх ёстой.

import SiteError from "./(site)/error";

/**
 * Өөрийн error.tsx-гүй бүх сегментийн (агент/оффис/админы панель гэх мэт) сүүлчийн
 * хил — Next-ийн англи алдааны хуудасны оронд монгол бичвэр, «Дахин оролдох».
 * Root layout-ын доор зурагдана; root layout өөрөө унавал app/global-error.tsx.
 */
export default function RootError(props: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  // Нийтийн сайтын алдааг (site)/error.tsx барина — энд зөвхөн панелиуд (CRM-ийн өнгө төрх хэвээр).
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteError {...props} />
    </div>
  );
}
