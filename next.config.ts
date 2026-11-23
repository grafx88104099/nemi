import type { NextConfig } from "next";

import { CRM_REDIRECTS } from "./lib/crm-redirects";

// Next-ийн анхдагч HTML_LIMITED_BOT_UA_RE-ийн эх (үгчлэн хуулсан):
// node_modules/next/dist/shared/lib/router/utils/html-bots.js.
// htmlLimitedBots тохируулбал анхдагч жагсаалтыг БҮРЭН СОЛЬДОГ тул хуулж аваад
// «Viber»-ийг нэмэв (Viber-ийн preview metadata-г <head>-ээс уншдаг гэж үзсэн —
// бодит User-Agent-ийг Vercel лог дээр шалгах шаардлагатай).
// Next шинэчлэх бүрд энэ жагсаалтыг html-bots.js-тэй ДАХИН тулгана уу.
// Googlebot-ийг НЭМЭХГҮЙ: JS ажиллуулдаг DOM bot (is-bot.js) тул streaming metadata-г уншдаг.
const NEXT_DEFAULT_HTML_LIMITED_BOTS =
  "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight";

const nextConfig: NextConfig = {
  // Шэйрийн preview bot-ууд metadata-г <head>-д хүлээж авна (streaming биш).
  htmlLimitedBots: new RegExp(`${NEXT_DEFAULT_HTML_LIMITED_BOTS}|Viber`, "i"),
  images: {
    // Зарын зургийн эх сурвалжууд (seed: unsplash, агент upload: Supabase storage)
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  // Хуучин CRM-ийн устгасан хуудас → шинэ CRM (lib/crm-redirects.ts).
  // /your-rental (үзлэг + хадгалсан) → «Миний Нэми» хаб (307).
  async redirects() {
    return [...CRM_REDIRECTS, { source: "/your-rental", destination: "/me", permanent: false }];
  },
  // CRM PWA: service worker-ийг кэшлэхгүй (шинэ хувилбар шууд үйлчилнэ), зөвхөн өөрийн домэйны скрипт.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
