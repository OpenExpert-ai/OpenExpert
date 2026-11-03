// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { documentReads } from "./read-evidence";

describe("document reads", () => {
  it("shows only successful reads with text, not searches, failed reads or empty results", () => {
    expect(
      documentReads([
        { type: "tool-search_drive", state: "output-available", output: { files: [{ id: "x" }] } },
        {
          type: "tool-read_drive_file",
          state: "output-error",
          output: { id: "bad", content: "text" },
        },
        {
          type: "tool-read_drive_file",
          state: "output-available",
          output: { id: "denied", content: null },
        },
        {
          type: "tool-read_local_file",
          state: "output-available",
          output: {
            path: "/x",
            name: "x",
            content: "abc",
            modifiedTime: "2026-01-01T12:00:00Z",
            offset: 1,
            hasMore: true,
          },
        },
        {
          type: "tool-read_notion_page",
          state: "output-available",
          output: { pageId: "p", content: "page", hasMore: false },
        },
      ]),
    ).toEqual([
      {
        kind: "local",
        identifier: "/x",
        name: "x",
        modifiedTime: "2026-01-01T12:00:00Z",
        offset: 1,
        partial: true,
      },
      { kind: "notion", identifier: "p", name: "p", partial: false },
    ]);
  });
  it("accepts only an actual HTTPS Google Drive or Docs link returned by a read", () => {
    const part = (webViewLink: string) => ({
      type: "tool-read_drive_file",
      state: "output-available",
      output: { id: "d", content: "text", webViewLink },
    });
    expect(documentReads([part("https://docs.google.com/document/d/abc/edit")])[0]?.url).toBe(
      "https://docs.google.com/document/d/abc/edit",
    );
    for (const url of [
      "javascript:alert(1)",
      "http://drive.google.com/file",
      "https://drive.google.com.evil.test/file",
      "https://user@docs.google.com/file",
    ]) {
      expect(documentReads([part(url)])[0]?.url).toBeUndefined();
    }
  });
  it("marks later windows and partial characters as partial, even at the end of a document", () => {
    expect(
      documentReads([
        {
          type: "tool-read_drive_file",
          state: "output-available",
          output: { id: "d", name: "Doc", content: "last", offset: 2001 },
        },
      ])[0]?.partial,
    ).toBe(true);
    expect(
      documentReads([
        {
          type: "tool-read_drive_file",
          state: "output-available",
          output: { id: "d", content: "last", offset: 1, charOffset: 5 },
        },
      ])[0]?.partial,
    ).toBe(true);
  });
});
