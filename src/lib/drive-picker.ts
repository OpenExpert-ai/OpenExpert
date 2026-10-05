// SPDX-License-Identifier: MIT
// Client-only helpers around the Google Drive Picker API.
// Loaded lazily so the cost is only paid when the user clicks "Seleccionar
// archivos" in Integraciones → Fuentes.

type RawDoc = { id: string; name: string; mimeType: string };
type PickerCallbackData = { action: string; docs?: RawDoc[] };

export type PickerResult = { id: string; name: string; mimeType: string };

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
}): Promise<PickerResult[]> {
  await ensureLoaded();
  const w = window as Window & { google?: { picker: PickerNs } };
  const PickerBuilder = w.google?.picker.PickerBuilder;
  const DocsView = w.google?.picker.DocsView;
  if (!PickerBuilder || !DocsView) throw new Error("Google Picker no disponible.");

  return new Promise<PickerResult[]>((resolve) => {
    const builder = new PickerBuilder()
      .setOAuthToken(opts.accessToken)
      .setDeveloperKey(opts.apiKey)
      .setAppId(opts.appId)
      .enableFeature("MULTISELECT_ENABLED")
      .addView(new DocsView())
      .setSelectableMimeTypes(
        "application/pdf,text/plain,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation",
      )
      .setCallback((data) => {
        if (data.action === "PICKED" && data.docs) {
          resolve(data.docs.map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType })));
        } else {
          resolve([]);
        }
      });
    const picker = builder.build() as unknown as PickerInstance;
    picker.setVisible(true);
  });
}
