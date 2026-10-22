// SPDX-License-Identifier: MIT
// The notices of the configuration file travel as **data**, so the panel can
// write them in the language of the interface. A sentence written on the
// server would stay in Spanish with the interface in English, which is what
// this file checks: the same notice says the same thing in both languages.

import { describe, expect, it } from "vitest";

import { noticeText } from "./config-notices";
import { translate } from "./translate";

const t = (text: string, params?: Record<string, string | number>) => translate("es", text, params);
const tEn = (text: string, params?: Record<string, string | number>) =>
  translate("en", text, params);

describe("noticeText", () => {
  it("dice el campo, el valor y el límite en español", () => {
    const text = noticeText(
      { kind: "limit", field: "chat.maxSteps", value: 100_000, limit: 200 },
      t,
    );
    expect(text).toContain("chat.maxSteps");
    expect(text).toContain("100000");
    expect(text).toContain("200");
    expect(text).toContain("pasos por consulta");
  });

  it("dice lo mismo en inglés, sin dejar nada en español", () => {
    const text = noticeText(
      { kind: "limit", field: "chat.maxSteps", value: 100_000, limit: 200 },
      tEn,
    );
    expect(text).toContain("chat.maxSteps");
    expect(text).toContain("100000");
    expect(text).toContain("200");
    expect(text).toContain("steps per query");
    // The Spanish words would mean the translation is missing.
    expect(text).not.toMatch(/pasos|traídos|días|tokens$/);
  });

  it("cada límite lleva su unidad", () => {
    expect(
      noticeText({ kind: "limit", field: "chat.retentionDays", value: 999_999, limit: 3650 }, tEn),
    ).toContain("days");
    expect(
      noticeText(
        { kind: "limit", field: "ai.maxOutputTokens", value: 100_000_000, limit: 200_000 },
        tEn,
      ),
    ).toContain("tokens");
  });

  it("los patrones descartados se dicen con su número", () => {
    const text = noticeText({ kind: "patterns", dropped: 4950, limit: 50 }, tEn);
    expect(text).toContain("4950");
    expect(text).toContain("50");
    expect(text).toContain("patterns dropped");
  });
});
