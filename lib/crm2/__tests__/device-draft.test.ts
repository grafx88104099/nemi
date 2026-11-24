import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crm2Kv, memoryKv, setCrm2KvFactoryForTests, wipeVault } from "@/lib/crm2/device/vault";
import {
  AUTO_RESTORE_MS,
  MAX_STAFF_DRAFTS,
  buildDraftRecord,
  discardDraft,
  draftKey,
  isExpired,
  listDrafts,
  loadDraft,
  makeTitleHint,
  mergeSnapshot,
  newDraft,
  parseDraftKey,
  purgeExpired,
  purgeOtherUsers,
  clearAllForUser,
  appendDraftMedia,
  setDraftStatus,
  unsentDraftSummary,
  putBlob,
  getBlob,
  saveDraft,
  savePrivate,
  sheetScope,
  shouldAutoRestore,
  staffNewScope,
  stripPrivate,
  upsertIndexEntry,
  type DraftIndexEntry,
} from "@/lib/crm2/device/draft-store";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const PHONE = "99112233";

beforeEach(() => setCrm2KvFactoryForTests(() => memoryKv()));
afterEach(() => setCrm2KvFactoryForTests(null));

describe("keys", () => {
  it("draftKey/parseDraftKey round-trip", () => {
    const ck = newDraft();
    const k = draftKey(P1, staffNewScope(ck));
    expect(k).toBe(`crm2:draft:${P1}:staff-new:${ck}`);
    expect(parseDraftKey(k)).toEqual({ profileId: P1, scope: `staff-new:${ck}` });
    expect(parseDraftKey(draftKey(P1, sheetScope("abc", "owner")))).toEqual({ profileId: P1, scope: "sheet:abc:owner" });
    expect(parseDraftKey("crm2:draft:x")).toBeNull();
  });
});

describe("pure helpers", () => {
  it("shouldAutoRestore: under 12 h only", () => {
    const now = 1_000_000_000_000;
    expect(shouldAutoRestore(now - 1000, now)).toBe(true);
    expect(shouldAutoRestore(now - AUTO_RESTORE_MS + 1, now)).toBe(true);
    expect(shouldAutoRestore(now - AUTO_RESTORE_MS, now)).toBe(false);
    expect(shouldAutoRestore(now + 5000, now)).toBe(false);
    expect(shouldAutoRestore(null, now)).toBe(false);
  });

  it("isExpired", () => {
    expect(isExpired({ expiresAt: 10 }, 9)).toBe(false);
    expect(isExpired({ expiresAt: 10 }, 10)).toBe(true);
    expect(isExpired(null)).toBe(true);
  });

  it("mergeSnapshot keeps known keys with matching types", () => {
    const defaults = { category: "", rooms: null as number | null, area: 0, features: [] as string[], extra: { a: 1 } };
    const out = mergeSnapshot(defaults, { category: "sale", rooms: 3, area: "x", features: ["lift"], unknown: 1, extra: { b: 2 } });
    expect(out).toEqual({ category: "sale", rooms: 3, area: 0, features: ["lift"], extra: { a: 1, b: 2 } });
    expect(mergeSnapshot(defaults, { area: null })).toMatchObject({ area: null });
    expect(mergeSnapshot(defaults, "garbage")).toEqual(defaults);
  });

  it("stripPrivate removes private keys", () => {
    expect(stripPrivate({ district: "БЗД", owner_phone: PHONE, owner: { phone: PHONE }, owner_note: "n" })).toEqual({ district: "БЗД" });
  });

  it("makeTitleHint uses project/district only", () => {
    expect(makeTitleHint({ project: " Зайсан  хотхон ", district: "ХУД" })).toBe("Зайсан хотхон · ХУД");
    expect(makeTitleHint({ project: "x".repeat(100) }).length).toBeLessThanOrEqual(60);
  });

  it("upsertIndexEntry caps at 10 and never evicts queued drafts", () => {
    let index: DraftIndexEntry[] = [];
    const evictedAll: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = upsertIndexEntry(index, { clientKey: `k${i}`, savedAt: i, titleHint: "", photoCount: 0, status: i < 3 ? "queued" : "editing" });
      index = r.index;
      evictedAll.push(...r.evicted);
    }
    expect(index).toHaveLength(MAX_STAFF_DRAFTS);
    expect(evictedAll).toEqual(["k3", "k4"]);
    expect(index.map((e) => e.clientKey)).toContain("k0");
  });

  it("buildDraftRecord: v2, +7 d expiry, cover fallback", () => {
    const rec = buildDraftRecord(P1, staffNewScope("ck"), { form: { a: 1 }, media: [{ id: "m1", blobKey: "b", name: "n", kind: "image", bytes: 1, w: 1, h: 1 }], coverId: "zz" }, { now: 0, hasPrivate: false });
    expect(rec.v).toBe(2);
    expect(rec.expiresAt).toBe(7 * 24 * 3600 * 1000);
    expect(rec.coverId).toBe("m1");
    expect(rec.clientKey).toBe("ck");
  });
});

