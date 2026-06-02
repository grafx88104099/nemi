import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind класс нэгтгэгч (conditional + давхцал шийдэх). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
