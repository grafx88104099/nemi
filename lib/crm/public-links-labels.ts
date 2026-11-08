/**
 * Холбоос, QR-ын төлөвийн шошго — клиент бүрэлдэхүүнд (node:crypto-гүй).
 */

export type LinkState = "active" | "expired" | "revoked";
export type OpenHouseState = "upcoming" | "open" | "closed" | "revoked";

export const LINK_STATE_LABEL: Record<LinkState, { label: string; tone: "green" | "neutral" | "rose" }> = {
  active: { label: "Идэвхтэй", tone: "green" },
  expired: { label: "Хугацаа дууссан", tone: "neutral" },
  revoked: { label: "Цуцалсан", tone: "rose" },
};

export const OPEN_HOUSE_STATE_LABEL: Record<OpenHouseState, { label: string; tone: "green" | "neutral" | "rose" | "amber" }> = {
  upcoming: { label: "Удахгүй", tone: "amber" },
  open: { label: "Бүртгэл нээлттэй", tone: "green" },
  closed: { label: "Хаагдсан", tone: "neutral" },
  revoked: { label: "Цуцалсан", tone: "rose" },
};
