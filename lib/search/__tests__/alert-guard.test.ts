import { describe, expect, it, vi } from "vitest";

import { SEARCH_ALERT_WINDOW_SECONDS, claimSearchAlert, searchAlertKey } from "@/lib/search/alert-guard";

describe("claimSearchAlert", () => {
  it("rate_limit_hit-ийг хайлт бүрийн түлхүүрээр, өдөрт 1 удаагаар дуудна", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(claimSearchAlert(rpc, "abc")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "search-alert:abc",
      p_window_seconds: SEARCH_ALERT_WINDOW_SECONDS,
      p_max: 1,
    });
    expect(SEARCH_ALERT_WINDOW_SECONDS).toBe(86_400);
    expect(searchAlertKey("x").length).toBeLessThanOrEqual(200);
  });

  it("өнөөдөр аль хэдийн илгээсэн бол алгасна", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(claimSearchAlert(rpc, "abc")).resolves.toBe(false);
  });

  it("RPC алдаа/шидэлт гарвал давхар илгээхгүйн тулд алгасна", async () => {
    await expect(claimSearchAlert(vi.fn().mockResolvedValue({ data: null, error: { message: "x" } }), "a")).resolves.toBe(false);
    await expect(claimSearchAlert(vi.fn().mockRejectedValue(new Error("net")), "a")).resolves.toBe(false);
  });
});
