// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal valid .docx (see office.test.ts) to exercise the Office branch.
const DOCX_B64 =
  "UEsDBBQAAAAIAPgGRl15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgA+AZGXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAPgGRl3AyjE4rgAAAAgBAAARAAAAd29yZC9kb2N1bWVudC54bWxtj9EKwjAMRX+l9N11+iAy1vkgiB+gH1DbuA3apLSdc39vKwxBfDnhkuTepD2+nGVPCHEklHxb1ZwBajIj9pLfrufNgbOYFBplCUHyBSI/du3cGNKTA0wsG2BsZsmHlHwjRNQDOBUr8oC596DgVMoy9GKmYHwgDTFmf2fFrq73wqkRebG8k1lK9QWhIHUXsoq5CQ21oujC8KH/HT1NEDwxA5atx/1bEmuQ+D7RvQFQSwECFAMUAAAACAD4BkZdeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAPgGRl2b/TfqrQAAACkBAAALAAAAAAAAAAAAAACAARkBAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIAPgGRl3AyjE4rgAAAAgBAAARAAAAAAAAAAAAAACAAe8BAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAADMAgAAAAA=";

vi.mock("./drive-tokens.server", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("drive.server readFile", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a file that is not in the granted set", async () => {
    const { readFile } = await import("./drive.server");
    const out = await readFile("f1", []);
    expect(out.content).toBeNull();
    expect((out as { note?: string }).note).toContain("Picker");
  });

  it("reads a granted text file", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("fields=")) {
        return json({
          id: "f1",
          name: "notas.txt",
          mimeType: "text/plain",
          modifiedTime: "2026-01-01",
        });
      }
      return new Response("contenido de texto", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { readFile } = await import("./drive.server");
    const out = await readFile("f1", ["f1"]);
    expect(out.content).toBe("contenido de texto");
    expect(out.name).toBe("notas.txt");
  });

  it("extracts text from a granted .docx", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("fields=")) {
        return json({
          id: "f2",
          name: "doc.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          modifiedTime: "2026-01-01",
        });
      }
      return new Response(Buffer.from(DOCX_B64, "base64"), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { readFile } = await import("./drive.server");
    const out = await readFile("f2", ["f2"]);
    expect(out.content).toContain("Hola mundo");
  });

  it("throws when updating a file that is not granted", async () => {
    const { updateFile } = await import("./drive.server");
    await expect(updateFile("f9", "x", [])).rejects.toThrow(/permiso/i);
  });

  it("sends every Drive request with a deadline", async () => {
    // Undici's fetch never times out on its own: without this signal a host that stops answering
    // kept the chat turn streaming until the user pressed Stop.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ id: "f3", name: "a.txt", mimeType: "text/plain", modifiedTime: "2026-01-01" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { readFile } = await import("./drive.server");
    await readFile("f3", ["f3"]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("drive.server createFile", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("uploads a new file and returns its metadata", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        id: "new1",
        name: "informe.md",
        mimeType: "text/markdown",
        modifiedTime: "2026-01-01",
        webViewLink: "https://drive.google.com/new1",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createFile } = await import("./drive.server");
    const out = await createFile("informe.md", "# hola", "markdown", null);
    expect(out.id).toBe("new1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

/** A body delivered in `chunk`-sized pieces, counting the pieces that were actually pulled: the
 *  point is that the reader stops pulling once the cap is crossed, not that the text is short. */
function streamedBody(size: number, chunk: number) {
  let pulled = 0;
  let stopped = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (pulled * chunk > size) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(chunk).fill(65));
    },
    cancel() {
      stopped = true;
    },
  });
  return { body, pulled: () => pulled, cancelled: () => stopped };
}

const MB = 1024 * 1024;

describe("drive.server readFile size limits", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it("refuses a file from its metadata, before downloading the body", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("fields="))
        return json({
          id: "big",
          name: "informe.pdf",
          mimeType: "application/pdf",
          modifiedTime: "2026-01-01",
          size: String(30_000_000),
        });
      throw new Error("no debería descargar el cuerpo");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { readFile } = await import("./drive.server");
    const out = await readFile("big", ["big"]);
    expect(out.content).toBeNull();
    expect((out as { note?: string }).note).toContain("25 MB");
    // Only the metadata request: `size` decides before any media call is made.
    expect(calls).toHaveLength(1);
  });

  it("stops reading a text body that goes over the cap", async () => {
    const stream = streamedBody(80 * MB, MB);
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("fields="))
        return json({
          id: "t1",
          name: "notas.txt",
          mimeType: "text/plain",
          modifiedTime: "2026-01-01",
          size: "1024",
        });
      return new Response(stream.body, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { readFile } = await import("./drive.server");
    const out = await readFile("t1", ["t1"]);
    expect(out.content).toBeNull();
    expect((out as { note?: string }).note).toContain("25 MB");
    // 25 pieces fill the cap and the 26th crosses it; the other 54 never reach memory.
    expect(stream.pulled()).toBeLessThan(80);
    expect(stream.pulled()).toBeLessThanOrEqual(27);
  });

  it("trusts a Content-Length over the cap and never touches the body", async () => {
    const stream = streamedBody(80 * MB, MB);
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("fields="))
        return json({
          id: "t2",
          name: "notas.txt",
          mimeType: "text/plain",
          modifiedTime: "2026-01-01",
          size: "1024",
        });
      return new Response(stream.body, {
        status: 200,
        headers: { "content-length": String(40 * 1000 * 1000) },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { readFile } = await import("./drive.server");
    const out = await readFile("t2", ["t2"]);
    expect(out.content).toBeNull();
    expect((out as { note?: string }).note).toContain("25 MB");
    // The first piece may already be queued by the Response wrapper; the other 79 are not read
    // and the stream is cancelled instead of drained.
    expect(stream.pulled()).toBeLessThanOrEqual(1);
    expect(stream.cancelled()).toBe(true);
  });

  it("applies the same cap to a Google Docs export", async () => {
    const stream = streamedBody(60 * MB, MB);
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("fields="))
        return json({
          id: "d1",
          name: "acta",
          mimeType: "application/vnd.google-apps.document",
          modifiedTime: "2026-01-01",
        });
      if (u.includes("/export")) return new Response(stream.body, { status: 200 });
      throw new Error(`petición inesperada: ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { readFile } = await import("./drive.server");
    const out = await readFile("d1", ["d1"]);
    expect(out.content).toBeNull();
    expect((out as { note?: string }).note).toContain("25 MB");
    expect(stream.pulled()).toBeLessThan(60);
  });
});

/** Just the fields the window tests look at: the union return has a shape per branch. */
type WindowRead = {
  content: string | null;
  totalChars: number;
  totalLines?: number;
  truncated?: boolean;
  hasMore?: boolean;
  nextOffset?: number;
  nextCharOffset?: number;
  note?: string;
};

describe("drive.server readFile windows", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  /** The document from the task: 35.000 characters, short lines, so the cap cuts inside one and
   *  the cursor has both halves. */
  const DOC = Array.from({ length: 400 }, (_, i) =>
    `Párrafo ${i}: ${"texto de relleno ".repeat(5)}`.padEnd(100, "."),
  )
    .join("\n")
    .slice(0, 35_000);

  const stubDrive = (text: string) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.includes("fields="))
          return json({
            id: "d1",
            name: "acta",
            mimeType: "application/vnd.google-apps.document",
            modifiedTime: "2026-01-01",
          });
        if (u.includes("/export")) return new Response(text, { status: 200 });
        throw new Error(`petición inesperada: ${u}`);
      }),
    );
  };

  it("reads a 35.000-character document whole in two calls", async () => {
    stubDrive(DOC);
    const { readFile } = await import("./drive.server");
    const first = (await readFile("d1", ["d1"])) as unknown as WindowRead;
    expect(DOC).toHaveLength(35_000);
    expect(first.content).not.toBeNull();
    expect(first.content!.length).toBeLessThanOrEqual(20_000);
    expect(first.totalChars).toBe(35_000);
    // The cap fell inside a line, so the cursor names the line and the character in it.
    expect(first.truncated).toBe(true);
    expect(first.hasMore).toBe(true);
    expect(first.nextOffset).toBeGreaterThan(0);
    expect(first.nextCharOffset).toBeGreaterThan(0);

    const rest = (await readFile("d1", ["d1"], {
      offset: first.nextOffset,
      charOffset: first.nextCharOffset,
    })) as unknown as WindowRead;
    // Nothing repeated and nothing skipped: the two answers are the document.
    expect(first.content! + rest.content).toBe(DOC);
    expect(rest.hasMore).toBeUndefined();
    expect(rest.nextOffset).toBeUndefined();
    expect(rest.truncated).toBeUndefined();
  });

  it("returns a document that fits whole, with no cursor to follow", async () => {
    stubDrive("Hola\nmundo");
    const { readFile } = await import("./drive.server");
    const out = (await readFile("d1", ["d1"])) as unknown as WindowRead;
    expect(out.content).toBe("Hola\nmundo");
    expect(out.totalLines).toBe(2);
    expect(out.totalChars).toBe(10);
    expect(out.hasMore).toBeUndefined();
    expect(out.nextOffset).toBeUndefined();
    expect(out.truncated).toBeUndefined();
  });

  it("says where the document ends when the offset is past the last line", async () => {
    stubDrive("uno\ndos");
    const { readFile } = await import("./drive.server");
    const out = (await readFile("d1", ["d1"], { offset: 9 })) as unknown as WindowRead;
    expect(out.content).toBeNull();
    expect(String(out.note)).toContain("2 línea(s)");
    expect(String(out.note)).toContain("9");
  });

  it("walks a one-line document by character, since lines cannot continue it", async () => {
    const oneLine = "x".repeat(35_000);
    stubDrive(oneLine);
    const { readFile } = await import("./drive.server");
    const first = (await readFile("d1", ["d1"])) as unknown as WindowRead;
    expect(first.totalLines).toBe(1);
    expect(first.content).toHaveLength(20_000);
    expect(first.nextOffset).toBe(1);
    const rest = (await readFile("d1", ["d1"], {
      offset: 1,
      charOffset: first.nextCharOffset,
    })) as unknown as WindowRead;
    expect(first.content! + rest.content).toBe(oneLine);
  });
});
