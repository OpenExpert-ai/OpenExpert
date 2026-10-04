// SPDX-License-Identifier: MIT
// Prompt-injection pre-filter.
//
// This regex gate runs *before* the model is invoked. It is intentionally
// conservative: any of the listed patterns triggers a block and an audit
// event in `activity` with status `denied`. The catalogue of patterns is
// reviewed regularly; false positives are tolerated over false negatives.

export const INJECTION_REGEX =
  /(modo dios|god ?mode|ignora (todas )?(las |tus )?(instrucciones|reglas)|ignore (all )?(previous |your )?(instructions|rules)|jailbreak|system prompt|prompt del sistema|sin restricciones|act[uú]a como (un )?admin|bypass|dan mode|desactiva (la )?seguridad|eleva(r)? (mis )?privilegios|hazme admin)/i;

/** Returns true when the message contains a known injection attempt. */
export function detectInjection(input: string): boolean {
  if (!input) return false;
  return INJECTION_REGEX.test(input);
}
