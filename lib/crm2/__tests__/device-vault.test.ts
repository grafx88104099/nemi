import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canOpenRecord,
  generateDeviceKey,
  memoryKv,
  open,
  openBytesWithKey,
  openWithKey,
  seal,
  sealBytesWithKey,
  sealWithKey,
  setCrm2KvFactoryForTests,
  wipeVault,
  type Crm2StoreName,
  type Kv,
} from "@/lib/crm2/device/vault";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

describe("vault (node webcrypto key)", () => {
  it("seal/open round-trip; ct does not contain plaintext", async () => {
    const key = await generateDeviceKey();
    expect(key.extractable).toBe(false);
    const rec = await sealWithKey(key, { phone: "99112233", name: "Бат" }, { profileId: P1, ttlMs: 60_000 });
    expect(rec.v).toBe(1);
    expect(rec.profileId).toBe(P1);
    expect(typeof rec.iv).toBe("string");
    expect(JSON.stringify(rec)).not.toContain("99112233");
    expect(await openWithKey(key, rec, { profileId: P1 })).toEqual({ phone: "99112233", name: "Бат" });
  });

  it("expired → null", async () => {
    const key = await generateDeviceKey();
    const rec = await sealWithKey(key, "x", { profileId: P1, ttlMs: 1000, now: 1_000 });
    expect(await openWithKey(key, rec, { now: 1_500 })).toBe("x");
    expect(await openWithKey(key, rec, { now: 2_000 })).toBeNull();
  });

  it("other profile → null; unbound ('') record opens for any profile", async () => {
    const key = await generateDeviceKey();
    const rec = await sealWithKey(key, 1, { profileId: P1, ttlMs: 60_000 });
    expect(await openWithKey(key, rec, { profileId: P2 })).toBeNull();
    const unbound = await sealWithKey(key, "share", { profileId: "", ttlMs: 60_000 });
    expect(await openWithKey(key, unbound, { profileId: P2 })).toBe("share");
  });

  it("tampered profileId/expiresAt fails authentication (AAD)", async () => {
    const key = await generateDeviceKey();
    const rec = await sealWithKey(key, "secret", { profileId: P1, ttlMs: 60_000 });
    expect(await openWithKey(key, { ...rec, profileId: P2 }, { profileId: P2 })).toBeNull();
    expect(await openWithKey(key, { ...rec, expiresAt: rec.expiresAt + 1e9 })).toBeNull();
  });

  it("a different key cannot open (wipe semantics)", async () => {
    const a = await generateDeviceKey();
    const b = await generateDeviceKey();
    const rec = await sealWithKey(a, { k: 1 }, { profileId: P1, ttlMs: 60_000 });
    expect(await openWithKey(b, rec)).toBeNull();
  });

  it("binary variant round-trips", async () => {
    const key = await generateDeviceKey();
    const bytes = new Uint8Array([1, 2, 3, 250, 0, 7]);
    const rec = await sealBytesWithKey(key, bytes, { profileId: P1, ttlMs: 60_000 });
    expect(rec.ct).toBeInstanceOf(ArrayBuffer);
    expect([...((await openBytesWithKey(key, rec, { profileId: P1 })) ?? [])]).toEqual([...bytes]);
    expect(await openBytesWithKey(key, rec, { profileId: P2 })).toBeNull();
  });

  it("canOpenRecord rejects malformed records", () => {
    expect(canOpenRecord(null)).toBe(false);
    expect(canOpenRecord({ v: 2, profileId: P1, expiresAt: Date.now() + 1000 })).toBe(false);
    expect(canOpenRecord({ v: 1, profileId: P1, expiresAt: "x" })).toBe(false);
  });
});

describe("vault with device key in (memory) store", () => {
  const stores = new Map<Crm2StoreName, Kv>();
  beforeEach(() => {
    stores.clear();
    setCrm2KvFactoryForTests((name) => {
      const kv = memoryKv();
      stores.set(name, kv);
      return kv;
    });
  });
  afterEach(() => setCrm2KvFactoryForTests(null));

  it("deviceKey is created once and reused; wipe makes records unreadable", async () => {
    const rec = await seal({ a: 1 }, { profileId: P1, ttlMs: 60_000 });
    expect(await open(rec, { profileId: P1 })).toEqual({ a: 1 });
    const keys = await stores.get("keys")!.entries();
    expect(keys).toHaveLength(1);
    await wipeVault();
    expect(await stores.get("keys")!.entries()).toHaveLength(0);
    expect(await open(rec, { profileId: P1 })).toBeNull();
  });
});
