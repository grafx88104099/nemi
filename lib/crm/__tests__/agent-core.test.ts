import { describe, expect, it } from "vitest";

import {
  activityRuleError,
  gradeTimelineMismatch,
  leadSlaState,
  legacyStageToLifecycle,
  parsePastedLead,
  profileMissingFields,
  quickLogPayload,
  registrarOwnsLead,
  slaStateLabel,
  ubToday,
  type ActivityRuleInput,
} from "@/lib/crm/agent-core";

// 2026-11-09 Даваа 10:00 УБ = 02:00 UTC
const MON_10_UB = new Date("2026-11-09T02:00:00Z");
// 2026-11-09 Даваа 18:30 УБ = 10:30 UTC
const MON_1830_UB = new Date("2026-11-09T10:30:00Z");

const base: ActivityRuleInput = {
  channel: "call",
  reached: true,
  summary: "Харилцагчтай ярьж төсөв, хугацааг тодруулсан. Сонголт илгээнэ.",
  attitude: "positive",
  outcome: "open",
  nextStepCode: "send_options",
  nextStep: "Сонголт илгээх",
  nextStepDate: "2026-11-10",
  occurredAt: "2026-11-09T01:55:00Z",
};

describe("activityRuleError (§6.11)", () => {
  it("зөв бүртгэлд алдаа өгөхгүй", () => {
    expect(activityRuleError(base, { now: MON_10_UB })).toBeNull();
  });

  it("ирээдүйн огноог хориглоно (5 минутын хүлцэлтэй)", () => {
    expect(activityRuleError({ ...base, occurredAt: "2026-11-09T02:04:00Z" }, { now: MON_10_UB })).toBeNull();
    expect(activityRuleError({ ...base, occurredAt: "2026-11-09T02:30:00Z" }, { now: MON_10_UB })).toMatch(/ирээдүйд/);
  });

  it("өнгөрсөн дараагийн үйлдлийн огноог хориглоно (УБ өдрөөр)", () => {
    expect(activityRuleError({ ...base, nextStepDate: "2026-11-08" }, { now: MON_10_UB })).toMatch(/өнгөрсөн/);
    expect(activityRuleError({ ...base, nextStepDate: "2026-11-09" }, { now: MON_10_UB })).toBeNull();
  });

  it("амжилттай/алдсан үр дүнгээс бусад бүх бүртгэлд дараагийн үйлдэл заавал", () => {
    expect(activityRuleError({ ...base, nextStepCode: null, nextStepDate: null }, { now: MON_10_UB })).toMatch(
      /Дараагийн үйлдэл/
    );
    expect(
      activityRuleError({ ...base, outcome: "lost", nextStepCode: null, nextStep: null, nextStepDate: null }, { now: MON_10_UB })
    ).toBeNull();
  });

  it("холбогдсон бол хандлага заавал, холбогдож чадаагүйд шаардахгүй", () => {
    expect(activityRuleError({ ...base, attitude: null }, { now: MON_10_UB })).toMatch(/хандлаг/);
    expect(activityRuleError({ ...base, reached: false, attitude: null }, { now: MON_10_UB })).toBeNull();
  });

  it("богино хураангуйг хориглоно, түргэн бүртгэлд хамаарахгүй", () => {
    expect(activityRuleError({ ...base, summary: "Ok" }, { now: MON_10_UB })).toMatch(/Хураангуй/);
    expect(activityRuleError({ ...base, summary: "Ok", quickLog: true }, { now: MON_10_UB })).toBeNull();
  });

  it("үзлэгт сонирхсон бол давтан үзлэг / санал / баримт л зөвшөөрнө (§6.15)", () => {
    const showing = { ...base, channel: "showing" as const, showingInterest: "interested" };
    expect(activityRuleError({ ...showing, nextStepCode: "call" }, { now: MON_10_UB })).toMatch(/давтан үзлэг/);
    expect(activityRuleError({ ...showing, nextStepCode: "offer" }, { now: MON_10_UB })).toBeNull();
  });
});

describe("quickLogPayload (R5 — 2 товшилт)", () => {
  it("холбогдож чадаагүй: reached=false, 24 цагийн дотор хоёр дахь оролдлого", () => {
    const p = quickLogPayload("no_answer", { now: MON_10_UB, retryHours: 24 });
    expect(p.reached).toBe(false);
    expect(p.nextStepCode).toBe("call");
    expect(p.nextStepDate).toBe("2026-11-09");
    // Тэр бүртгэл дүрмийг хангана (түргэн бүртгэл).
    expect(
      activityRuleError(
        { ...p, outcome: "open", occurredAt: MON_10_UB.toISOString(), quickLog: true },
        { now: MON_10_UB }
      )
    ).toBeNull();
  });

  it("орой холбогдож чадаагүй бол маргааш оролдоно", () => {
    expect(quickLogPayload("no_answer", { now: MON_1830_UB }).nextStepDate).toBe("2026-11-10");
  });

  it("дахин залгах огноог ангиллын давтамжаар санал болгоно (§6.5)", () => {
    expect(quickLogPayload("callback", { now: MON_10_UB, grade: "b" }).nextStepDate).toBe("2026-11-16");
    expect(quickLogPayload("callback", { now: MON_10_UB, grade: "a" }).nextStepDate).toBe("2026-11-12");
  });

  it("шинэ сэжимд зорилго = шалгаруулалт", () => {
    expect(quickLogPayload("callback", { now: MON_10_UB, leadIsNew: true }).purpose).toBe("screening");
  });

  it("бүх холбогдсон загварт хандлага бөглөгдсөн", () => {
    for (const o of ["callback", "send_options", "showing_set", "not_ready"] as const) {
      const p = quickLogPayload(o, { now: MON_10_UB, grade: "c" });
      expect(p.reached).toBe(true);
      expect(p.attitude).not.toBeNull();
      expect(p.nextStepDate >= ubToday(MON_10_UB)).toBe(true);
    }
  });
});

