import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SmartSearchInput } from "@/components/search/SmartSearchInput";

describe("SmartSearchInput", () => {
  it("жинхэнэ combobox <input> нь name=\"q\"-тэй (JS-гүй GET маягт илгээнэ)", () => {
    const html = renderToString(
      createElement(SmartSearchInput, { defaultValue: "zaisan", placeholder: "Хайх", ariaLabel: "Хайх" })
    );
    const input = html.match(/<input[^>]*>/)?.[0] ?? "";
    expect(input).toContain('role="combobox"');
    expect(input).toContain('name="q"');
    expect(input).toContain('value="zaisan"');
    expect(input).toContain('maxLength="120"');
  });
});
