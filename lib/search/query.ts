/**
 * Хайлтын асуулга → listings.search_text-ийн LIKE хэв маяг. ЦЭВЭР, клиентэд аюулгүй.
 *
 * Дүрэм: үг бүр таарах ёстой (AND), үгийн аль ч бичлэг таарч болно (OR).
 * Латин үсгийн хоёрдмол утгыг (u → у|о, v → в|у, y → и|у, ts → ц|тс, sh → ш|сх,
 * c → ц|к) хувилбараар, зураастай үгийг («хан-уул») зайтай хэлбэрээр ч хайна.
 * «байна», «хайж», «дүүрэг», «хямд» зэрэг дүүргэгч үгс үр дүнг тэг болгохгүйн
 * тулд STOPWORDS-оор хасагдана.
 *
 * Нугалалтын гаралт зөвхөн [0-9а-я. ] тул хэв маягт % _ \ , ( ) " хэзээ ч орохгүй;
 * escapeLike ба pgrstQuote нь хамгаалалтын нэмэлт давхарга.
 */
import { LATIN_MAP, foldSearchText } from "@/lib/search/fold";

export const MAX_GROUPS = 6;
export const MAX_VARIANTS = 8;
export const MAX_PATTERN_LEN = 80;

/** LIKE-ийн % _ \ тэмдгийг үсэг болгоно («50%» гэж хайхад бүгдийг олохгүй). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

const STOPWORD_SOURCE = [
  "байна", "хайж", "хайна", "хайя", "авмаар", "хэрэгтэй", "зар", "зарууд", "ба", "болон",
  "эсвэл", "мөн", "маш", "сайхан", "гоё", "ойр", "дүүрэг", "дүүргийн", "дүүрэгт", "тай",
  "тэй", "той", "хямд", "хямдхан", "үнэтэй",
];

/** Хайлтад тооцохгүй үгс (нугалсан хэлбэрээр). */
export const STOPWORDS: ReadonlySet<string> = new Set(STOPWORD_SOURCE.map(foldSearchText));

/** Асуулгыг түүхий үгс болгоно (дээд тал нь `limit`). */
export function splitRawTokens(q: string, limit = 12): string[] {
  return q.split(/[\s,;/|()!?«»"“”]+/).filter(Boolean).slice(0, limit);
}

const WORD_HYPHEN = /\p{L}[-\u2010-\u2015\u2212]\p{L}/u;
const ANY_HYPHEN = /[-\u2010-\u2015\u2212]/g;

/** Латин бичлэгийн хоёрдмол хос/ганц үсэг → боломжит кирилл. */
/** fold.ts-ийн DIGRAPHS-ийн бүх хос энд байх ёстой (тестээр шалгана). */
export const LATIN_DIGRAPH_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  kh: ["х"],
  sh: ["ш", "сх"],
  ch: ["ч"],
  ts: ["ц", "тс"],
  zh: ["ж"],
  ya: ["я"],
  yo: ["е"],
  ye: ["е"],
  yu: ["ю"],
};
const LATIN_SINGLE_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  u: ["у", "о"],
  v: ["в", "у"],
  y: ["и", "у"],
  c: ["ц", "к"],
};
const MAX_RAW_CANDIDATES = 32;
/** Үүнээс олон хоёрдмол байрлалтай бол үлдсэнийг эхний сонголтоор авна (2^10 = 1024 хослол). */
const MAX_AMBIGUOUS_SLOTS = 10;

type Slot = { key: string; opts: readonly string[] };

