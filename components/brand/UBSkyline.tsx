import { cn } from "@/lib/utils";

/**
 * <UBSkyline> — «Нарлаг хот» брэндийн өөрийн бүтээл (docs/brand/LICENSES.md).
 * Улаанбаатарын үүр: цөцгий тэнгэр, нам нар, Богд Хан уулын өргөн нам нуруу
 * (оргилгүй), хойд энгэрийн цэгцтэй байшингууд, 5/9/12 давхар панел байрны
 * эгнээ (нэг <pattern> цонх + тагт), асаалттай 8 цонх, Туул голын шугам.
 *
 * variant="strip" — утасны hero-ийн 56px тууз (viewBox 360×56, ~1:1 масштаб):
 * зөвхөн нуруу + цөөн том байр (жинхэнэ цонхны мөр), 4 асаалттай цонх (4×3px),
 * байшин/нар/голгүй. Бүтэн зураг 1440 өргөнөөр 360px-д 25% болж нарийн ширийн
 * нь алга болдог тул ТУСДАА зурсан.
 *
 * Дүрэм: ≤300 элемент, gzip ≤8 KB, filter/blur/<image>/<script> ХОРИОТОЙ
 * (lib/__tests__/skyline.test.ts). Зайсан, Соёмбо, гэр, морь, хотын сүлд, шилэн
 * цамхаг хэрэглэхгүй. Нуруу текст, үнийн ард орохгүй, логод орохгүй.
 * Inline зөвхөн hero-д (strip md-ээс доош, full md+; нөгөө нь display:none) —
 * бусад газар <img src="/brand/skyline-dawn.svg"> (colors="hex" бүтэн хувилбарын
 * статик хуулбар).
 *
 * colors="vars" → .ub-skyline CSS хувьсагч (app/globals.css); "hex" → шууд өнгө.
 */

const HEX = {
  "sky-top": "#fbf7f1",
  "sky-bottom": "#fde4cc",
  sun: "#ffd2a6",
  "ridge-back": "#e8a87c",
  ridge: "#c2410c",
  block: "#0f1b2d",
  "block-back": "#2a3a55",
  window: "#3a4d6e", // 2.03:1 block дээр (өмнө #24344f = 1.38:1 — харагддаггүй байсан)
  balcony: "#33456a", // 1.81:1 block дээр — тагтны хэмнэл
  "window-back": "#4a5f84", // 1.78:1 block-back дээр — арын эгнээний сийрэг цонх
  lit: "#ffa52e",
  hill: "#f1dcc4",
  river: "#7fb3c8",
} as const;

type Key = keyof typeof HEX;

const ROOF_COLORS = ["#2f7d6d", "#3b6ea8", "#c2410c", "#e0b03b", "#6b8f3a"] as const;

/** Хойд энгэрийн байшин: [x, y] = 10×6 хананы зүүн дээд булан. */
const HOUSES: readonly [number, number][] = [
  [6, 186],
  [22, 200],
  [8, 214],
  [62, 174],
  [100, 171],
  [140, 169],
  [184, 169],
  [1362, 166],
  [1392, 160],
  [1420, 166],
  [1374, 184],
  [1404, 180],
  [1428, 196],
  [1380, 206],
];

/** Арын эгнээ: [x, w, h] (суурь y=240). */
const BACK: readonly [number, number, number][] = [
  [250, 56, 112],
  [395, 50, 104],
  [450, 64, 80],
  [575, 70, 96],
  [700, 52, 120],
  [915, 44, 110],
  [962, 46, 92],
  [1060, 60, 100],
  [1225, 44, 120],
];

/**
 * Урд эгнээ: [x, w, h], суурь y=240. Давхар бүр 10 нэгж (pattern-ийн өндөр):
 * h = давхар×10 + 6 → 5 давхар (56), 9 давхар (96), 12 давхар (126).
 */
