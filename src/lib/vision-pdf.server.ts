// SPDX-License-Identifier: MIT
// Reading a scanned PDF with a model that can see it.
//
// `unpdf` returns nothing for a PDF that is a photograph of a page: there is no text layer to pull
// out. But the paper it came from is perfectly readable by a person, so the honest answer is not
// "cannot read it" — it is "read it the other way". A model that takes documents natively can look
// at the pages, and no page rendering or extra dependency is needed for that.
//
// Two things this module is deliberately careful about:
//
// - **Transcription, not summary.** What comes back feeds a text search and a windowed read, so it
//   has to be the document's own words. A summary would lose the figures, and a lost figure is a
//   wrong total three questions later. And the ceiling below is announced, not applied in silence:
//   the text past it cannot be asked for again, so the answer carries `truncated` and a note
//   instead of letting the first half pass for the whole document.
// - **This is a cloud call carrying the user's document.** Sending it is a decision, not a detail:
//   the caller checks the setting first, the setting ships off, and a local provider simply cannot
//   do this — in which case the answer is a clear note, never a silent upload.

import { generateText } from "ai";
import { getLanguageModel, selectedProvider } from "./engine/model-provider.server";

/** How long to wait before giving up on a document the size of a report. */
const TIMEOUT_MS = 60_000;
/** Ceiling for the transcription, so a 200-page scan cannot flood the context. */
const MAX_TEXT = 200_000;
/** `200000` → «200.000», because the ceiling is quoted to the model and to the person reading it. */
const MAX_TEXT_TEXT = groupThousands(MAX_TEXT);

/** The cap written the way a person reads it. */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const INSTRUCTION =
  "Transcribe el texto de este documento, en su idioma original, tal cual aparece. No resumas, no " +
  "comentes y no traduzcas: si hay tablas, escribe cada fila con sus columnas separadas por comas, " +
  "y si algún número no se lee con seguridad, escribe ? en su lugar en vez de adivinarlo.";

/**
 * What comes back from a transcription. `truncated` is set only when the ceiling cut something:
 * the caller has to be able to say that the document continues past what it received, because the
 * cut text does not exist anywhere else — it was never returned by the model.
 */
export type VisionRead = {
  text: string | null;
  note?: string;
  truncated?: true;
  /** Characters the model transcribed, before the ceiling. Only set when it cut. */
  originalChars?: number;
};

/** Whether the active provider can look at a document at all, and why not when it cannot. */
export function visionAvailable(): { ok: boolean; note?: string } {
  if (selectedProvider() === "google") return { ok: true };
  return {
    ok: false,
    note: "El proveedor activo no puede ver documentos, así que un PDF escaneado no se puede leer. Se puede cambiar el proveedor en Ajustes.",
  };
}

/**
 * Transcribe a scanned PDF with the active model. Never throws for the model failing: that is
 * information the caller turns into a message.
 */
export async function pdfTextWithVision(buf: Uint8Array): Promise<VisionRead> {
  const available = visionAvailable();
  if (!available.ok) return { text: null, ...(available.note ? { note: available.note } : {}) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await generateText({
      model: getLanguageModel(),
      abortSignal: controller.signal,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCTION },
            { type: "file", data: buf, mediaType: "application/pdf" },
          ],
        },
      ],
    });
    const text = String(result.text ?? "").trim();
    if (!text) {
      return {
        text: null,
        note: "El modelo no devolvió texto para ese PDF: puede que las páginas no se lean bien.",
      };
    }
    // The ceiling stays (a 200-page scan must not flood the context), but a cut is data, not a
    // detail: what falls outside cannot be asked for again — the read returns this transcription
    // windowed, so without the note the model takes the first half for the whole document.
    if (text.length > MAX_TEXT)
      return {
        text: text.slice(0, MAX_TEXT),
        truncated: true,
        originalChars: text.length,
        note: `La transcripción del PDF se ha recortado a ${MAX_TEXT_TEXT} caracteres de ${groupThousands(text.length)}: el final del documento no está en lo que se lee.`,
      };
    return { text };
  } catch (e) {
    return { text: null, note: `No se pudo leer el PDF con el modelo (${(e as Error).message}).` };
  } finally {
    clearTimeout(timer);
  }
}
