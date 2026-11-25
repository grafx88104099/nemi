import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ROOT_OG_IMAGE } from "@/lib/seo/site";

describe("ROOT_OG_IMAGE — анхдагч OG зураг", () => {
  it("1200×630 (1.91:1) бөгөөд public/-д буй PNG-ийн бодит хэмжээтэй таарна", () => {
    expect(ROOT_OG_IMAGE.width).toBe(1200);
    expect(ROOT_OG_IMAGE.height).toBe(630);
    expect(ROOT_OG_IMAGE.url.startsWith("/")).toBe(true);

    const png = readFileSync(fileURLToPath(new URL(`../../public${ROOT_OG_IMAGE.url}`, import.meta.url)));
    // PNG гарын үсэг + IHDR (өргөн/өндөр 16–23-р байт, big-endian).
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(ROOT_OG_IMAGE.width);
    expect(png.readUInt32BE(20)).toBe(ROOT_OG_IMAGE.height);
    // FB-ийн хязгаар (8 MB)-аас хол бага.
    expect(png.length).toBeLessThan(300 * 1024);
  });
});
