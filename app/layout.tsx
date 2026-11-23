import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { ogBase, ROOT_OG_IMAGE, SITE_NAME, siteUrl } from "@/lib/seo/site";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
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
    "Худалдан авагч, агент, оффисуудыг AI-аар нэгтгэсэн баталгаатай үл хөдлөхийн платформ.",
  applicationName: SITE_NAME,
  openGraph: { ...ogBase(), images: [ROOT_OG_IMAGE] },
  twitter: { card: "summary" },
  ...(process.env.FB_APP_ID ? { facebook: { appId: process.env.FB_APP_ID } } : {}),
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
