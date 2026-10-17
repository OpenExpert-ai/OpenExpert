// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ current: "google" as string }));
const generate = vi.hoisted(() => vi.fn());

vi.mock("./opencore/model-provider.server", () => ({
  selectedProvider: () => provider.current,
  getLanguageModel: () => ({ id: "fake-model" }),
}));
vi.mock("ai", () => ({ generateText: generate }));

const { pdfTextWithVision, visionAvailable } = await import("./vision-pdf.server");

beforeEach(() => {
  generate.mockReset();
  provider.current = "google";
});

describe("pdfTextWithVision", () => {
  it("says why it cannot, instead of uploading anyway, when the provider cannot see documents", async () => {
    provider.current = "ollama";
    const r = await pdfTextWithVision(new Uint8Array([1, 2, 3]));
    expect(r.text).toBeNull();
    expect(r.note).toContain("no puede ver documentos");
    // The point of the note: nothing was sent anywhere.
    expect(generate).not.toHaveBeenCalled();
  });

  it("transcribes through the active model when it can", async () => {
    generate.mockResolvedValue({ text: "  FACTURA 2026-001\nTotal: 1.234,00 €  " });
    const r = await pdfTextWithVision(new Uint8Array([1, 2, 3]));
    expect(r.text).toBe("FACTURA 2026-001\nTotal: 1.234,00 €");
    // What comes back feeds a search and a read, so the document goes as a document: no summary
    // instruction can be smuggled in without this test noticing.
    const args = generate.mock.calls[0]?.[0] as { messages: { content: { type: string }[] }[] };
    const parts = args.messages[0]?.content ?? [];
    expect(parts.map((p) => p.type)).toEqual(["text", "file"]);
  });

  it("turns an empty answer and a failure into a note, not a crash", async () => {
    generate.mockResolvedValue({ text: "   " });
    expect((await pdfTextWithVision(new Uint8Array())).note).toContain("no devolvió texto");
    generate.mockRejectedValue(new Error("429"));
    const failed = await pdfTextWithVision(new Uint8Array());
    expect(failed.text).toBeNull();
    expect(failed.note).toContain("429");
  });

  it("reports availability as a shape, not a throw", () => {
    expect(visionAvailable().ok).toBe(true);
    provider.current = "openai-compatible";
    const no = visionAvailable();
    expect(no.ok).toBe(false);
    expect(no.note).toBeTruthy();
  });
});
