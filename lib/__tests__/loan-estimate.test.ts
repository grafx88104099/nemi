import { describe, expect, it } from "vitest";

import { getBankProducts, monthlyPayment } from "@/lib/loans/banks";
import { estimateMortgage } from "@/lib/loans/estimate";

describe("estimateMortgage", () => {
  it("300 сая: 8%-ийн хөтөлбөр ба хамгийн бага худалдааны хүү", async () => {
    const e = estimateMortgage(300_000_000, await getBankProducts())!;
    expect(e.principal).toBe(210_000_000);
    expect(e.downPayment).toBe(90_000_000);
    expect(e.government?.rate).toBe(8);
    expect(e.government?.monthly).toBe(Math.round(monthlyPayment(210_000_000, 8, 20)));
    expect(e.commercial?.rate).toBe(16.8);
  });

  it("зээл хөтөлбөрийн дээд хэмжээнээс их бол хөнгөлөлттэйг санал болгохгүй", async () => {
    const e = estimateMortgage(1_000_000_000, await getBankProducts())!;
    expect(e.principal).toBe(700_000_000);
    expect(e.government).toBeNull();
    expect(e.commercial).not.toBeNull();
  });

  it("буруу үнэд null", async () => {
    expect(estimateMortgage(0, await getBankProducts())).toBeNull();
    expect(estimateMortgage(Number.NaN, await getBankProducts())).toBeNull();
  });
});
