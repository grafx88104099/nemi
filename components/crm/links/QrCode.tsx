import { encodeQr, qrSvgPath } from "@/lib/crm/qr";

/** QR кодыг SVG-ээр (хэвлэхэд тод). Гадны үйлчилгээ рүү холбоос илгээхгүй. */
export function QrCode({ text, size = 220, className }: { text: string; size?: number; className?: string }) {
  let path = "";
  let dim = 0;
  try {
    const q = encodeQr(text);
    path = qrSvgPath(q, 4);
    dim = q.size + 8;
  } catch {
    return <p className="text-sm text-danger">QR үүсгэж чадсангүй — холбоос хэт урт байна.</p>;
  }
  return (
    <svg
      role="img"
      aria-label="QR код"
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
