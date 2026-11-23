import { describe, it, expect } from "vitest";

import { localDigitsInput, maskPhone, otpSmsText, phoneVerifyPatch, toMnE164, isMnPhoneDigits } from "@/lib/auth/phone-login";

describe("toMnE164", () => {
  it("Монгол гар утсыг хүлээн авна", () => {
    for (const raw of ["99112233", "+976 9911-2233", "0097699112233", "97699112233"]) {
      expect(toMnE164(raw)).toBe("+97699112233");
    }
    expect(toMnE164("88112233")).toBe("+97688112233");
  });
  it("бусдыг татгалзана", () => {
    for (const raw of ["7011223", "10112233", "50112233", "+1 415 555 0100", "", "9911223", "991122334"]) {
      expect(toMnE164(raw)).toBeNull();
    }
    expect(toMnE164(null)).toBeNull();
  });
  it("isMnPhoneDigits нь жигдрүүлсэн цифр шаардана", () => {
    expect(isMnPhoneDigits("97699112233")).toBe(true);
    expect(isMnPhoneDigits("+97699112233")).toBe(false);
    expect(isMnPhoneDigits("14155550100")).toBe(false);
  });
});

describe("localDigitsInput", () => {
  it("буулгасан угтварыг хасаж 8 цифр үлдээнэ", () => {
    expect(localDigitsInput("+976 9911 2233")).toBe("99112233");
    expect(localDigitsInput("00976 88112233")).toBe("88112233");
    expect(localDigitsInput("9911223344")).toBe("99112233");
    expect(localDigitsInput("9911-22")).toBe("991122");
    expect(localDigitsInput("abc")).toBe("");
    // 8 цифртэй «976…» нь дотоод дугаар байж болно — хасахгүй.
    expect(localDigitsInput("97612345")).toBe("97612345");
  });
});

describe("otpSmsText", () => {
  it("анхдагч бичвэр: код 2 удаа, WebOTP мөрөөр төгсөнө", () => {
    const t = otpSmsText("123456", undefined, "www.nemi.mn");
    expect(t.split("123456")).toHaveLength(3);
    expect(t.endsWith("@www.nemi.mn #123456")).toBe(true);
  });
  it("{code}-гүй загвар → анхдагч", () => {
    expect(otpSmsText("111111", "Code here", "www.nemi.mn")).toBe(otpSmsText("111111", undefined, "www.nemi.mn"));
  });
  it("{code}/{host} орлуулна", () => {
    expect(otpSmsText("42", "Nemi code {code} @{host} #{code}", "nemi.mn")).toBe("Nemi code 42 @nemi.mn #42");
  });
});

describe("maskPhone", () => {
  it("сүүлийн 4 цифр л", () => {
    expect(maskPhone("97699112233")).toBe("****2233");
  });
});

describe("phoneVerifyPatch (markPhoneVerified-ийн бичилт)", () => {
  const NOW = "2026-11-23T00:00:00.000Z";
  it("профайлын утас хоосон → auth утсыг бичиж баталгаажуулна", () => {
    expect(phoneVerifyPatch(null, "97699110000", NOW)).toEqual({ phone: "+97699110000", phone_verified_at: NOW });
    expect(phoneVerifyPatch("  ", "97699110000", NOW)).toEqual({ phone: "+97699110000", phone_verified_at: NOW });
  });
  it("ижил дугаар (өөр бичлэгээр) → зөвхөн phone_verified_at, утсыг хэвээр", () => {
    expect(phoneVerifyPatch("9911 0000", "97699110000", NOW)).toEqual({ phone_verified_at: NOW });
    expect(phoneVerifyPatch("+976 99110000", "97699110000", NOW)).toEqual({ phone_verified_at: NOW });
  });
  it("өөр дугаар → юу ч бичихгүй (хадгалсан холбоо барих дугаарыг дарахгүй)", () => {
    expect(phoneVerifyPatch("88112233", "97699110000", NOW)).toBeNull();
  });
  it("auth утас Монгол гар утас биш → null", () => {
    expect(phoneVerifyPatch(null, "14155550100", NOW)).toBeNull();
  });
});
