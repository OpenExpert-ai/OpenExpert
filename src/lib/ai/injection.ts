// SPDX-License-Identifier: MIT
// Prompt-injection pre-filter.
//
// This regex gate runs *before* the model is invoked. It is intentionally
// conservative: any of the listed patterns triggers a block and an audit
// event in `activity` with status `denied`. The catalogue of patterns is
// reviewed regularly; false positives are tolerated over false negatives.

export const INJECTION_REGEX =
  /(modo dios|god ?mode|ignora (todas )?(las |tus )?(instrucciones|reglas)|ignore (all )?(previous |your )?(instructions|rules)|jailbreak|system prompt|prompt del sistema|sin restricciones|act[uú]a como (un )?admin|bypass|dan mode|desactiva (la )?seguridad|eleva(r)? (mis )?privilegios|hazme admin)/i;

/**
 * The shape behind catastrophic backtracking: a quantified group that is itself
 * quantified (`(a+)+`). Such a pattern makes every user message a way to freeze
 * the process (measured: 59 s of blocked event loop on a 29-character string),
 * and this filter runs on the main thread for every message. Patterns are
 * rejected when saved and skipped here, so one stored before that check cannot
 * hang the app either.
 */
export function hasNestedQuantifier(pattern: string): boolean {
  return /\([^)]*[+*]\)[*+{]/.test(pattern);
}

let cache: { key: string; res: RegExp[] } | null = null;

/** Compile user-supplied patterns, ignoring any that are not valid regexes. */
function compileExtra(patterns: string[]): RegExp[] {
  const key = patterns.join("\u0000");
  if (cache && cache.key === key) return cache.res;
  const out: RegExp[] = [];
  for (const p of patterns) {
    if (hasNestedQuantifier(p)) continue;
    try {
      out.push(new RegExp(p, "i"));
    } catch {
      // Ignore invalid patterns; they are rejected when saved.
    }
  }
  cache = { key, res: out };
  return out;
}

/** Returns true when the message contains a known injection attempt. */
export function detectInjection(input: string, extra: string[] = []): boolean {
  if (!input) return false;
  if (INJECTION_REGEX.test(input)) return true;
  return compileExtra(extra).some((re) => re.test(input));
}

/** Whether every pattern compiles. Used to validate the settings form. */
export function patternsAreValid(patterns: string[]): boolean {
  return patterns.every((p) => {
    try {
      new RegExp(p);
      return true;
    } catch {
      return false;
    }
  });
}
