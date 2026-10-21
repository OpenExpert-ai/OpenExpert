// SPDX-License-Identifier: MIT
// What "Probar conexión" and "Listar" ask about.
//
// The settings panel keeps the provider, the endpoint and the key in its own
// state and writes them only when the owner presses "Guardar cambios". So the
// two buttons have to say **what** they are asking about: with the values the
// form holds, the question is about what the owner just wrote; without them,
// the question is about what is on disk.
//
// This module is where that translation lives, away from the route, so it can
// be tested without mounting the page (which drags the server functions and
// the whole query client along).

import type { ModelProviderId } from "@openexpert/openexpert/model-provider";

/** The provider record as the panel sees it. */
export type ProbeProviderView = {
  id: string;
  endpoint: { env: string | null };
};

/** What a probe carries: the provider, its endpoint and its key. */
export type ProbePayload = {
  provider: ModelProviderId;
  endpoint: string;
  key?: string;
};

/**
 * The values the form holds, ready to be asked.
 *
 * The endpoint travels only for the providers whose address the owner points
 * somewhere: a record with a fixed address keeps it, because that is where
 * its own protocol lives, and sending one would be ignored anyway.
 *
 * The key travels only when the owner has written one. An empty field means
 * "the stored key", because leaving it blank is how the panel says "do not
 * change it" — and a probe is not a save.
 */
export function probePayload(
  view: ProbeProviderView | undefined,
  endpoint: string,
  key: string,
): ProbePayload {
  return {
    provider: (view?.id ?? "ollama") as ModelProviderId,
    endpoint: view?.endpoint.env ? endpoint.trim() : "",
    ...(key ? { key } : {}),
  };
}