describe("registrarOwnsLead (§6.26)", () => {
  it("реферал, хувийн сүлжээ, идэвхтэй хайлт, листингийн лавлагаа → бүртгэгч", () => {
    for (const s of ["referral", "personal_network", "prospecting", "listing_inquiry"]) {
      expect(registrarOwnsLead(s)).toBe(true);
    }
    expect(registrarOwnsLead("digital")).toBe(false);
    expect(registrarOwnsLead("walk_in")).toBe(false);
  });

  it("тохиргооны жагсаалтыг дагана, агент биш бүртгэгчид үйлчлэхгүй", () => {
    expect(registrarOwnsLead("walk_in", ["walk_in"])).toBe(true);
    expect(registrarOwnsLead("referral", ["walk_in"])).toBe(false);
    expect(registrarOwnsLead("referral", undefined, false)).toBe(false);
  });
});

describe("profileMissingFields (§6.7)", () => {
  it("хоосон профайлд бүх заавал талбарыг жагсаана", () => {
    const missing = profileMissingFields({ profileType: "buyer" });
    expect(missing).toContain("Зорилго");
    expect(missing).toContain("Доод төсөв");
    expect(missing).toContain("Заавал байх шаардлага (0/3)");
    expect(missing).toContain("Одоогийн саад");
  });

  it("бүрэн профайлд дутуу алга; саад байхгүй гэдэг ч хариулт", () => {
    expect(
      profileMissingFields({
        profileType: "buyer",
        goalId: "g",
        locations: ["Хан-Уул"],
        propertyTypes: ["apartment"],
        budgetMin: 300,
        budgetTarget: 400,
        budgetMax: 500,
        financing: "cash",
        roomsMin: 2,
        timeline: "1_3m",
        mustHaves: ["Лифт", "Зогсоол", "Сургууль ойр"],
        decisionMakerId: "dm",
        blockerId: "none",
      })
    ).toEqual([]);
  });

  it("түрээслэгчид сарын төсөв, орох огноо, өрх/бизнес", () => {
    const missing = profileMissingFields({ profileType: "tenant", budgetMax: null });
    expect(missing).toContain("Сарын төсөв");
    expect(missing).toContain("Орох огноо");
    expect(missing).toContain("Өрх буюу бизнесийн хэрэгцээ");
    expect(missing).not.toContain("Доод төсөв");
  });
});

describe("gradeTimelineMismatch (§6.5)", () => {
  it("A ангилал + 12 сараас дээш хугацааг зөрчил гэж үзнэ", () => {
    expect(gradeTimelineMismatch("a", "12m_plus")).toBe(true);
    expect(gradeTimelineMismatch("a", "0_30")).toBe(false);
    expect(gradeTimelineMismatch(null, "0_30")).toBe(false);
  });
});

describe("leadSlaState (§6.4)", () => {
  const lead = {
    status: "new",
    first_contact_at: null,
    first_contact_due_at: "2026-11-09T02:15:00Z",
    created_at: "2026-11-09T02:00:00Z",
  };
  it("хугацаа үлдсэн / хэтэрсэн / 48 цаг", () => {
    expect(leadSlaState(lead, MON_10_UB)).toEqual({ kind: "waiting", minutesLeft: 15 });
    expect(leadSlaState(lead, new Date("2026-11-09T02:20:00Z"))).toEqual({ kind: "breached", minutesOver: 5 });
    expect(leadSlaState(lead, new Date("2026-11-11T02:00:00Z"), 48)).toEqual({ kind: "no_contact", hours: 48 });
  });
  it("утга бүхий холболт болсон бол биелсэн", () => {
    expect(leadSlaState({ ...lead, first_contact_at: "2026-11-09T02:10:00Z" }, MON_10_UB)).toEqual({ kind: "met" });
    expect(slaStateLabel({ kind: "met" })?.tone).toBe("green");
  });
});

describe("parsePastedLead (R18)", () => {
  it("Messenger-ийн текстээс утас, нэр, сувгийг танина", () => {
    const p = parsePastedLead("Бат Болд\nСайн байна уу, 2 өрөө байр сонирхож байна. 9911-2233\nm.me/batbold");
    expect(p.phone).toBe("97699112233");
    expect(p.lastName).toBe("Бат");
    expect(p.firstName).toBe("Болд");
    expect(p.channelHint).toBe("Facebook / Messenger");
  });
  it("+976 угтвар, и-мэйлийг танина; утасгүй бол null", () => {
    expect(parsePastedLead("Нэр: Сараа\n+976 8811 4455").phone).toBe("97688114455");
    expect(parsePastedLead("sara@mail.mn").email).toBe("sara@mail.mn");
    expect(parsePastedLead("сайн уу").phone).toBeNull();
  });
});

describe("legacyStageToLifecycle", () => {
  it("хуучин шатыг CRM-ийн төлөвт буулгана", () => {
    expect(legacyStageToLifecycle("new")).toBe("new");
    expect(legacyStageToLifecycle("viewing")).toBe("active");
    expect(legacyStageToLifecycle("closed")).toBe("inactive");
    expect(legacyStageToLifecycle("lost")).toBe("inactive");
    expect(legacyStageToLifecycle(undefined)).toBe("new");
  });
});
