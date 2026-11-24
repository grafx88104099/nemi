import { describe, expect, it } from "vitest";

import {
  OWNER_NOTE_REQUIRED,
  OWNER_PHONE_ERROR,
  applyPhoneEdit,
  draftFromPending,
  emptyOwnerModel,
  formatPhoneTyping,
  isFinal,
  isOwnerPhoneValid,
  modelFromDraft,
  modelFromPending,
  orderedSources,
  ownerPhoneError,
  ownerReducer,
  phoneForField,
  toOwnerDraft,
  toOwnerInput,
  validateOwner,
  type OwnerAction,
  type OwnerMatch,
  type OwnerModel,
} from "../owner-model";

const NORM = "97699112233";
const visibleMatch: OwnerMatch = { contactId: "c-vis", code: "C001", name: "Бат", agentName: "Агент А", canOpen: true };
const hiddenMatch: OwnerMatch = { contactId: "c-hid", code: "C002", name: "Б***", agentName: "Агент Б", canOpen: false };

function run(m: OwnerModel, ...actions: OwnerAction[]): OwnerModel {
  return actions.reduce(ownerReducer, m);
}

function typed(phone = "9911 2233"): OwnerModel {
  return run(emptyOwnerModel(), { type: "phone", value: phone });
}

describe("phone formatting and validation", () => {
  it("formats while typing", () => {
    expect(formatPhoneTyping("9911")).toBe("9911");
    expect(formatPhoneTyping("99112")).toBe("9911 2");
    expect(formatPhoneTyping("99112233")).toBe("9911 2233");
    expect(formatPhoneTyping("+97699112233")).toBe("+976 9911 2233");
    expect(formatPhoneTyping("+976")).toBe("+976");
    expect(formatPhoneTyping("9911-22 33")).toBe("9911 2233");
    // 8-аас олон цифр — тайрахгүй
    expect(formatPhoneTyping("991122334")).toBe("991122334");
  });

  it("keeps the caret after the same digit and deletes a digit over the space", () => {
    expect(applyPhoneEdit("9911", "99112", 5, "insertText")).toEqual({ value: "9911 2", caret: 6 });
    // курсор зайны дараа — backspace зайг биш өмнөх цифрийг устгана
    expect(applyPhoneEdit("9911 2233", "99112233", 4, "deleteContentBackward")).toEqual({ value: "9912 233", caret: 3 });
    // дунд нь цифр нэмэх
    expect(applyPhoneEdit("9911 223", "99011 223", 2, "insertText").value).toBe("9901 1223");
    expect(applyPhoneEdit("9901 1223", "", 0, "deleteContentBackward")).toEqual({ value: "", caret: 0 });
  });

  it("accepts 8 local digits, a full +976 number or an explicit international number", () => {
    expect(isOwnerPhoneValid("9911 2233")).toBe(true);
    expect(isOwnerPhoneValid("+976 9911-2233")).toBe(true);
    expect(isOwnerPhoneValid("97699112233")).toBe(true);
    expect(isOwnerPhoneValid("+82 10 1234 5678")).toBe(true);
    expect(isOwnerPhoneValid("9911223")).toBe(false);
    expect(isOwnerPhoneValid("991122334")).toBe(false);
    expect(ownerPhoneError("9911223")).toBe(OWNER_PHONE_ERROR);
    expect(ownerPhoneError("")).toBeNull();
    expect(phoneForField("97699112233")).toBe("9911 2233");
  });
});