const FRONT: readonly [number, number, number][] = [
  [40, 180, 56],
  [520, 210, 56],
  [1010, 170, 56],
  [230, 90, 96],
  [760, 80, 96],
  [1190, 100, 96],
  [330, 56, 126],
  [850, 60, 126],
  [1300, 52, 126],
];

/** Асаалттай цонх — pattern-ийн цонхны сүлжээтэй (x = 14k+4, y = 10m+3) давхцана. */
const LIT: readonly [number, number][] = [
  [74, 213],
  [270, 173],
  [354, 143],
  [676, 203],
  [802, 183],
  [872, 133],
  [1096, 223],
  [1320, 153],
];

/* ── strip (360×56) ─────────────────────────────────────────────────── */

/** Арын эгнээ: [x, w, h], суурь y=56. */
const S_BACK: readonly [number, number, number][] = [
  [44, 24, 36],
  [146, 22, 38],
  [242, 20, 40],
  [326, 24, 36],
];

/** Урд эгнээ: [x, w, h], суурь y=56. Давхар 7 нэгж: 4 давхар (28), 5 (35), 6 (42). */
const S_FRONT: readonly [number, number, number][] = [
  [6, 58, 28],
  [70, 28, 42],
  [104, 60, 28],
  [170, 30, 42],
  [206, 52, 35],
  [264, 28, 42],
  [298, 56, 28],
];

/** Асаалттай цонх (4×3) — strip pattern-ийн сүлжээ (x = 8k+2, y = 7m+2). */
const S_LIT: readonly [number, number][] = [
  [26, 44],
  [82, 23],
  [234, 37],
  [274, 30],
];