function latinCandidates(raw: string): string[] {
  const s = raw.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!/[a-z]/.test(s)) return [];
  const slots: Slot[] = [];
  for (let i = 0; i < s.length; ) {
    const two = s.slice(i, i + 2);
    const d = LATIN_DIGRAPH_OPTIONS[two];
    if (d) {
      slots.push({ key: two, opts: d });
      i += 2;
      continue;
    }
    const ch = s[i];
    const single = LATIN_SINGLE_OPTIONS[ch];
    i += 1;
    if (single) {
      // Давхар үсэг («uu») нь урт эгшиг — уу/оо, холимог «уо» биш. Нугалалт давхар
      // үсгийг нэгтгэдэг тул нэг байрлал болгоно (хослолын тоо буурна).
      if (slots[slots.length - 1]?.key === ch) continue;
      slots.push({ key: ch, opts: single });
    } else if (/[a-z]/.test(ch)) slots.push({ key: ch, opts: [LATIN_MAP[ch] ?? ch] });
    else slots.push({ key: ch, opts: [ch] });
  }
  // Хоёрдмол байрлал бүрт 0/1 сонголт. Эрэмбэ: (1) нэг үсгийн бүх байрлалд ижил
  // сонголт (эгшиг зохицох ёс: «uguumur» → угумур | огомор) эхэндээ, (2) эхний
  // сонголтоос цөөн зөрсөн нь, (3) анхны дараалал. Ингэснээр MAX_VARIANTS-аар
  // таслахад зөв уншлага нэг талын хувилбаруудад шахагдаж алга болохгүй.
  const amb = slots.flatMap((sl, i) => (sl.opts.length > 1 ? [i] : [])).slice(0, MAX_AMBIGUOUS_SLOTS);
  const combos: { pick: number[]; mixed: number; dev: number; n: number }[] = [];
  for (let n = 0; n < 1 << amb.length; n++) {
    const pick = amb.map((_, b) => (n >> (amb.length - 1 - b)) & 1);
    const byKey = new Map<string, Set<number>>();
    amb.forEach((si, b) => {
      const set = byKey.get(slots[si].key) ?? new Set<number>();
      set.add(pick[b]);
      byKey.set(slots[si].key, set);
    });
    let mixed = 0;
    for (const v of byKey.values()) if (v.size > 1) mixed++;
    combos.push({ pick, mixed, dev: pick.reduce((a, x) => a + x, 0), n });
  }
  combos.sort((a, b) => a.mixed - b.mixed || a.dev - b.dev || a.n - b.n);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const { pick } of combos) {
    const choice = new Map(amb.map((si, b) => [si, pick[b]] as const));
    const folded = foldSearchText(slots.map((sl, i) => sl.opts[choice.get(i) ?? 0]).join(""));
    if (seen.has(folded)) continue;
    seen.add(folded);
    out.push(folded);
    if (out.length >= MAX_RAW_CANDIDATES) break;
  }
  return out;
}

/**
 * Нэг үгийн нугалсан хувилбарууд: [0] нь үргэлж foldSearchText(raw), дараа нь
 * зураасгүй (зайтай) хэлбэр, латин хоёрдмол үсгийн хувилбарууд. ≤ MAX_VARIANTS.
 */
export function tokenVariants(raw: string): string[] {
  const primary = foldSearchText(raw);
  if (!primary) return [];
  const extras: string[] = [];
  if (WORD_HYPHEN.test(raw)) extras.push(foldSearchText(raw.replace(ANY_HYPHEN, " ")));
  const all = [primary, ...extras, ...latinCandidates(raw)].filter(Boolean);
  return [...new Set(all)].slice(0, MAX_VARIANTS);
}

function pattern(v: string): string {
  // Тоо ба ≤2 үсэгтэй үгийг зөвхөн үгийн эхээр («2» → « 2…», «ул» → « ул…»).
  return /^[0-9]/.test(v) || v.length <= 2 ? `% ${escapeLike(v)}%` : `%${escapeLike(v)}%`;
}

/**
 * Асуулга → AND бүлгүүд (≤ MAX_GROUPS), бүлэг бүр OR хэв маягууд.
 * Тоо дараагийн үгтэйгээ нийлнэ («2 өрөө» → «% 2 оро%»).
 */
export function searchPatternGroups(q: string | undefined): string[][] {
  const kept = splitRawTokens(q ?? "")
    .map(tokenVariants)
    .filter((v) => v.length > 0 && !STOPWORDS.has(v[0]));
  const groups: string[][] = [];
  for (let i = 0; i < kept.length; i++) {
    let variants = kept[i];
    const primary = variants[0];
    const next = kept[i + 1];
    if (/^[0-9.]+$/.test(primary) && next && /^[а-я]/.test(next[0])) {
      variants = next.map((v) => `${primary} ${v}`);
      i++;
    } else if (primary.length === 1 && !/[0-9]/.test(primary)) {
      continue;
    }
    const pats = [...new Set(variants.map(pattern).filter((p) => p.length <= MAX_PATTERN_LEN))];
    if (pats.length) groups.push(pats);
  }
  return groups.slice(0, MAX_GROUPS);
}

/** PostgREST or=(…) доторх утгыг давхар хашилтаар хашина. */
function pgrstQuote(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Нэг бүлгийн OR шүүлт: `col.like."p1",col.like."p2"` (supabase-js .or()-д). */
export function likeAnyFilter(column: string, patterns: string[]): string {
  return patterns.map((p) => `${column}.like.${pgrstQuote(p)}`).join(",");
}
