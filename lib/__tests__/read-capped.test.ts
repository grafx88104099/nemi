import { describe, expect, it } from "vitest";

import { readTextCapped } from "@/lib/http/read-capped";

const URL_ = "https://www.nemi.mn/api/x";

function streamReq(chunks: string[], headers: Record<string, string> = {}) {
  let i = 0;
  let pulled = 0;
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      pulled++;
      if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
      else c.close();
    },
  });
  const req = new Request(URL_, { method: "POST", body, headers, duplex: "half" } as RequestInit);
  return { req, pulled: () => pulled };
}

describe("readTextCapped", () => {
  it("жижиг body-г бүтнээр нь (UTF-8) уншина", async () => {
    const req = new Request(URL_, { method: "POST", body: JSON.stringify({ q: "Зайсан" }) });
    expect(await readTextCapped(req, 1024)).toBe('{"q":"Зайсан"}');
  });

  it("body байхгүй → хоосон мөр", async () => {
    expect(await readTextCapped(new Request(URL_, { method: "POST" }), 10)).toBe("");
  });

  it("Content-Length хэтэрсэн эсвэл буруу → null", async () => {
    const big = new Request(URL_, { method: "POST", body: "x".repeat(2000) });
    expect(await readTextCapped(big, 1024)).toBeNull();
    const { req } = streamReq(["{}"], { "content-length": "abc" });
    expect(await readTextCapped(req, 1024)).toBeNull();
  });

  it("Content-Length-гүй chunked body хязгаар давмагц зогсооно", async () => {
    const { req, pulled } = streamReq(Array.from({ length: 50 }, () => "x".repeat(600)));
    expect(await readTextCapped(req, 1024)).toBeNull();
    expect(pulled()).toBeLessThan(5);
  });

  it("chunked body хязгаар дотор бол нийлүүлнэ", async () => {
    const { req } = streamReq(['{"a":', '"өө"}']);
    expect(await readTextCapped(req, 1024)).toBe('{"a":"өө"}');
  });

  it("яг хязгаартай тэнцүү бол зөвшөөрнө", async () => {
    const req = new Request(URL_, { method: "POST", body: "x".repeat(1024) });
    expect(await readTextCapped(req, 1024)).toHaveLength(1024);
  });
});
