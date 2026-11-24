import { describe, expect, it } from "vitest";

import {
  accountInitials,
  avatarExtension,
  avatarFileNameFromUrl,
  avatarObjectPath,
  isOwnAvatarPath,
  randomAvatarNonce,
  squareCrop,
} from "@/lib/avatar-upload";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NONCE = "3b241101-e2bb-4255-8caf-4136c566a962";

describe("бүртгэлийн зургийн зам", () => {
  it("өөрийн хавтас, бидний үүсгэдэг нэр л зөвшөөрөгдөнө", () => {
    const path = avatarObjectPath(ME, NONCE, "webp");
    expect(path).toBe(`${ME}/${NONCE}.webp`);
    expect(isOwnAvatarPath(ME, path)).toBe(true);
    expect(isOwnAvatarPath(ME, avatarObjectPath(ME, NONCE, "jpg"))).toBe(true);
  });

  it.each([
    [`${OTHER}/${NONCE}.webp`, "өөр хэрэглэгчийн хавтас"],
    [`${ME}/../${OTHER}/${NONCE}.webp`, "зам дамжуулалт"],
    [`${ME}/sub/${NONCE}.webp`, "дэд хавтас"],
    [`${ME}/${NONCE}.png`, "зөвшөөрөгдөөгүй өргөтгөл"],
    [`${ME}/${NONCE}.webp.html`, "давхар өргөтгөл"],
    [`${ME}/a.webp`, "хэт богино нэр"],
    [`/${ME}/${NONCE}.webp`, "эхний налуу зураас"],
    [`${NONCE}.webp`, "хавтасгүй"],
  ])("%s — %s татгалзана", (path) => {
    expect(isOwnAvatarPath(ME, path)).toBe(false);
  });

  it("буруу хэлбэрийн хэрэглэгчийн id-д юуг ч зөвшөөрөхгүй", () => {
    expect(isOwnAvatarPath("..", `../${NONCE}.webp`)).toBe(false);
    expect(isOwnAvatarPath("", `/${NONCE}.webp`)).toBe(false);
  });
});

describe("агентын картын файлыг хамгаалах, санамсаргүй нэр", () => {
  const SUPABASE = "https://abc.supabase.co/storage/v1/object/public/avatars";

  it("тухайн хэрэглэгчийн хавтас дахь файлын нэр; бусад холбоос null", () => {
    expect(avatarFileNameFromUrl(ME, `${SUPABASE}/${ME}/${NONCE}.webp`)).toBe(`${NONCE}.webp`);
    expect(avatarFileNameFromUrl(ME, `${SUPABASE}/${ME}/${NONCE}.webp?v=1`)).toBe(`${NONCE}.webp`);
    expect(avatarFileNameFromUrl(OTHER, `${SUPABASE}/${ME}/${NONCE}.webp`)).toBeNull();
    expect(avatarFileNameFromUrl(ME, "https://lh3.googleusercontent.com/a/xyz")).toBeNull();
    expect(avatarFileNameFromUrl(ME, `https://abc.supabase.co/storage/v1/object/public/listings/${ME}/${NONCE}.webp`)).toBeNull();
    expect(avatarFileNameFromUrl(ME, `${SUPABASE}/${ME}/%E0%A4%A.webp`)).toBeNull();
    expect(avatarFileNameFromUrl(ME, null)).toBeNull();
  });

  it("санамсаргүй нэр: 32 hex, зөвшөөрөгдөх замтай нийцнэ, давхцахгүй", () => {
    const a = randomAvatarNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(isOwnAvatarPath(ME, avatarObjectPath(ME, a, "webp"))).toBe(true);
    expect(randomAvatarNonce()).not.toBe(a);
  });
});

describe("зургийн боловсруулалт", () => {
  it("төвөөс дөрвөлжин тайрна", () => {
    expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 });
    expect(squareCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
    expect(squareCrop(300, 300)).toEqual({ sx: 0, sy: 0, side: 300 });
    expect(squareCrop(0, 0).side).toBe(1);
  });

  it("зөвхөн webp, jpeg-ийг хадгална", () => {
    expect(avatarExtension("image/webp")).toBe("webp");
    expect(avatarExtension("image/jpeg")).toBe("jpg");
    expect(avatarExtension("image/png")).toBeNull();
    expect(avatarExtension("text/html")).toBeNull();
  });

  it("товчлол: нэр, и-мэйл; хоосон бол «Х»", () => {
    expect(accountInitials("Бат Эрдэнэ")).toBe("БЭ");
    expect(accountInitials("amaraa@example.com")).toBe("A");
    expect(accountInitials("")).toBe("Х");
    expect(accountInitials("  ")).toBe("Х");
  });
});
