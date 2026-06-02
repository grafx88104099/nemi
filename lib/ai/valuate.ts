/**
 * Anthropic Claude API-аар зарын үнэлгээ хийх цөм логик.
 * ANTHROPIC_API_KEY env шаардлагатай (байхгүй бол алдаа буцаана).
 */
const MODEL = "claude-haiku-4-5-20251001";

export type ValuationInput = {
  title: string;
  type: string | null;
  district: string | null;
  rooms: number;
  area: number | null;
  price: number;
  price_per_m2: number | null;
  year: number | null;
  comps: { price: number; area: number | null; price_per_m2: number | null }[];
};

export type ValuationResult = { score: number; note: string };

export async function valuateWithAI(
  input: ValuationInput
): Promise<{ result?: ValuationResult; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: "no_key" };

  const compText = input.comps.length
    ? input.comps
        .map((c) => `- ${c.area ?? "?"}м², ${c.price.toLocaleString()}₮ (м²=${c.price_per_m2 ?? "?"})`)
        .join("\n")
    : "Харьцуулах зар алга.";

  const prompt = `Та Монголын үл хөдлөх хөрөнгийн үнэлгээний мэргэжилтэн. Доорх зарыг зах зээлийн өгөгдөлтэй харьцуулж 0-100 хооронд чанар/үнийн оноо өг, 1 өгүүлбэр тайлбар бич (монголоор).

Зар: ${input.title}
Төрөл: ${input.type}, Дүүрэг: ${input.district}, Өрөө: ${input.rooms}, Талбай: ${input.area}м²
Үнэ: ${input.price.toLocaleString()}₮ (м²=${input.price_per_m2 ?? "?"})
Ашиглалт: ${input.year ?? "?"}

Ижил дүүрэг/төрлийн зарууд:
${compText}

ЗӨВХӨН дараах JSON форматаар хариул, өөр текст бүү нэм:
{"score": <0-100 бүхэл тоо>, "note": "<нэг өгүүлбэр тайлбар>"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return { error: `api_${res.status}` };
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { error: "parse" };
    const parsed = JSON.parse(match[0]);
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
    const note = String(parsed.note ?? "").slice(0, 280);
    return { result: { score, note } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown" };
  }
}
