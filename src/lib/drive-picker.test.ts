// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PickerData = Record<string, unknown> & { action?: string; docs?: unknown[] };
type Cb = (data: PickerData) => void;

/** Resolve once `predicate` is true, polling the microtask queue. */
function flushUntil(predicate: () => boolean, tries = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (tries-- <= 0) return reject(new Error("condition never became true"));
      Promise.resolve().then(tick);
    };
    tick();
  });
}

type EnvOpts = {
  scriptPresent?: boolean;
  scriptFails?: boolean;
  gapiMissing?: boolean;
  pickerMissing?: boolean;
  actionEnum?: { PICKED?: string; CANCEL?: string };
  responseEnum?: { ACTION?: string; DOCUMENTS?: string };
};

function makeEnv(opts: EnvOpts = {}) {
  const calls = {
    gapiLoad: [] as string[],
    appended: false,
    setOAuthToken: undefined as string | undefined,
    setDeveloperKey: undefined as string | undefined,
    setAppId: undefined as string | undefined,
    features: [] as string[],
    views: 0,
    callback: undefined as Cb | undefined,
    visible: undefined as boolean | undefined,
  };

  class FakeDocsView {}
  class FakeBuilder {
    setOAuthToken(t: string) {
      calls.setOAuthToken = t;
      return this;
    }
    setDeveloperKey(k: string) {
      calls.setDeveloperKey = k;
      return this;
    }
    setAppId(a: string) {
      calls.setAppId = a;
      return this;
    }
    addView() {
      calls.views += 1;
      return this;
    }
    setCallback(cb: Cb) {
      calls.callback = cb;
      return this;
    }
    enableFeature(f: string) {
      calls.features.push(f);
      return this;
    }
    setSelectableMimeTypes() {
      return this;
    }
    build() {
      return { setVisible: (v: boolean) => (calls.visible = v) };
    }
  }

  const script = {
    src: "",
    async: false,
    onload: null as null | (() => void),
    onerror: null as null | (() => void),
  };
  const head = {
    appendChild: (s: typeof script) => {
      calls.appended = true;
      if (opts.scriptFails) s.onerror?.();
      else s.onload?.();
    },
  };
  const document = {
    querySelector: vi.fn(() => (opts.scriptPresent ? {} : null)),
    createElement: vi.fn(() => script),
    head,
  };

  const picker = opts.pickerMissing
    ? undefined
    : {
        PickerBuilder: FakeBuilder,
        DocsView: FakeDocsView,
        Action: opts.actionEnum,
        Response: opts.responseEnum,
      };

  const win = {
    gapi: opts.gapiMissing
      ? undefined
      : {
          load: vi.fn((lib: string, cb: () => void) => {
            calls.gapiLoad.push(lib);
            cb();
          }),
        },
    google: picker ? { picker } : undefined,
  };

  vi.stubGlobal("document", document);
  vi.stubGlobal("window", win);
  return { calls, win, document };
}

async function importPicker() {
  vi.resetModules();
  return await import("./drive-picker");
}

