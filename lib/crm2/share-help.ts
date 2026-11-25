/**
 * Агентын тохиргооны «Шуурхай бүртгэл» мөрийн тайлбар. Web Share Target («Хуваалцах» → Nemi CRM)
 * зөвхөн Android-д суулгасан апп-д ажилладаг (app/manifest.ts); шуурхай бүртгэл хаалттай үед
 * хуваалцсан зар бүрэн форм дээр нээгдэж, мэдээллийг автоматаар бөглөхгүй (StaffFormScreen sharedNotice).
 */

export type SharePlatform = "android" | "ios" | "other";

export function sharePlatform(userAgent: string | null | undefined): SharePlatform {
  const ua = userAgent ?? "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "other";
}

export function quickAddSettingText(quick: boolean, platform: SharePlatform): string {
  if (quick) return "Танд нээлттэй — «+ Хөрөнгө» нэг дэлгэцээр бүртгэнэ. «Бүрэн форм» үргэлж нэг товшилтын зайтай.";
  if (platform === "android") {
    return "Бүрэн формоор бүртгэнэ. Суулгасан аппын «Хуваалцах»-аар ирсэн зар бүрэн форм дээр нээгдэх ч мэдээллийг автоматаар бөглөхгүй — гараар оруулна.";
  }
  if (platform === "ios") {
    return "Бүрэн формоор бүртгэнэ. iPhone-оос зарыг «Хуваалцах»-аар CRM руу илгээх боломжгүй — зарын текстээ хуулж, формд буулгана уу.";
  }
  return "Бүрэн формоор бүртгэнэ.";
}
