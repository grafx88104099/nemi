"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { normalizeNumberText } from "@/lib/number-input";

/**
 * Тоон оролт. Бичиж байхад нь хөндөхгүй, ФОКУС АЛДАХАД уншсанаа буцааж
 * харуулна: «81,47» → «81.47», «250,000,000» → «250000000».
 *
 * ЯАГААД: таслал нь мянгатын тусгаарлагч ч, бутархайн тэмдэг ч байж болох тул
 * системийн таамаглал буруу байвал хэрэглэгч ХАДГАЛАХААС ӨМНӨ анзаарч засна
 * (өмнө нь «81,47» чимээгүй 8147 болдог байв).
 */
export const NumberInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
    value: string;
    onValueChange: (value: string) => void;
  }
>(({ value, onValueChange, onBlur, inputMode = "decimal", ...props }, ref) => (
  <Input
    {...props}
    ref={ref}
    inputMode={inputMode}
    value={value}
    onChange={(e) => onValueChange(e.target.value)}
    onBlur={(e) => {
      const next = normalizeNumberText(value);
      if (next !== value) onValueChange(next);
      onBlur?.(e);
    }}
  />
));
NumberInput.displayName = "NumberInput";