beforeEach(() => vi.spyOn(console, "debug").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pickDriveFiles", () => {
  it("loads gapi, builds the picker and resolves the picked files", async () => {
    const { calls } = makeEnv();
    const mod = await importPicker();

    const promise = mod.pickDriveFiles({ accessToken: "tok", apiKey: "key", appId: "app" });
    await flushUntil(() => calls.visible === true);

    expect(calls.gapiLoad).toEqual(["picker"]);
    expect(calls.setOAuthToken).toBe("tok");
    expect(calls.setDeveloperKey).toBe("key");
    expect(calls.setAppId).toBe("app");
    expect(calls.features).toEqual(["MULTISELECT_ENABLED"]);
    expect(calls.views).toBe(1);
    expect(calls.visible).toBe(true);

    calls.callback!({
      action: "picked",
      docs: [{ id: "1", name: "Doc", mimeType: "text/plain" }],
    });
    await expect(promise).resolves.toEqual({
      files: [{ id: "1", name: "Doc", mimeType: "text/plain" }],
      action: "picked",
    });
  });

  it("skips setAppId when the appId is empty", async () => {
    const { calls } = makeEnv();
    const mod = await importPicker();
    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "" });
    await flushUntil(() => calls.visible === true);
    expect(calls.setAppId).toBeUndefined();
    calls.callback!({ action: "cancel" });
    await expect(promise).resolves.toEqual({ files: [], action: "cancel" });
  });

  it("settles on cancel with no files", async () => {
    const { calls } = makeEnv();
    const mod = await importPicker();
    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" });
    await flushUntil(() => calls.visible === true);
    calls.callback!({ action: "cancel" });
    await expect(promise).resolves.toEqual({ files: [], action: "cancel" });
  });

  it("treats 'cancelled' and 'error' as terminal too", async () => {
    for (const action of ["cancelled", "error"]) {
      const { calls } = makeEnv();
      const mod = await importPicker();
      const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" });
      await flushUntil(() => calls.visible === true);
      calls.callback!({ action });
      await expect(promise).resolves.toEqual({ files: [], action });
    }
  });

  it("ignores lifecycle events such as 'loaded' until a real action arrives", async () => {
    const { calls } = makeEnv();
    const mod = await importPicker();
    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" });
    await flushUntil(() => calls.visible === true);

    let settled = false;
    void promise.then(() => (settled = true));
    calls.callback!({ action: "loaded" });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    calls.callback!({ action: "picked", docs: [{ id: "x", name: "X", mimeType: "m" }] });
    await expect(promise).resolves.toEqual({
      files: [{ id: "x", name: "X", mimeType: "m" }],
      action: "picked",
    });
  });

  it("does not settle when a 'picked' action carries no documents", async () => {
    const { calls } = makeEnv();
    const mod = await importPicker();
    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" });
    await flushUntil(() => calls.visible === true);

    let settled = false;
    void promise.then(() => (settled = true));
    calls.callback!({ action: "picked", docs: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    calls.callback!({ action: "cancel" });
    await expect(promise).resolves.toEqual({ files: [], action: "cancel" });
  });

  it("falls back to lowercase enum defaults when the picker exposes none", async () => {
    const { calls } = makeEnv();
    const mod = await importPicker();
    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" });
    await flushUntil(() => calls.visible === true);
    calls.callback!({ action: "picked", documents: [{ id: "1", name: "N", mimeType: "m" }] });
    await expect(promise).resolves.toEqual({
      files: [{ id: "1", name: "N", mimeType: "m" }],
      action: "picked",
    });
  });

  it("honours custom Response key names", async () => {
    const { calls } = makeEnv({ responseEnum: { ACTION: "ACTION", DOCUMENTS: "DOCUMENTS" } });
    const mod = await importPicker();
    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" });
    await flushUntil(() => calls.visible === true);
    calls.callback!({ ACTION: "picked", DOCUMENTS: [{ id: "9", name: "Nine", mimeType: "m" }] });
    await expect(promise).resolves.toEqual({
      files: [{ id: "9", name: "Nine", mimeType: "m" }],
      action: "picked",
    });
  });

  it("honours a custom PICKED enum value", async () => {
    const { calls } = makeEnv({ actionEnum: { PICKED: "PICKED" } });
    const mod = await importPicker();
    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" });
    await flushUntil(() => calls.visible === true);
    calls.callback!({ action: "PICKED", docs: [{ id: "1", name: "N", mimeType: "m" }] });
    await expect(promise).resolves.toEqual({
      files: [{ id: "1", name: "N", mimeType: "m" }],
      action: "PICKED",
    });
  });

  it("reuses an already-injected script instead of appending another", async () => {
    const { calls, document } = makeEnv({ scriptPresent: true });
    const mod = await importPicker();
    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" });
    await flushUntil(() => calls.visible === true);
    expect(calls.appended).toBe(false);
    expect(document.createElement).not.toHaveBeenCalled();
    calls.callback!({ action: "cancel" });
    await expect(promise).resolves.toEqual({ files: [], action: "cancel" });
  });

  it("throws when google.picker is unavailable", async () => {
    makeEnv({ pickerMissing: true });
    const mod = await importPicker();
    await expect(mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" })).rejects.toThrow(
      "Google Picker no disponible.",
    );
  });

  it("rejects when the gapi loader is missing after the script loads", async () => {
    makeEnv({ gapiMissing: true });
    const mod = await importPicker();
    await expect(mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" })).rejects.toThrow(
      "El cargador de Google (gapi) no está disponible.",
    );
  });

  it("rejects with a diagnostic when the api.js script fails to load", async () => {
    makeEnv({ scriptFails: true });
    const mod = await importPicker();
    await expect(mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" })).rejects.toThrow(
      /apis\.google\.com/,
    );
  });
});
