/**
 * Хүсэлтийн body-г дээд хэмжээтэйгээр уншина. Content-Length байхгүй (chunked)
 * хүсэлтэд ч `maxBytes`-аас хэтэрмэгц уншихаа зогсоож (stream-ийг цуцалж) null
 * буцаана — бүтэн body-г санах ойд буферлэхгүй. Цэвэр (Web Request API).
 *
 * null = хэт том, Content-Length буруу эсвэл уншиж чадсангүй.
 */
export async function readTextCapped(request: Request, maxBytes: number): Promise<string | null> {
  const header = request.headers.get("content-length");
  if (header != null) {
    const len = Number(header);
    if (!/^\d+$/.test(header.trim()) || !Number.isFinite(len) || len > maxBytes) return null;
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}