describe("owner reducer and outputs", () => {
  it("none: no match → a new person with phone, optional name and source", () => {
    let m = typed();
    expect(m.matchState).toEqual({ kind: "checking", norm: NORM });
    m = run(m, { type: "lookup_done", norm: NORM, matches: [] }, { type: "source", code: "referral" });
    expect(m.matchState.kind).toBe("none");
    expect(toOwnerInput(m)).toEqual({ phone: "9911 2233", full_name: null, source: "referral", source_note: null });
    const v = validateOwner(m);
    expect(v.expectedStatus).toBe("created");
    expect(v.nameUnverified).toBe(true);
    expect(v.sendable).toBe(true);
  });

  it("visible: «Энэ хүн үү?» — never auto-links; «Тийм» sends contact_id, «Өөр хүн» allow_duplicate", () => {
    const m = run(typed(), { type: "lookup_done", norm: NORM, matches: [visibleMatch, hiddenMatch] });
    expect(m.matchState).toEqual({ kind: "visible", norm: NORM, matches: [visibleMatch] });
    expect(m.chosenContactId).toBeNull();
    expect(validateOwner(m).needsChoice).toBe(true);
    expect(validateOwner(m).expectedStatus).toBe("needs_choice");
    expect(toOwnerInput(m)).not.toHaveProperty("contact_id");

    const yes = run(m, { type: "choose", contactId: "c-vis" });
    expect(toOwnerInput(yes)).toEqual({ contact_id: "c-vis" });
    expect(validateOwner(yes).expectedStatus).toBe("linked");
    // харах эрхгүй мөрийг сонгож болохгүй
    expect(run(m, { type: "choose", contactId: "c-hid" }).chosenContactId).toBeNull();

    const other = run(m, { type: "separate" }, { type: "name", value: "Дорж" });
    expect(toOwnerInput(other)).toMatchObject({ phone: "9911 2233", full_name: "Дорж", allow_duplicate: true });
    expect(validateOwner(other).expectedStatus).toBe("created");
  });

  it("foreign: only hidden matches → pending unless «Тусдаа хүн»", () => {
    const m = run(typed(), { type: "lookup_done", norm: NORM, matches: [hiddenMatch] });
    expect(m.matchState.kind).toBe("foreign");
    const v = validateOwner(m);
    expect(v.foreignPending).toBe(true);
    expect(v.expectedStatus).toBe("foreign");
    expect(v.sendable).toBe(true);
    expect(toOwnerInput(m)).not.toHaveProperty("allow_duplicate");
    const sep = run(m, { type: "separate" });
    expect(toOwnerInput(sep)).toMatchObject({ allow_duplicate: true });
    expect(run(sep, { type: "transfer_requested" }).transferRequested).toBe(true);
  });

  it("needs_choice from the server (offline send) shows the match without linking", () => {
    let m = run(typed(), { type: "lookup_failed", norm: NORM, reason: "offline" });
    expect(m.matchState).toEqual({ kind: "unchecked", norm: NORM, reason: "offline" });
    expect(validateOwner(m).expectedStatus).toBeNull();
    m = run(m, {
      type: "server",
      result: { status: "needs_choice", match: { contact_id: "c-vis", code: "C001", full_name: "Бат" }, pending_saved: true },
    });
    expect(m.serverStatus).toBe("needs_choice");
    expect(m.matchState.kind).toBe("visible");
    expect(m.chosenContactId).toBeNull();
    expect(isFinal(m.serverStatus)).toBe(false);
    // сүлжээ орвол дахин шалгана
    expect(run(m, { type: "recheck" }).matchState).toEqual({ kind: "checking", norm: NORM });
  });

  it("foreign from the server keeps only masked hidden rows", () => {
    const m = run(typed(), {
      type: "server",
      result: {
        status: "foreign",
        duplicates: [{ contact_id: "c-hid", code: "C002", display_name: "Б***", can_open: false, responsible_agent_name: "Агент Б" }],
      },
    });
    expect(m.matchState).toEqual({ kind: "foreign", norm: NORM, matches: [hiddenMatch] });
  });

  it("invalid: a 7-digit phone is not sendable and predicts invalid_phone", () => {
    const m = typed("9911 223");
    expect(m.matchState.kind).toBe("idle");
    const v = validateOwner(m);
    expect(v.phoneError).toBe(OWNER_PHONE_ERROR);
    expect(v.sendable).toBe(false);
    expect(v.expectedStatus).toBe("invalid_phone");
    expect(toOwnerInput(m)).toBeNull();
    expect(validateOwner(emptyOwnerModel()).expectedStatus).toBe("none");
    expect(toOwnerInput(emptyOwnerModel())).toBeNull();
  });

  it("duplicate: changing the number drops the previous choice; stale lookups are ignored", () => {
    let m = run(typed(), { type: "lookup_done", norm: NORM, matches: [visibleMatch] }, { type: "choose", contactId: "c-vis" });
    // ижил дугаарыг өөр хэлбэрээр бичвэл сонголт хэвээр
    m = run(m, { type: "phone", value: "+976 9911 2233" });
    expect(m.chosenContactId).toBe("c-vis");
    m = run(m, { type: "phone", value: "8811 2233" });
    expect(m.chosenContactId).toBeNull();
    expect(m.allowDuplicate).toBe(false);
    // хуучин дугаарын хариу ирэхэд үл тооно
    const stale = run(m, { type: "lookup_done", norm: NORM, matches: [visibleMatch] });
    expect(stale.matchState).toEqual({ kind: "checking", norm: "97688112233" });
  });

  it("pending: owner_pending prefills the live field and is not final", () => {
    const pending = {
      phone: "9911 2233",
      name: "Бат",
      source: "other",
      source_note: "Хөршөөс",
      status: "foreign" as const,
      at: "2026-11-24T05:00:00Z",
    };
    const m = modelFromPending(pending);
    expect(m.phone).toBe("9911 2233");
    expect(m.serverStatus).toBe("foreign");
    expect(m.matchState).toEqual({ kind: "checking", norm: NORM });
    expect(draftFromPending(pending).sourceGuessed).toBe(false);
    expect(isFinal("foreign")).toBe(false);
    expect(isFinal("pending_review")).toBe(false);
    expect(isFinal(null)).toBe(false);
    for (const s of ["none", "linked", "matched", "created"] as const) expect(isFinal(s)).toBe(true);
  });

  it("restores a draft and re-validates the chosen contact after lookup", () => {
    const restored = modelFromDraft({ phone: "99112233", chosenContactId: "c-gone", name: "", source: null });
    expect(restored.phone).toBe("9911 2233");
    const after = run(restored, { type: "lookup_done", norm: NORM, matches: [visibleMatch] });
    expect(after.chosenContactId).toBeNull();
    const kept = run(modelFromDraft(toOwnerDraft({ ...restored, chosenContactId: "c-vis" })), {
      type: "lookup_done",
      norm: NORM,
      matches: [visibleMatch],
    });
    expect(kept.chosenContactId).toBe("c-vis");
  });
});