describe("store", () => {
  it("private part is sealed, never plaintext in the draft record", async () => {
    const ck = newDraft();
    const scope = staffNewScope(ck);
    const key = draftKey(P1, scope);
    await savePrivate(key, { owner_phone: PHONE, owner_name: "Дорж" }, { profileId: P1 });
    await saveDraft(P1, scope, { form: { district: "СБД", owner_phone: PHONE }, titleHint: "СБД" });
    const drafts = JSON.stringify(await crm2Kv("drafts").entries());
    expect(drafts).not.toContain(PHONE);
    const sealed = JSON.stringify(await crm2Kv("sealed").entries());
    expect(sealed).not.toContain(PHONE);
    expect(sealed).not.toContain("Дорж");

    const loaded = await loadDraft<{ district: string }, { owner_phone: string }>(P1, scope);
    expect(loaded?.form).toEqual({ district: "СБД" });
    expect(loaded?.private?.owner_phone).toBe(PHONE);
    expect(loaded?.privateLost).toBe(false);
  });

  it("privateLost when the sealed part cannot be opened", async () => {
    const scope = staffNewScope(newDraft());
    const key = draftKey(P1, scope);
    await savePrivate(key, { owner_phone: PHONE }, { profileId: P1 });
    await saveDraft(P1, scope, { form: { a: 1 } });
    await wipeVault();
    const loaded = await loadDraft(P1, scope);
    expect(loaded?.private).toBeNull();
    expect(loaded?.privateLost).toBe(true);
  });

  it("listDrafts index (status, photo count) and other profiles are not visible", async () => {
    const ck = newDraft();
    await saveDraft(P1, staffNewScope(ck), {
      form: {},
      titleHint: "Ривер гарден · ХУД",
      media: [{ id: "1", blobKey: "b1", name: "a.jpg", kind: "image", bytes: 10, w: 1, h: 1 }],
      status: "queued",
    });
    const list = await listDrafts(P1);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ clientKey: ck, photoCount: 1, status: "queued", titleHint: "Ривер гарден · ХУД" });
    expect(await listDrafts(P2)).toHaveLength(0);
    expect(await loadDraft(P2, staffNewScope(ck))).toBeNull();
  });

  it("saving the 11th draft evicts the oldest editing draft", async () => {
    for (let i = 0; i < MAX_STAFF_DRAFTS + 1; i++) {
      await saveDraft(P1, staffNewScope(`c${i}`), { form: { i } }, { now: Date.now() + i });
    }
    const list = await listDrafts(P1, { now: Date.now() + 100 });
    expect(list).toHaveLength(MAX_STAFF_DRAFTS);
    expect(list.map((e) => e.clientKey)).not.toContain("c0");
    expect(await loadDraft(P1, staffNewScope("c0"))).toBeNull();
  });

  it("discard is a soft delete with undo; blobs go after the window", async () => {
    const scope = staffNewScope(newDraft());
    const key = draftKey(P1, scope);
    const blobKey = await putBlob(P1, new Blob(["img"], { type: "image/jpeg" }), "a.jpg");
    await saveDraft(P1, scope, { form: { a: 1 }, media: [{ id: "m", blobKey, name: "a.jpg", kind: "image", bytes: 3, w: 1, h: 1 }] });

    const h = await discardDraft(key, { undoMs: 60_000 });
    expect(await listDrafts(P1)).toHaveLength(0);
    expect(await loadDraft(P1, scope)).toBeNull();
    // Хожуу autosave нь устгасан нооргийг сэргээхгүй.
    expect(await saveDraft(P1, scope, { form: { a: 2 } })).toBeNull();
    expect(await h.undo()).toBe(true);
    expect(await listDrafts(P1)).toHaveLength(1);
    expect((await loadDraft(P1, scope))?.form).toEqual({ a: 1 });

    const h2 = await discardDraft(key, { undoMs: 0 });
    expect(await h2.done).toBe(true);
    expect(await h2.undo()).toBe(false);
    expect(await getBlob(blobKey)).toBeNull();
    expect(await crm2Kv("drafts").get(key)).toBeUndefined();
  });

  it("discard never deletes blobs referenced by the upload queue", async () => {
    const scope = staffNewScope(newDraft());
    const blobKey = await putBlob(P1, new Blob(["img"]), "a.jpg");
    await saveDraft(P1, scope, { form: {}, media: [{ id: "m", blobKey, name: "a.jpg", kind: "image", bytes: 3, w: 1, h: 1 }] });
    await crm2Kv("queue").set("q1", { id: "q1", blobKey });
    const h = await discardDraft(draftKey(P1, scope), { undoMs: 0 });
    await h.done;
    expect(await getBlob(blobKey)).not.toBeNull();
  });

  it("purgeExpired removes old drafts and orphans but keeps queue-referenced blobs", async () => {
    const scope = staffNewScope(newDraft());
    const queued = await putBlob(P1, new Blob(["q"]), "q.jpg");
    const orphan = await putBlob(P1, new Blob(["o"]), "o.jpg");
    await saveDraft(P1, scope, { form: {} }, { now: Date.now() });
    await crm2Kv("queue").set("q1", { id: "q1", blobKey: queued });
    const r = await purgeExpired({ now: Date.now() + 8 * 24 * 3600 * 1000 });
    expect(r.drafts).toBe(1);
    expect(await getBlob(queued)).not.toBeNull();
    expect(await getBlob(orphan)).toBeNull();
    expect(await listDrafts(P1, { now: Date.now() + 8 * 24 * 3600 * 1000 })).toHaveLength(0);
  });

  it("purgeOtherUsers and clearAllForUser", async () => {
    const s1 = staffNewScope(newDraft());
    const s2 = staffNewScope(newDraft());
    await savePrivate(draftKey(P1, s1), { owner_phone: PHONE }, { profileId: P1 });
    await saveDraft(P1, s1, { form: {} });
    await savePrivate(draftKey(P2, s2), { owner_phone: PHONE }, { profileId: P2 });
    await saveDraft(P2, s2, { form: {} });
    const b2 = await putBlob(P2, new Blob(["x"]), "x");

    await purgeOtherUsers(P1);
    expect(await loadDraft(P2, s2)).toBeNull();
    expect(await listDrafts(P2)).toHaveLength(0);
    expect(await getBlob(b2)).toBeNull();
    expect((await loadDraft(P1, s1))?.private).toEqual({ owner_phone: PHONE });

    await clearAllForUser(P1);
    expect(await loadDraft(P1, s1)).toBeNull();
    expect(await crm2Kv("sealed").entries()).toHaveLength(0);
  });
});

