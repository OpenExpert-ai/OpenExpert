// SPDX-License-Identifier: MIT
// Prompt-injection pre-filter.
//
// This regex gate runs *before* the model is invoked. It is intentionally
// conservative: any of the listed patterns triggers a block and an audit
// event in `activity` with status `denied`. The catalogue of patterns is
// reviewed regularly; false positives are tolerated over false negatives.

import { isPatternTooSlow } from "./redos.server";

export const INJECTION_REGEX =
  /(modo dios|god ?mode|ignora (todas )?(las |tus )?(instrucciones|reglas)|ignore (all )?(previous |your )?(instructions|rules)|jailbreak|system prompt|prompt del sistema|sin restricciones|act[uú]a como (un )?admin|bypass|dan mode|desactiva (la )?seguridad|eleva(r)? (mis )?privilegios|hazme admin)/i;

type Quantifier = { min: number; max: number; length: number };

/** The quantifier that starts at `i`, or null when the character there is a literal. */
function quantifierAt(pattern: string, i: number): Quantifier | null {
  if (i >= pattern.length) return null;
  const ch = pattern[i];
  if (ch === "*") return { min: 0, max: Number.POSITIVE_INFINITY, length: 1 };
  if (ch === "+") return { min: 1, max: Number.POSITIVE_INFINITY, length: 1 };
  if (ch === "?") return { min: 0, max: 1, length: 1 };
  if (ch !== "{") return null;
  const m = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(i));
  if (!m) return null; // A literal brace.
  const min = Number(m[1]);
  const max = m[2] === undefined ? min : m[2] === "" ? Number.POSITIVE_INFINITY : Number(m[2]);
  return { min, max, length: m[0].length };
}

/** Whether the quantifier can repeat two or more times, which is what makes it multiply. */
function repeats(q: Quantifier): boolean {
  return q.max >= 2;
}

/**
 * Whether the quantifier varies how much it consumes. A fixed `{n}` and the optional `?` /
 * `{0,1}` cannot turn one input into several partitions, so they are not a source of blowup.
 */
function varies(q: Quantifier): boolean {
  return q.max !== q.min && !(q.min === 0 && q.max === 1);
}

/**
 * The shape behind catastrophic backtracking: a group that repeats — two or more times,
 * bounded or not — and whose content can repeat in more than one way, because it holds a
 * variable-length repetition (`(a+)+`, `((a+))+`, `((a{1,3}))+`, `(.*a){20}`) or an
 * alternation (`(a|aa)+`, `(a|b+)+`). Such a pattern makes every user message a way to
 * freeze the process (measured: 251.7 s of blocked event loop for `((a+))+$` on a
 * 31-character string, 59 s for `(a+)+$`), and this filter runs on the main thread for every
 * message. Patterns are rejected when saved and skipped here, so one stored before that check
 * cannot hang the app either.
 *
 * The pattern is walked once, keeping a frame per open group: whether its content holds a
 * variable-length repetition and whether it holds an alternation, both counting nested
 * groups. When a group closes and a repetition follows it, either flag makes it invalid. The
 * rule is conservative on purpose — `(hola|adios)+` is rejected although its branches cannot
 * overlap, this module prefers a false positive over a false negative, and an alternation
 * that is not repeated is always allowed.
 */
export function hasNestedQuantifier(pattern: string): boolean {
  type Frame = { repetition: boolean; alternation: boolean };
  const open: Frame[] = [];
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    if (ch === "\\") {
      i++; // An escaped character is a literal: `\(` does not open a group.
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      open.push({ repetition: false, alternation: false });
      continue;
    }
    if (ch === ")") {
      const frame = open.pop();
      if (!frame) continue; // Unbalanced: rejected by `patternsAreValid`.
      const q = quantifierAt(pattern, i + 1);
      const repeated = q !== null && repeats(q);
      if (repeated && (frame.repetition || frame.alternation)) return true;
      const parent = open[open.length - 1];
      if (parent) {
        // What a group holds is also held by the group that wraps it.
        parent.repetition ||= frame.repetition || (q !== null && varies(q));
        parent.alternation ||= frame.alternation;
      }
      continue;
    }
    if (ch === "|") {
      const frame = open[open.length - 1];
      if (frame) frame.alternation = true;
      continue;
    }
    const q = quantifierAt(pattern, i);
    if (q) {
      const frame = open[open.length - 1];
      if (frame && varies(q)) frame.repetition = true;
      i += q.length - 1;
    }
  }

  return false;
}

let cache: { key: string; res: RegExp[] } | null = null;

/**
 * Compile user-supplied patterns, ignoring any that are not valid regexes.
 *
 * A pattern is skipped when it is **slow**, not only when it is invalid: the
 * gate runs it against every message of the turn, on the thread that serves
 * the app, and a pattern that backtracks catastrophically does not fail — it
 * freezes the process. The cost is measured (`redos.server.ts`) instead of
 * guessed from the shape, so a form nobody thought of is caught too.
 *
 * The two rules run in that order on purpose: the shape rule is instant and
 * already knows the classic forms, and the measurement is what costs, so it
 * is only paid for the patterns the shape rule does not recognise.
 */
function compileExtra(patterns: string[]): RegExp[] {
  const key = patterns.join("\u0000");
  if (cache && cache.key === key) return cache.res;
  const out: RegExp[] = [];
  for (const p of patterns) {
    if (hasNestedQuantifier(p)) continue;
    if (isPatternTooSlow(p)) continue;
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

/**
 * Characters of each message the gate reads. A request may carry 200 messages of
 * any size and the regex runs on the request thread, so the scan is capped: a
 * longer message is checked on its first `GATE_TEXT_LIMIT` characters, which is
 * far more than the composer sends and than a single turn holds.
 */
export const GATE_TEXT_LIMIT = 32_000;

/** What the gate needs from a message: both a `UIMessage` and a row read back from the database fit. */
export type GateMessage = { role?: string; parts?: readonly { type?: string; text?: unknown }[] };

/** Text of a message as the gate and the model read it: its text parts, joined. */
export function messageText(message: GateMessage | null | undefined): string {
  const parts = message?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join(" ");
}

/** A message the gate rejects, with the position that names it in the denial. */
export type InjectionHit = { index: number; role: string; text: string };

/**
 * First message of a conversation that trips the gate, or null.
 *
 * Every message is checked, not only the last one: the model receives the whole
 * array as history, so an attempt planted in an earlier turn — or in a message
 * whose `role` the client forged as `assistant`, also client data — would reach
 * the model with no audit event.
 */
export function firstInjection(
  messages: readonly GateMessage[],
  extra: string[] = [],
): InjectionHit | null {
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (!message) continue;
    const text = messageText(message).slice(0, GATE_TEXT_LIMIT);
    if (detectInjection(text, extra)) {
      return { index, role: message.role ?? "", text };
    }
  }
  return null;
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
