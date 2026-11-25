import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crm2Kv, memoryKv, setCrm2KvFactoryForTests } from "@/lib/crm2/device/vault";
import { discardDraft, draftKey, getBlob, getBlobRecord, newDraft, putBlob, saveDraft, staffNewScope } from "@/lib/crm2/device/draft-store";
import {
  AUTO_VIDEO_MAX_BYTES,
  BACKOFF_MS,
  MAX_AUTO_ATTEMPTS,
  NOT_PDF_ERROR,
  afterFailure,
  backoffDelay,
  bindProperty,
  configureQueueForTests,
  connectionKind,
  dropWaitingFor,
  enqueue,
  initialStatus,
  isPermanentUploadFailure,
  listQueue,
  pickNext,
  remove,
  retry,
  startQueue,
  summarize,
  videoMayAutoSend,
  waitWifiLabel,
  whenIdle,
  type QueueItem,
  type QueueTarget,
  type Uploaders,
} from "@/lib/crm2/device/upload-queue";

const P1 = "11111111-1111-4111-8111-111111111111";
const OFFICE = "33333333-3333-4333-8333-333333333333";
const PROP = "44444444-4444-4444-8444-444444444444";
const mediaLimits = { maxImageMb: 15, maxVideoMb: 200, maxImages: 40, maxVideos: 3 };
const docLimits = { maxDocMb: 20, maxDocsPerContract: 10 };

let calls: { kind: string; name: string; target: unknown; size: number; type: string }[] = [];
let fail = false;
/** Дахин оролдоход засрахгүй алдаа (storage.ts / addBrokerageFileRow field 'file'). */
let failField: string | undefined;
let clock = 1_000_000;

const failure = () => ({ ok: false as const, error: "x", ...(failField ? { field: failField } : {}) });

const uploaders: Uploaders = {
  media: async (file, target) => {
    calls.push({ kind: "media", name: file.name, target, size: file.size, type: file.type });
    return fail ? failure() : { ok: true, data: null };
  },
  brokerage: async (file, target) => {
    calls.push({ kind: "brokerage", name: file.name, target, size: file.size, type: file.type });
    return fail ? failure() : { ok: true, data: null };
  },
};

beforeEach(() => {
  setCrm2KvFactoryForTests(() => memoryKv());
  calls = [];
  fail = false;
  failField = undefined;
  clock = 1_000_000;
  configureQueueForTests({
    uploaders,
    now: () => clock,
    online: () => true,
    net: () => "cellular",
    setTimer: () => null,
    clearTimer: () => undefined,
  });
});

afterEach(() => {
  configureQueueForTests(null);
  setCrm2KvFactoryForTests(null);
});

const mediaTarget = (clientKey: string, propertyId: string | null = null): QueueTarget => ({
  kind: "media",
  propertyId,
  clientKey,
  officeId: OFFICE,
  limits: mediaLimits,
});

