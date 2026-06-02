import { cn } from "@/lib/utils";

/** Аватар — зурагтай (src) бол фото, эс бөгөөс үсгэн товчлол. */
export function Avatar({
  initials,
  src,
  color = "#C2410C",
  size = "md",
  className,
}: {
  initials: string;
  src?: string | null;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = {
    sm: "size-7 text-[10px]",
    md: "size-10 text-xs",
    lg: "size-14 text-base",
  }[size];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={initials}
        className={cn("rounded-full object-cover", dims, className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid place-items-center rounded-full font-bold text-white",
        dims,
        className
      )}
      style={{ background: color }}
    >
      {initials}
    </div>
  );
}