export function UBSkyline({
  className,
  colors = "vars",
  variant = "full",
}: {
  className?: string;
  colors?: "vars" | "hex";
  variant?: "full" | "strip";
}) {
  const hex = colors === "hex";
  const c = (k: Key) => (hex ? HEX[k] : `var(--ub-${k})`);
  // vars горимд style (CSS) — presentation attribute-д var() найдвартай биш хөтөч байж болно.
  const fill = (k: Key) => (hex ? { fill: HEX[k] } : { style: { fill: c(k) } });
  const stroke = (k: Key) => (hex ? { stroke: HEX[k] } : { style: { stroke: c(k) } });
  const stop = (k: Key) => (hex ? { stopColor: HEX[k] } : { style: { stopColor: c(k) } });

  const root = {
    xmlns: "http://www.w3.org/2000/svg",
    preserveAspectRatio: "xMidYMax slice",
    "aria-hidden": true,
    focusable: false,
    className: cn("ub-skyline", className),
  } as const;

  if (variant === "strip") {
    return (
      <svg {...root} viewBox="0 0 360 56">
        <defs>
          <linearGradient id="ubsky-s" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" {...stop("sky-top")} />
            <stop offset="1" {...stop("sky-bottom")} />
          </linearGradient>
          <pattern id="ubw-s" width="8" height="7" patternUnits="userSpaceOnUse">
            <rect x="2" y="2" width="4" height="3" {...fill("window")} />
            <path d="M0 6.5h8" strokeWidth="1" {...stroke("balcony")} />
          </pattern>
          <pattern id="ubwb-s" width="12" height="7" patternUnits="userSpaceOnUse">
            <rect x="4" y="2" width="3" height="3" {...fill("window-back")} />
          </pattern>
        </defs>
        <rect width="360" height="56" fill="url(#ubsky-s)" />
        <path d="M0 26 C50 18 110 12 170 16 S290 14 360 22 V56 H0Z" {...fill("ridge-back")} />
        <path d="M0 36 C60 30 120 24 190 27 S300 28 360 32 V56 H0Z" {...fill("ridge")} />
        {S_BACK.map(([x, w, h]) => (
          <g key={`b${x}`}>
            <rect x={x} y={56 - h} width={w} height={h} {...fill("block-back")} />
            <rect x={x + 2} y={58 - h} width={w - 4} height={h - 2} fill="url(#ubwb-s)" />
          </g>
        ))}
        {S_FRONT.map(([x, w, h]) => (
          <g key={`f${x}`}>
            <rect x={x} y={56 - h} width={w} height={h} {...fill("block")} />
            <rect x={x + 3} y={58 - h} width={w - 6} height={h - 2} fill="url(#ubw-s)" />
          </g>
        ))}
        {S_LIT.map(([x, y]) => (
          <rect key={`l${x}`} className="ub-lit" x={x} y={y} width="4" height="3" {...fill("lit")} />
        ))}
      </svg>
    );
  }

  return (
    <svg {...root} viewBox="0 0 1440 240">
      <defs>
        <linearGradient id="ubsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" {...stop("sky-top")} />
          <stop offset="1" {...stop("sky-bottom")} />
        </linearGradient>
        {/* Давхар = 10 нэгж: цонх 6×4 (y=3), тагтны хавтан y=9.5. */}
        <pattern id="ubw" width="14" height="10" patternUnits="userSpaceOnUse">
          <rect x="4" y="3" width="6" height="4" {...fill("window")} />
          <path d="M0 9.5h14" strokeWidth="1" {...stroke("balcony")} />
        </pattern>
        {/* Арын эгнээ — сийрэг цонх (нэг баганыг алгасна). */}
        <pattern id="ubwb" width="28" height="10" patternUnits="userSpaceOnUse">
          <rect x="4" y="3" width="6" height="4" {...fill("window-back")} />
        </pattern>
      </defs>
      {/* (1) тэнгэр, (2) нар */}
      <rect width="1440" height="240" fill="url(#ubsky)" />
      <circle cx="1080" cy="122" r="30" {...fill("sun")} />
      {/* (3) арын нуруу, (4) Богд Хан уулын урд нуруу — өргөн, нам, оргилгүй */}
      <path d="M0 150 C160 120 260 110 380 118 S620 92 760 100 S1000 112 1140 104 S1340 118 1440 126 V240 H0Z" {...fill("ridge-back")} />
      <path d="M0 182 C140 168 240 150 360 154 S560 128 700 134 S940 124 1080 140 S1320 158 1440 164 V240 H0Z" {...fill("ridge")} />
      {/* (5) хойд энгэр ба цэгцтэй байшингууд */}
      <path d="M0 176 C60 164 150 158 234 166 V240 H0Z" {...fill("hill")} />
      <path d="M1226 152 C1300 146 1380 150 1440 158 V240 H1226Z" {...fill("hill")} />
      {HOUSES.map(([x, y], i) => (
        <g key={`h${i}`}>
          <rect x={x} y={y} width="10" height="6" {...fill("sky-top")} />
          <path d={`M${x - 1} ${y}L${x + 5} ${y - 5}L${x + 11} ${y}Z`} fill={ROOF_COLORS[i % ROOF_COLORS.length]} />
        </g>
      ))}
      {/* (6) арын эгнээ + сийрэг цонх */}
      {BACK.map(([x, w, h]) => (
        <g key={`b${x}`}>
          <rect x={x} y={240 - h} width={w} height={h} {...fill("block-back")} />
          <rect x={x + 4} y={244 - h} width={w - 8} height={h - 4} fill="url(#ubwb)" />
        </g>
      ))}
      {/* (7) урд эгнээ + цонх/тагтны pattern */}
      {FRONT.map(([x, w, h]) => (
        <g key={`f${x}`}>
          <rect x={x} y={240 - h} width={w} height={h} {...fill("block")} />
          <rect x={x + 4} y={246 - h} width={w - 8} height={h - 6} fill="url(#ubw)" />
        </g>
      ))}
      {LIT.map(([x, y]) => (
        <rect key={`l${x}`} className="ub-lit" x={x} y={y} width="6" height="4" {...fill("lit")} />
      ))}
      {/* (8) Туул гол */}
      <path d="M0 232 C300 222 600 238 900 228 S1300 230 1440 224" fill="none" strokeWidth="3" {...stroke("river")} />
    </svg>
  );
}