describe("pure", () => {
  it("backoff 2/5/15/60 s", () => {
    expect(BACKOFF_MS).toEqual([2000, 5000, 15000, 60000]);
    expect([1, 2, 3, 4, 5, 9].map(backoffDelay)).toEqual([2000, 5000, 15000, 60000, 60000, 60000]);
  });

  it("failures retry with backoff, then stay as failed (never dropped)", () => {
    let it = { id: "a", attempts: 0, status: "uploading", nextAt: 0 } as QueueItem;
    for (let k = 1; k < MAX_AUTO_ATTEMPTS; k++) {
      it = afterFailure(it, "e", 100);
      expect(it.status).toBe("queued");
      expect(it.nextAt).toBe(100 + backoffDelay(k));
    }
    it = afterFailure(it, "e", 100);
    expect(it.status).toBe("failed");
    expect(it.permanent).toBe(false); // автомат оролдлого дууссан — хэрэглэгч «Дахин оролдох» дарж болно
    expect(summarize([it])).toEqual({ pending: 0, failed: 1 });
  });

  it("permanent failure (not PDF, too large, already has a PDF) → failed at once, flagged permanent", () => {
    const it0 = { id: "a", attempts: 0, status: "uploading", nextAt: 0 } as QueueItem;
    expect(afterFailure(it0, "Гэрээ зөвхөн PDF", 100, true)).toMatchObject({
      status: "failed",
      attempts: 1,
      error: "Гэрээ зөвхөн PDF",
      permanent: true,
    });
    expect(afterFailure(it0, "e", 100, false).status).toBe("queued");
    expect(isPermanentUploadFailure({ ok: false, error: "x", field: "file" })).toBe(true);
    expect(isPermanentUploadFailure({ ok: false, error: "x" })).toBe(false);
    expect(isPermanentUploadFailure({ ok: false, error: "x", field: "end_date" })).toBe(false);
    expect(isPermanentUploadFailure({ ok: true, data: null })).toBe(false);
  });

  it("videos wait for Wi-Fi unless allowed", () => {
    const base = { profileId: P1, nextAt: 0, createdAt: 1 } as Partial<QueueItem>;
    const v = { ...base, id: "v", status: "waiting_wifi", isVideo: true } as QueueItem;
    expect(pickNext([v], { now: 1, net: "cellular", profileId: P1 })).toBeNull();
    expect(pickNext([v], { now: 1, net: "wifi", profileId: P1 })?.id).toBe("v");
    expect(pickNext([{ ...v, allowCellular: true }], { now: 1, net: "cellular", profileId: P1 })?.id).toBe("v");
  });

  it("connectionKind: iPhone (API-гүй) — тодорхойгүй, мобайл дата биш", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    expect(connectionKind({ userAgent: iphone })).toBe("unknown");
    expect(connectionKind({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe("wifi");
    expect(connectionKind({ connection: { type: "wifi" }, userAgent: "Android Mobile" })).toBe("wifi");
    expect(connectionKind({ connection: { type: "cellular" }, userAgent: "Android Mobile" })).toBe("cellular");
    expect(connectionKind({ connection: { saveData: true }, userAgent: "Android Mobile" })).toBe("cellular");
    expect(connectionKind({ connection: {}, userAgentData: { mobile: true } })).toBe("unknown");
    expect(connectionKind(null)).toBe("wifi");
  });

  it("«Wi-Fi хүлээх» шошго бодит дүрэмтэй таарна (iPhone: зөвхөн 15 МБ-аас томыг)", () => {
    expect(waitWifiLabel("unknown")).toBe("15 МБ-аас томыг Wi-Fi-д хүлээх");
    expect(waitWifiLabel("cellular")).toBe("Wi-Fi холбогдтол хүлээх");
    expect(waitWifiLabel("wifi")).toBe("Wi-Fi холбогдтол хүлээх");
    // Шошго хэлсэнтэй ижил: сонголттой (allowCellular=false) үед ч 15 МБ хүртэлх нь шууд явна.
    const target = mediaTarget("c", PROP);
    expect(initialStatus(target, true, "unknown", AUTO_VIDEO_MAX_BYTES, false)).toBe("queued");
    expect(initialStatus(target, true, "unknown", AUTO_VIDEO_MAX_BYTES + 1, false)).toBe("waiting_wifi");
  });

  it("сүлжээ тодорхойгүй: жижиг бичлэг шууд, том нь асууна; мобайл датад хэзээ ч автоматаар биш", () => {
    const small = 5 * 1024 * 1024;
    const big = AUTO_VIDEO_MAX_BYTES + 1;
    expect(videoMayAutoSend(small, "unknown")).toBe(true);
    expect(videoMayAutoSend(AUTO_VIDEO_MAX_BYTES, "unknown")).toBe(true);
    expect(videoMayAutoSend(big, "unknown")).toBe(false);
    expect(videoMayAutoSend(0, "unknown")).toBe(false);
    expect(videoMayAutoSend(small, "cellular")).toBe(false);
    expect(videoMayAutoSend(big, "wifi")).toBe(true);

    const target = mediaTarget("c", PROP);
    expect(initialStatus(target, true, "unknown", small)).toBe("queued");
    expect(initialStatus(target, true, "unknown", big)).toBe("waiting_wifi");
    expect(initialStatus(target, true, "unknown", big, true)).toBe("queued");
    expect(initialStatus(target, false, "cellular", big)).toBe("queued");

    const base = { profileId: P1, nextAt: 0, createdAt: 1, isVideo: true, status: "waiting_wifi" } as Partial<QueueItem>;
    const parkedSmall = { ...base, id: "s", bytes: small } as QueueItem;
    const parkedBig = { ...base, id: "b", bytes: big } as QueueItem;
    // Өмнөх хувилбар iPhone-д жижиг бичлэгийг ч зогсоосон — одоо суллагдана.
    expect(pickNext([parkedSmall], { now: 1, net: "unknown", profileId: P1 })?.id).toBe("s");
    expect(pickNext([parkedBig], { now: 1, net: "unknown", profileId: P1 })).toBeNull();
    expect(pickNext([{ ...parkedBig, allowCellular: true }], { now: 1, net: "unknown", profileId: P1 })?.id).toBe("b");
  });
});

describe("queue", () => {
  it("enqueue takes blob ownership before the draft is discarded", async () => {
    const ck = newDraft();
    const scope = staffNewScope(ck);
    const blobKey = await putBlob(P1, new File(["jpegdata"], "a.jpg", { type: "image/jpeg" }), "a.jpg");
    await saveDraft(P1, scope, { form: {}, media: [{ id: "m", blobKey, name: "a.jpg", kind: "image", bytes: 8, w: 1, h: 1 }] });
    const item = await enqueue({ profileId: P1, target: mediaTarget(ck), blobKey });
    expect(item.status).toBe("waiting_property");
    expect((await crm2Kv("queue").get<QueueItem>(item.id))?.blobKey).toBe(blobKey);
    const h = await discardDraft(draftKey(P1, scope), { undoMs: 0 });
    await h.done;
    expect(await getBlob(blobKey)).not.toBeNull();
  });

  it("waiting_property → bindProperty releases and uploads; blob deleted after success", async () => {
    const ck = newDraft();
    const blobKey = await putBlob(P1, new File(["jpegdata"], "a.jpg", { type: "image/jpeg" }), "a.jpg");
    await enqueue({ profileId: P1, target: mediaTarget(ck), blobKey });
    await startQueue(P1);
    await whenIdle();
    expect(calls).toHaveLength(0);
    expect(await bindProperty(ck, PROP)).toBe(1);
    await whenIdle();
    expect(calls).toHaveLength(1);
    expect((calls[0].target as { propertyId: string }).propertyId).toBe(PROP);
    expect((await listQueue(P1))[0].status).toBe("done");
    expect(await getBlob(blobKey)).toBeNull();
  });

  it("dropWaitingFor: a re-save after a rejected submit uploads each photo once", async () => {
    const ck = newDraft();
    const blobKey = await putBlob(P1, new File(["jpegdata"], "a.jpg", { type: "image/jpeg" }), "a.jpg");
    await saveDraft(P1, staffNewScope(ck), { form: {}, media: [{ id: "m1", blobKey, name: "a.jpg", kind: "image", bytes: 8, w: 1, h: 1 }] });
    await enqueue({ profileId: P1, target: mediaTarget(ck), blobKey });
    await startQueue(P1);
    await whenIdle();
    expect(await dropWaitingFor(ck)).toBe(1);
    expect(await getBlob(blobKey)).not.toBeNull();
    await enqueue({ profileId: P1, target: mediaTarget(ck, PROP), blobKey });
    expect(await bindProperty(ck, PROP)).toBe(0);
    await startQueue(P1);
    await whenIdle();
    expect(calls).toHaveLength(1);
  });

  it("failed items are kept and retry() succeeds", async () => {
    fail = true;
    await startQueue(P1);
    const item = await enqueue({ profileId: P1, target: mediaTarget("c", PROP), blob: new File(["x"], "x.jpg", { type: "image/jpeg" }) });
    for (let k = 0; k < MAX_AUTO_ATTEMPTS + 2; k++) {
      await whenIdle();
      clock += 120_000;
      await startQueue();
    }
    await whenIdle();
    let rows = await listQueue(P1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].attempts).toBe(MAX_AUTO_ATTEMPTS);
    expect(await getBlobRecord(item.blobKey)).not.toBeNull();
    fail = false;
    await retry(item.id);
    await whenIdle();
    rows = await listQueue(P1);
    expect(rows[0].status).toBe("done");
  });

  it("iPhone (сүлжээ тодорхойгүй): жижиг бичлэг өөрөө явна, том нь «Одоо илгээх» хүртэл хүлээнэ", async () => {
    configureQueueForTests({ uploaders, now: () => clock, online: () => true, net: () => "unknown", setTimer: () => null, clearTimer: () => undefined });
    await startQueue(P1);
    const clip = new File([new Uint8Array(1024)], "clip.mp4", { type: "video/mp4" });
    const big = new File([new Uint8Array(AUTO_VIDEO_MAX_BYTES + 1)], "long.mp4", { type: "video/mp4" });
    const a = await enqueue({ profileId: P1, target: mediaTarget("c", PROP), blob: clip, name: "clip.mp4" });
    const b = await enqueue({ profileId: P1, target: mediaTarget("c", PROP), blob: big, name: "long.mp4" });
    expect(a.status).toBe("queued");
    expect(b.status).toBe("waiting_wifi");
    await whenIdle();
    expect(calls.map((c) => c.name)).toEqual(["clip.mp4"]);
    await retry(b.id);
    await whenIdle();
    expect(calls.map((c) => c.name)).toEqual(["clip.mp4", "long.mp4"]);
  });

  it("формд «Wi-Fi хүлээх»-ийг болиулсан бичлэг мобайл датад ч шууд явна", async () => {
    await startQueue(P1);
    const big = new File([new Uint8Array(AUTO_VIDEO_MAX_BYTES + 1)], "v.mp4", { type: "video/mp4" });
    const item = await enqueue({ profileId: P1, target: mediaTarget("c", PROP), blob: big, name: "v.mp4", allowCellular: true });
    expect(item).toMatchObject({ status: "queued", allowCellular: true });
    await whenIdle();
    expect(calls).toHaveLength(1);
  });

  it("offline pauses without counting attempts", async () => {
    configureQueueForTests({ uploaders, now: () => clock, online: () => false, net: () => "wifi", setTimer: () => null, clearTimer: () => undefined });
    await startQueue(P1);
    await enqueue({ profileId: P1, target: mediaTarget("c", PROP), blob: new File(["x"], "x.jpg", { type: "image/jpeg" }) });
    await whenIdle();
    expect(calls).toHaveLength(0);
    expect((await listQueue(P1))[0]).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("brokerage blobs are sealed at rest and deleted right after success", async () => {
    await startQueue(P1);
    const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], { type: "application/pdf" });
    const item = await enqueue({
      profileId: P1,
      target: { kind: "brokerage", contractId: "k1", fileKind: "contract", officeId: OFFICE, limits: docLimits },
      blob: pdf,
      name: "contract.pdf",
    });
    expect(item.sealed).toBe(true);
    await whenIdle();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "brokerage", name: "contract.pdf", size: 6 });
    expect(await getBlobRecord(item.blobKey)).toBeNull();
  });

  it("contract (fileKind 'contract') must be a PDF: images are rejected at enqueue, nothing stored", async () => {
    const contract = { kind: "brokerage" as const, contractId: "k1", fileKind: "contract" as const, officeId: OFFICE, limits: docLimits };
    for (const [blob, name] of [
      [new Blob(["jpeg"], { type: "image/jpeg" }), "geree.jpg"],
      [new Blob(["png"], { type: "image/png" }), "geree.pdf"],
      [new Blob(["x"], { type: "" }), "geree.jpg"],
    ] as const) {
      await expect(enqueue({ profileId: P1, target: contract, blob, name })).rejects.toThrow(NOT_PDF_ERROR);
    }
    expect(await listQueue(P1)).toHaveLength(0);
    // Ноорогт хадгалсан зургийг гэрээ болгож дараалалд оруулахгүй.
    const blobKey = await putBlob(P1, new File(["jpegdata"], "a.jpg", { type: "image/jpeg" }), "a.jpg");
    await expect(enqueue({ profileId: P1, target: contract, blobKey })).rejects.toThrow(NOT_PDF_ERROR);
    expect(await getBlob(blobKey)).not.toBeNull();
    expect(await listQueue(P1)).toHaveLength(0);
  });

  it("contract PDF with an empty browser type is accepted by extension and uploaded as application/pdf", async () => {
    await startQueue(P1);
    const item = await enqueue({
      profileId: P1,
      target: { kind: "brokerage", contractId: "k1", fileKind: "contract", officeId: OFFICE, limits: docLimits },
      blob: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: "" }),
      name: "scan.PDF",
    });
    expect(item.type).toBe("application/pdf");
    await whenIdle();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "brokerage", name: "scan.PDF", type: "application/pdf" });
  });

  it("ownership images are still allowed", async () => {
    await startQueue(P1);
    await enqueue({
      profileId: P1,
      target: { kind: "brokerage", contractId: "k1", fileKind: "ownership", officeId: OFFICE, limits: docLimits },
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      name: "gerchilgee.jpg",
    });
    await whenIdle();
    expect(calls).toHaveLength(1);
    expect((await listQueue(P1))[0].status).toBe("done");
  });

  it("a validation failure (field 'file') is not retried: failed after one attempt, blob kept", async () => {
    fail = true;
    failField = "file";
    await startQueue(P1);
    const item = await enqueue({
      profileId: P1,
      target: { kind: "brokerage", contractId: "k1", fileKind: "contract", officeId: OFFICE, limits: docLimits },
      blob: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: "application/pdf" }),
      name: "geree.pdf",
    });
    for (let k = 0; k < 3; k++) {
      await whenIdle();
      clock += 120_000;
      await startQueue();
    }
    await whenIdle();
    expect(calls).toHaveLength(1);
    const rows = await listQueue(P1);
    expect(rows[0]).toMatchObject({ status: "failed", attempts: 1, error: "x" });
    expect(await getBlobRecord(item.blobKey)).not.toBeNull();
  });

  it("sealed record holds no plaintext blob", async () => {
    // Хуулахгүйгээр (offline) хадгалсан төлвийг шалгана.
    configureQueueForTests({ uploaders, now: () => clock, online: () => false, net: () => "wifi", setTimer: () => null, clearTimer: () => undefined });
    const item = await enqueue({
      profileId: P1,
      target: { kind: "brokerage", contractId: "k1", fileKind: "ownership", officeId: OFFICE, limits: docLimits },
      blob: new Blob(["SECRET-DOC"], { type: "application/pdf" }),
      name: "own.pdf",
    });
    const rec = await getBlobRecord(item.blobKey);
    expect(rec?.blob).toBeUndefined();
    expect(rec?.sealed?.ct).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(new Uint8Array(rec!.sealed!.ct))).not.toContain("SECRET-DOC");
    await remove(item.id);
    expect(await listQueue(P1)).toHaveLength(0);
  });
});
