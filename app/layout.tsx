import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

import { ogBase, ROOT_OG_IMAGE, SITE_NAME, siteUrl } from "@/lib/seo/site";

const inter = Inter({
  variable: "--font-inter",
  // cyrillic-ext: Ө/Ү урьдчилан ачаалагдана. latin-ext НЭМЭХГҮЙ — ₮-г доорх tugrik хангана.
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  display: "swap",
});

/**
 * ₮ (U+20AE) — Inter variable-ийн ганц глифтэй subset (1.3 KB, wght 100–900,
 * `node scripts/gen-tugrik-font.mjs`). --font-sans-д Inter-ээс ӨМНӨ ордог тул үнэ
 * бүрийн «₮» Google Inter-ийн 85 KB latin-ext файлыг татуулахгүй. Fallback ЗОРИУДААР
 * үгүй: unicode-range-ээс гадуурх тэмдэгт шууд дараагийн Inter руу шилжинэ.
 */
const tugrik = localFont({
  src: "./fonts/inter-tugrik.woff",
  weight: "100 900",
  display: "swap",
  variable: "--font-tugrik",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+20AE" }],
});

/**
 * Root metadata. openGraph-д title/description ЗОРИУДААР тавихгүй — Next хуудас
 * бүрийн өөрийн title/description-ыг og:/twitter:-д өвлүүлнэ. alternates.canonical
 * энд тавихгүй (бүх хуудас "/"-г өвлөнө), title.template ч үгүй (хуудсууд «— Нэми»-г
 * өөрсдөө залгадаг). Статик layout тул env build үед уншигдана → өөрчилбөл redeploy.
 * FB_APP_ID / GOOGLE_SITE_VERIFICATION тохируулаагүй бол tag огт гарахгүй.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Нэми — Баталгаатай үл хөдлөхийн платформ",
  description:
    "Улаанбаатарын худалдах, түрээсийн үл хөдлөх хөрөнгийн баталгаатай зар, агент, оффисууд нэг дор.",
  applicationName: SITE_NAME,
  openGraph: { ...ogBase(), images: [ROOT_OG_IMAGE] },
  // ROOT_OG_IMAGE нь 1200×630 тул том карт.
  twitter: { card: "summary_large_image" },
  ...(process.env.FB_APP_ID ? { facebook: { appId: process.env.FB_APP_ID } } : {}),
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

/** Зөвхөн цайвар горим (themeColor/colorScheme нь metadata биш viewport-д). Сайтын themeColor — app/(site)/layout.tsx. */
export const viewport: Viewport = { colorScheme: "light" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn" className={`${inter.variable} ${tugrik.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
