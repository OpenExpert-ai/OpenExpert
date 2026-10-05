// SPDX-License-Identifier: MIT
// Client-only helpers around the Google Drive Picker API.
// Loaded lazily so the cost is only paid when the user clicks "Seleccionar
// archivos" in Integraciones → Fuentes.

type RawDoc = { id: string; name: string; mimeType: string };
type PickerCallbackData = { action: string; docs?: RawDoc[] };

export type PickerResult = { id: string; name: string; mimeType: string };
export type PickerOutcome = { files: PickerResult[]; action: string };

interface PickerBuilderAPI {
  addView: (v: unknown) => PickerBuilderAPI;
  setOAuthToken: (token: string) => PickerBuilderAPI;
  setDeveloperKey: (key: string) => PickerBuilderAPI;
  setAppId: (id: string) => PickerBuilderAPI;
  setCallback: (cb: (data: PickerCallbackData) => void) => PickerBuilderAPI;
  enableFeature: (f: string) => PickerBuilderAPI;
  setSelectableMimeTypes: (m: string) => PickerBuilderAPI;
  build: () => unknown;
}
interface PickerInstance {
  setVisible: (v: boolean) => void;
}
interface PickerNs {
  PickerBuilder: new () => PickerBuilderAPI;
  DocsView: new () => unknown;
  /** Enum values are lowercase strings (`PICKED` -> "picked"). */
  Action?: { PICKED?: string; CANCEL?: string };
  Response?: { ACTION?: string; DOCUMENTS?: string };
}

declare global {
  interface Window {
    gapi?: { load: (libraries: string, cb: () => void) => void };
    google?: { picker: PickerNs };
  }
}

const APIS_URL = "https://apis.google.com/js/api.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(
        new Error(
          "No se pudo cargar el Google Picker (apis.google.com). Comprueba tu conexión, " +
            "desactiva bloqueadores de scripts para localhost y que la CSP permita apis.google.com.",
        ),
      );
    document.head.appendChild(s);
  });
}

let readyP: Promise<void> | null = null;
function ensureLoaded(): Promise<void> {
  if (readyP) return readyP;
  readyP = loadScript(APIS_URL).then(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!window.gapi) {
          reject(new Error("El cargador de Google (gapi) no está disponible."));
          return;
        }
        window.gapi.load("picker", () => resolve());
      }),
  );
  return readyP;
}

export async function pickDriveFiles(opts: {
  accessToken: string;
  apiKey: string;
  appId: string;
}): Promise<PickerOutcome> {
  await ensureLoaded();
  const w = window as Window & { google?: { picker: PickerNs } };
  const PickerBuilder = w.google?.picker.PickerBuilder;
  const DocsView = w.google?.picker.DocsView;
  if (!PickerBuilder || !DocsView) throw new Error("Google Picker no disponible.");

  return new Promise<PickerOutcome>((resolve) => {
    const picker = w.google?.picker;
    // `google.picker.Action.PICKED` is the lowercase string "picked". Comparing
    // to the uppercase name never matches, which silently dropped the selection.
    const pickedAction = picker?.Action?.PICKED ?? "picked";
    const cancelAction = picker?.Action?.CANCEL ?? "cancel";
    const actionKey = picker?.Response?.ACTION ?? "action";
    const docsKey = picker?.Response?.DOCUMENTS ?? "documents";

    let builder = new PickerBuilder().setOAuthToken(opts.accessToken).setDeveloperKey(opts.apiKey);
    // An empty appId can make the picker misbehave; only set it when present.
    if (opts.appId) builder = builder.setAppId(opts.appId);
    builder = builder
      .enableFeature("MULTISELECT_ENABLED")
      .addView(new DocsView())
      .setCallback((data) => {
        const rec = data as unknown as Record<string, unknown>;
        const action = String(data.action ?? rec[actionKey] ?? "");
        const docs = (data.docs ?? rec[docsKey]) as RawDoc[] | undefined;
        // Visible in the browser console to diagnose picker issues.
        console.debug("[drive-picker] callback", { action, count: docs?.length ?? 0 });
        // The callback also fires with "loaded" (and other lifecycle events) while
        // the dialog is still open; only settle on a final user action.
        if (action === pickedAction && docs?.length) {
          resolve({
            files: docs.map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType })),
            action,
          });
          return;
        }
        if (
          action === cancelAction ||
          action === "cancel" ||
          action === "cancelled" ||
          action === "error"
        ) {
          resolve({ files: [], action });
        }
        // Anything else (e.g. "loaded") means the dialog is still open: ignore.
      });
    const instance = builder.build() as unknown as PickerInstance;
    instance.setVisible(true);
  });
}
