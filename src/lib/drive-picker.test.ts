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

/** The <script> of the Google API, as the DOM holds it. */
type ScriptTag = {
  src: string;
  async: boolean;
  onload: null | (() => void);
  onerror: null | (() => void);
  remove: () => void;
};

const APIS_URL = "https://apis.google.com/js/api.js";

type EnvOpts = {
  scriptPresent?: boolean;
  scriptFails?: boolean;
  gapiMissing?: boolean;
  /** `gapi.load` keeps its callback and never calls it: the module never starts. */
  gapiNeverCallsBack?: boolean;
  pickerMissing?: boolean;
  actionEnum?: { PICKED?: string; CANCEL?: string };
  responseEnum?: { ACTION?: string; DOCUMENTS?: string };
};

function makeEnv(opts: EnvOpts = {}) {
  const calls = {
    gapiLoad: [] as string[],
    // Flipped by the test: the library loaded but the module never starts, so the callback the
    // app is waiting for is swallowed.
    swallowGapiCallback: opts.gapiNeverCallsBack ?? false,
    appended: false,
    // How many <script> tags the page has been given, one per attempt.
    appendCount: 0,
    // The scripts the page holds right now, as the DOM would keep them.
    scripts: [] as ScriptTag[],
    // Flipped by the test between two attempts: the cause of a failed load may
    // be gone by the time the user clicks again.
    failScript: opts.scriptFails ?? false,
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

  const makeTag = (): ScriptTag => {
    const tag: ScriptTag = {
      src: "",
      async: false,
      onload: null,
      onerror: null,
      remove: () => {
        const i = calls.scripts.indexOf(tag);
        if (i >= 0) calls.scripts.splice(i, 1);
      },
    };
    return tag;
  };

  const head = {
    appendChild: (s: ScriptTag) => {
      calls.appended = true;
      calls.appendCount += 1;
      calls.scripts.push(s);
      if (calls.failScript) s.onerror?.();
      else s.onload?.();
    },
  };
  const document = {
    querySelector: vi.fn((selector: string) => {
      const wanted = /script\[src="(.*)"\]/.exec(selector)?.[1];
      return calls.scripts.find((s) => s.src === wanted) ?? null;
    }),
    createElement: vi.fn(() => makeTag()),
    head,
  };

  // A script that was already in the page before the app asked for one.
  if (opts.scriptPresent) {
    const tag = makeTag();
    tag.src = APIS_URL;
    calls.scripts.push(tag);
  }

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
            if (!calls.swallowGapiCallback) cb();
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
  vi.useRealTimers();
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

  it("loads the script again after a failed attempt instead of replaying the failure", async () => {
    const { calls } = makeEnv({ scriptFails: true });
    const mod = await importPicker();

    await expect(mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" })).rejects.toThrow(
      /apis\.google\.com/,
    );
    // The tag that failed is dead: it leaves the page, so the next attempt
    // mounts a fresh one instead of waiting for a script that never loads.
    expect(calls.scripts).toHaveLength(0);

    // The user fixes the cause (the connection, a script blocker, the CSP) and
    // clicks again.
    calls.failScript = false;

    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "k", appId: "a" });
    // The retry has to open the picker. A promise cached from the failed
    // attempt rejects here with the error of the first one, and the picker
    // never opens.
    const opened = await Promise.race([
      promise.then(
        () => "settled",
        (e: Error) => `failed: ${e.message}`,
      ),
      flushUntil(() => calls.visible === true).then(() => "opened"),
    ]);
    expect(opened).toBe("opened");

    // The retry mounts a fresh <script>: the dead tag of the first attempt is
    // not left in the page for the next one to wait for.
    expect(calls.appendCount).toBe(2);
    expect(calls.scripts).toHaveLength(1);
    expect(calls.gapiLoad).toEqual(["picker"]);

    calls.callback!({ action: "cancel" });
    await expect(promise).resolves.toEqual({ files: [], action: "cancel" });
  });

  it("rejects instead of hanging for ever when gapi.load never calls back", async () => {
    const { calls } = makeEnv({ gapiNeverCallsBack: true });
    const mod = await importPicker();

    vi.useFakeTimers();
    let settled: string | null = null;
    const promise = mod.pickDriveFiles({ accessToken: "t", apiKey: "t", appId: "a" });
    void promise.then(
      () => (settled = "resolved"),
      (e: Error) => (settled = `rejected: ${e.message}`),
    );

    // The script loads and gapi exists, but the picker module never starts: the callback the app
    // handed to `gapi.load` is kept and never called. Without a deadline the promise stays
    // pending for ever, and the button of Integraciones → Fuentes spins with nothing to read.
    await flushUntil(() => calls.gapiLoad.length === 1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled ?? "la promesa sigue pendiente sin plazo").toMatch(
      /^rejected: El cargador de Google \(gapi\) no respondió en 20 s\./,
    );

    // The failure is not cached: the cause is gone by the time the user clicks again.
    calls.swallowGapiCallback = false;
    const retry = mod.pickDriveFiles({ accessToken: "t", apiKey: "t", appId: "a" });
    await flushUntil(() => calls.visible === true);
    expect(calls.gapiLoad).toEqual(["picker", "picker"]);
    calls.callback!({ action: "cancel" });
    await expect(retry).resolves.toEqual({ files: [], action: "cancel" });
  });
});
