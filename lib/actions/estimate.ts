"use server";

import { createClient } from "@/lib/supabase/server";

/** Зах зээлийн дундаж м² үнэд тулгуурлан гэрийн үнэ тооцоолно. */
export async function estimateHome(input: {
  district: string;
  type: string;
  area: number;
}): Promise<{ estimate: number; avgPerM2: number; sample: number } | { error: string }> {
  if (!input.area || input.area <= 0) return { error: "Талбай оруулна уу." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select("price_per_m2")
    .eq("district", input.district)
    .eq("type", input.type)
    .eq("status", "active")
    .not("price_per_m2", "is", null);

  const vals = (data ?? []).map((r) => r.price_per_m2 as number).filter(Boolean);
  if (vals.length === 0) return { error: "Энэ дүүрэг/төрөлд харьцуулах дата хүрэлцэхгүй байна." };

  const avgPerM2 = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  return { estimate: Math.round(avgPerM2 * input.area), avgPerM2, sample: vals.length };
}
