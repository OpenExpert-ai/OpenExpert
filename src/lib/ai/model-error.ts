// SPDX-License-Identifier: MIT
// Turn a provider's technical failure into something the owner can act on.
//
// The clearest case is an Ollama model without tool calling: the provider says
// "does not support tools" and the chat stops. That sentence names the model,
// not the fix, so the interface used to show a raw registry path. A local model
// that cannot call tools cannot read the business data either; the answer is to
// pick one that can, not to retry.

export function friendlyModelError(message: string, model: string): string {
  if (/does not support tools/i.test(message)) {
    return `El modelo ${model} no admite herramientas (tool calling), así que no puede consultar tus datos. Elige un modelo compatible, como llama3.1, en Ajustes → Modelo e IA.`;
  }
  return message;
}
