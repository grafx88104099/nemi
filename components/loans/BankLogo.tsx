"use client";

import { useState } from "react";

/**
 * Банкны лого — албан ёсны домэйнээс бодит логог татаж харуулна.
 * Ачаалагдахгүй (offline/блок) бол брэндийн өнгөт монограмм руу шилжинэ.
 */
export function BankLogo({
  domain,
  short,
  color,
  size = 44,
  className = "",
}: {
  domain: string;
  short: string;
  color: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !domain) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${className}`}
        style={{ background: color, width: size, height: size }}
      >
        {short.slice(0, 2)}
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
        alt={domain}
        width={size - 12}
        height={size - 12}
        loading="lazy"
        onError={() => setFailed(true)}
        className="object-contain"
      />
    </div>
  );
}