describe("appendDraftMedia / unsentDraftSummary", () => {
  const img = (id: string, blobKey: string) => ({ id, blobKey, name: `${id}.jpg`, kind: "image" as const, bytes: 10, w: 1, h: 1 });

  it("appends to the stored draft keeping form, title and status", async () => {
    const ck = newDraft();
    const scope = staffNewScope(ck);
    await saveDraft(P1, scope, { form: { district: "СБД" }, media: [img("a", "blob:a")], titleHint: "СБД", status: "queued" });
    expect(await appendDraftMedia(P1, scope, [img("b", "blob:b"), img("a", "blob:a")])).toBe(true);
    const d = await loadDraft<{ district: string }>(P1, scope);
    expect(d?.form).toEqual({ district: "СБД" });
    expect(d?.media.map((m) => m.id)).toEqual(["a", "b"]);
    const [entry] = await listDrafts(P1);
    expect(entry).toMatchObject({ clientKey: ck, titleHint: "СБД", status: "queued", photoCount: 2 });
  });

  it("creates the draft when nothing was saved yet, never revives a discarded one", async () => {
    const scope = staffNewScope(newDraft());
    expect(await appendDraftMedia(P1, scope, [img("x", "blob:x")])).toBe(true);
    expect((await loadDraft(P1, scope))?.media).toHaveLength(1);
    await discardDraft(draftKey(P1, scope), { undoMs: 0 });
    expect(await appendDraftMedia(P1, scope, [img("y", "blob:y")])).toBe(false);
    expect(await loadDraft(P1, scope)).toBeNull();
  });

  it("counts unsent editing drafts and their photos (queued ones are counted as submits elsewhere)", async () => {
    const a = newDraft();
    const b = newDraft();
    await saveDraft(P1, staffNewScope(a), { form: {}, media: [img("1", "blob:1"), img("2", "blob:2")] });
    await saveDraft(P1, staffNewScope(b), { form: {}, media: [img("3", "blob:3")] });
    await setDraftStatus(P1, b, "queued");
    await saveDraft(P1, sheetScope("prop", "owner"), { form: { x: 1 } });
    await saveDraft(P2, staffNewScope(newDraft()), { form: {}, media: [img("4", "blob:4")] });
    expect(await unsentDraftSummary(P1)).toEqual({ drafts: 2, photos: 2 });
    expect(await unsentDraftSummary(P2)).toEqual({ drafts: 1, photos: 1 });
  });
});
