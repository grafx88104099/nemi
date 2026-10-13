/**
 * Төлбөрийн хоцролтын шатлалт хяналт (F-535–539) — цэвэр функц, DB-гүй.
 *
 * Шатлал settings 'arrears_ladder'-аас: {steps:[{step, days, role}]} —
 * days = grace хугацаа ӨНГӨРСНИЙ дараах хоцролтын хоногийн босго (F-535/603:
 * босго grace-тэй автомат уялдана — grace өөрчлөгдөхөд шатлал дагана).
 *
 * Cron (Д-15/16 — U8 crm-daily) энэ логикоор аль шатанд байгааг тодорхойлж,
 * crm_arrears_escalations-д бүртгэж (F-536), даалгавар/мэдэгдэл үүсгэнэ.
 */

import type { CrmRole } from "@/lib/constants-crm";

export type ArrearsLadderStep = {
  step: number;
  /** Grace дууссанаас хойших хоцролтын хоногийн босго (≥). */
  days: number;
  /** Шатны хариуцагч дүр (F-535). */
  role: CrmRole;
};

export type ArrearsLadder = { steps: ArrearsLadderStep[] };

function parseIso(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`arrears: огноо буруу — "${iso}"`);
  return d;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** today − dueOn (хоногоор; ирээдүйд сөрөг). */
export function daysPastDue(dueOn: string, today: string): number {
  return Math.round((parseIso(today).getTime() - parseIso(dueOn).getTime()) / DAY_MS);
}

/** Grace хугацааг хассан бодит хоцролтын хоног (F-603). */
export function effectiveOverdueDays(dueOn: string, graceDays: number, today: string): number {
  return daysPastDue(dueOn, today) - Math.max(0, graceDays);
}

/**
 * F-535/538: одоогийн байвал зохих шатыг тодорхойлно.
 *  • overdue < эхний босго → null (шатлалд ороогүй);
 *  • давтагдсан хоцролттой (priorLateCount ≥ repeatThreshold) бол нэг шат
 *    АЛГАСАЖ дээшилнэ (F-538 — дээд шатнаас хэтрэхгүй).
 */
export function arrearsStepFor(input: {
  dueOn: string;
  graceDays: number;
  today: string;
  ladder: ArrearsLadder;
  /** Энэ гэрээний өмнөх хоцролттой нэхэмжлэхийн тоо (F-538). */
  priorLateCount?: number;
  /** «Давтагдсан» гэж үзэх босго (тохиргоо; default 2). */
  repeatThreshold?: number;
}): ArrearsLadderStep | null {
  const steps = [...(input.ladder?.steps ?? [])].sort((a, b) => a.days - b.days);
  if (steps.length === 0) return null;
  const overdue = effectiveOverdueDays(input.dueOn, input.graceDays, input.today);
  let current: ArrearsLadderStep | null = null;
  for (const s of steps) {
    if (overdue >= s.days) current = s;
  }
  if (!current) return null;

  const repeatThreshold = input.repeatThreshold ?? 2;
  if ((input.priorLateCount ?? 0) >= repeatThreshold) {
    const idx = steps.findIndex((s) => s.step === current!.step);
    const bumped = steps[Math.min(idx + 1, steps.length - 1)];
    return bumped;
  }
  return current;
}

/**
 * F-536: аль шатнууд шинээр бүртгэгдэх ёстойг буцаана — одоо байвал зохих шат
 * хүртэлх, урьд бүртгэгдээгүй бүх шат (алгассан ч түүх нь бүрэн үлдэнэ).
 */
export function missingEscalationSteps(
  targetStep: ArrearsLadderStep | null,
  recordedSteps: number[],
  ladder: ArrearsLadder
): ArrearsLadderStep[] {
  if (!targetStep) return [];
  const steps = [...(ladder.steps ?? [])].sort((a, b) => a.step - b.step);
  return steps.filter((s) => s.step <= targetStep.step && !recordedSteps.includes(s.step));
}

/** Д-15: төлөх өдрөөс тохиргоот хоногийн өмнөх урьдчилсан сануулгын өдөр мөн үү. */
export function isPreReminderDue(dueOn: string, today: string, beforeDays = 3): boolean {
  const diff = -daysPastDue(dueOn, today); // due хүртэл үлдсэн хоног
  return diff > 0 && diff <= beforeDays;
}

/** F-524: насжилтын бүлэг (1–3 / 4–7 / 8+ хоног) — R-09 ArrearsAging-тай ижил зааг. */
export type AgingBucket = "current" | "d1_3" | "d4_7" | "d8_plus";

export function agingBucket(dueOn: string, today: string): AgingBucket {
  const overdue = daysPastDue(dueOn, today);
  if (overdue <= 0) return "current";
  if (overdue <= 3) return "d1_3";
  if (overdue <= 7) return "d4_7";
  return "d8_plus";
}

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  current: "Хугацаа болоогүй",
  d1_3: "1–3 хоног",
  d4_7: "4–7 хоног",
  d8_plus: "8+ хоног",
};
