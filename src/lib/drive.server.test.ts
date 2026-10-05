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