describe("source", () => {
  it("preselects only the last-used source, marked unconfirmed", () => {
    const m = run(emptyOwnerModel("referral"), { type: "phone", value: "9911 2233" }, {
      type: "lookup_done",
      norm: NORM,
      matches: [],
    });
    expect(m.source).toBe("referral");
    expect(validateOwner(m).sourceUnconfirmed).toBe(true);
    expect(validateOwner(run(m, { type: "confirm_source" })).sourceUnconfirmed).toBe(false);
    expect(emptyOwnerModel("other").source).toBeNull();
    // ачааллын дараах таамаг: сонгосон бол дарж бичихгүй, «Бусад»-ыг таамаглахгүй
    expect(run(emptyOwnerModel(), { type: "guess_source", code: "digital" })).toMatchObject({ source: "digital", sourceGuessed: true });
    expect(run(emptyOwnerModel(), { type: "source", code: "referral" }, { type: "guess_source", code: "digital" }).source).toBe("referral");
    expect(run(emptyOwnerModel(), { type: "guess_source", code: "other" }).source).toBeNull();
    expect(emptyOwnerModel().source).toBeNull();
  });

  it("«Бусад» needs a note ≤ 200", () => {
    let m = run(typed(), { type: "lookup_done", norm: NORM, matches: [] }, { type: "source", code: "other" });
    expect(validateOwner(m).noteError).toBe(OWNER_NOTE_REQUIRED);
    expect(validateOwner(m).sendable).toBe(false);
    m = run(m, { type: "source_note", value: "Хөршөөс" });
    expect(validateOwner(m).sendable).toBe(true);
    expect(toOwnerInput(m)).toMatchObject({ source: "other", source_note: "Хөршөөс" });
    expect(validateOwner(run(m, { type: "source_note", value: "x".repeat(201) })).noteError).not.toBeNull();
    // өөр эх сурвалж сонговол тайлбар цэвэрлэгдэнэ
    expect(run(m, { type: "source", code: "digital" }).sourceNote).toBe("");
  });

  it("orders chips by the default taxonomy with «Бусад» last", () => {
    const order = orderedSources({ other: "Бусад", zeta: "Я", referral: "Танил", digital: "Онлайн" }).map((s) => s.code);
    expect(order).toEqual(["digital", "referral", "zeta", "other"]);
  });
});
