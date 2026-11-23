import { describe, it, expect } from "vitest";

import {
  activeTab,
  conversationIdFromLink,
  conversationLink,
  countUnreadIn,
  HUB_INTENTS,
  hubSectionOrder,
  mergeHubAgents,
  parseHubIntent,
  savedSearchHref,
  withSavedSearchParam,
  type HubAgentSrc,
  type HubSectionId,
} from "@/lib/hub";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const ALL: HubSectionId[] = ["tours", "messages", "searches", "saved", "recent", "agents", "listings", "tools"];

const agent = (id: string, name = id): HubAgentSrc => ({
  id,
  display_name: name,
  avatar: name.slice(0, 2),
  avatar_url: null,
  office: { name: "Оффис", color: "#111" },
});

describe("hubSectionOrder", () => {
  it("зорилго бүрт 8 хэсгийн сэлгэмэл буцаана", () => {
    for (const intent of [null, ...HUB_INTENTS.map(([v]) => v)]) {
      const order = hubSectionOrder(intent);
      expect(order).toHaveLength(8);
      expect([...order].sort()).toEqual([...ALL].sort());
    }
  });
  it("null үед өгөгдмөл дараалал", () => {
    expect(hubSectionOrder(null)).toEqual(ALL);
  });
  it("буцаасан массивыг өөрчлөхөд дараагийн дуудлагад нөлөөлөхгүй", () => {
    hubSectionOrder("buy").reverse();
    expect(hubSectionOrder("buy")[0]).toBe("searches");
  });
});

describe("parseHubIntent", () => {
  it("зөв утгыг хүлээн авна", () => {
    expect(parseHubIntent("buy")).toBe("buy");
    expect(parseHubIntent("browse")).toBe("browse");
  });
  it("хог утгыг татгалзана", () => {
    for (const v of ["", null, undefined, 1, "BUY", "x", {}]) expect(parseHubIntent(v)).toBeNull();
  });
});

describe("conversationIdFromLink", () => {
  it("зөв uuid", () => {
    expect(conversationIdFromLink(`/messages?c=${U1}`)).toBe(U1);
  });
  it("uuid биш c, c байхгүй, null", () => {
    expect(conversationIdFromLink("/messages?c=abc")).toBeNull();
    expect(conversationIdFromLink("/messages")).toBeNull();
    expect(conversationIdFromLink(null)).toBeNull();
  });
  it("өөр зам → null", () => {
    expect(conversationIdFromLink(`/listings?c=${U1}`)).toBeNull();
  });
  it("conversationLink-ээр эргэж ирнэ", () => {
    expect(conversationLink(U2)).toBe(`/messages?c=${U2}`);
    expect(conversationIdFromLink(conversationLink(U2))).toBe(U2);
  });
});

describe("savedSearchHref", () => {
  it("шүүлтийг хадгалж ss залгана", () => {
    const href = savedSearchHref(U1, { deal: "rent", q: "2 өрөө" });
    const u = new URL(href, "https://x");
    expect(u.pathname).toBe("/listings");
    expect(u.searchParams.get("deal")).toBe("rent");
    expect(u.searchParams.get("q")).toBe("2 өрөө");
    expect(u.searchParams.get("ss")).toBe(U1);
  });
  it("шүүлтэд хуучин ss байсан ч нэг л ss үлдэнэ", () => {
    const u = new URL(savedSearchHref(U1, { ss: U2 }), "https://x");
    expect(u.searchParams.getAll("ss")).toEqual([U1]);
  });
});

describe("withSavedSearchParam", () => {
  it("query-тэй ба query-гүй URL", () => {
    expect(withSavedSearchParam("/listings?deal=rent", U1)).toBe(`/listings?deal=rent&ss=${U1}`);
    expect(withSavedSearchParam("/listings", U1)).toBe(`/listings?ss=${U1}`);
    expect(withSavedSearchParam("/listings", null)).toBe("/listings");
  });
});

describe("activeTab", () => {
  it("зам → таб", () => {
    expect(activeTab("/listings")).toBe("search");
    expect(activeTab("/listings/abc")).toBe("search");
    expect(activeTab("/map")).toBe("map");
    expect(activeTab("/favorites")).toBe("saved");
    expect(activeTab("/saved-searches")).toBe("saved");
    expect(activeTab("/messages")).toBe("messages");
    expect(activeTab("/me")).toBe("me");
    expect(activeTab("/account")).toBe("me");
    expect(activeTab("/tours")).toBe("me");
  });
  it("хамааралгүй зам, сегментийн хил", () => {
    expect(activeTab("/")).toBeNull();
    expect(activeTab("/agents")).toBeNull();
    expect(activeTab("/mega")).toBeNull();
    expect(activeTab("/mapping")).toBeNull();
    expect(activeTab(null)).toBeNull();
  });
});

describe("mergeHubAgents", () => {
  it("чатын агент үзлэгийнхээс давуу, conversationId-гаа хадгална", () => {
    const r = mergeHubAgents([{ id: "c1", agent: agent("a1") }], [{ agent: agent("a1") }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "a1", conversationId: "c1", officeName: "Оффис", officeColor: "#111" });
  });
  it("зөвхөн үзлэгийн агент conversationId = null", () => {
    const r = mergeHubAgents([], [{ agent: agent("a2") }]);
    expect(r[0].conversationId).toBeNull();
  });
  it("null агентыг алгасна", () => {
    const r = mergeHubAgents([{ id: "c1", agent: null }], [{ agent: null }, { agent: agent("a3") }]);
    expect(r.map((a) => a.id)).toEqual(["a3"]);
  });
  it("max-ыг баримтална, дараалал тогтвортой", () => {
    const r = mergeHubAgents(
      [
        { id: "c1", agent: agent("a1") },
        { id: "c2", agent: agent("a2") },
        { id: "c3", agent: agent("a1") },
      ],
      [{ agent: agent("a3") }, { agent: agent("a4") }, { agent: agent("a5") }]
    );
    expect(r.map((a) => a.id)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(r[0].conversationId).toBe("c1");
  });
});

describe("countUnreadIn", () => {
  it("хоосон олонлог → 0", () => {
    expect(countUnreadIn([U1, U2], new Set())).toBe(0);
  });
  it("жагсаалтаас гадуурх id-г тоолохгүй", () => {
    expect(countUnreadIn([U1], new Set([U1, U2]))).toBe(1);
  });
});
