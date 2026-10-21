// SPDX-License-Identifier: MIT
// What a regular expression costs.
//
// A pattern that backtracks catastrophically does not fail: it freezes the
// process, and the injection gate runs on the main thread for every message of
// the conversation. The criterion here is not the *shape* of the pattern but
// its **cost**: how long it needs against an adversarial input. A form nobody
// thought of is then caught by its behaviour and not by its spelling, which is
// what a detector that lists shapes cannot do — it left three holes in a row
// before this one.
//
// The measurement runs inside a `vm` context because that is the only way to
// interrupt a match that does not come back: the timeout of the context cuts
// the regex off and the process survives. A `worker_threads` worker would do
// it too, but it costs about twenty milliseconds per measurement instead of
// one, and the gate answers on the request thread.

import { runInNewContext } from "node:vm";

/**
 * Characters of the adversarial input. The engine needs few of them to blow
 * up — a dozen is enough for the patterns that freeze the app — and the
 * legitimate ones cost a millisecond against this length, so the two are far
 * apart.
 */
const PROBE_LENGTH = 256;

/**
 * A pattern that needs more than this against the probe is too slow. The
 * limit is generous: the patterns an owner writes legitimately cost a
 * millisecond or two against this input, and the ones that freeze the process
 * need seconds. It is left wide on purpose — the CI runner is about six
 * times slower than a developer machine, and a legitimate pattern must not be
 * rejected for being slow.
 */
export const PATTERN_COST_LIMIT_MS = 100;

/**
 * The probe is abandoned after this long. A pattern that reaches it is
 * already too slow, and cutting it off is what keeps the measurement itself
 * from freezing the process that asked for it.
 */
const PROBE_TIMEOUT_MS = 150;

/** Characters tried when the pattern does not use any letter. */
const FALLBACK_CHARS = ["a", "b", "c"];

/** Characters used to break the end of the probe, in this order. */
const BREAKER_CHARS = ["#", "~", "!", "@", "%", "^", "&", "\u0001"];

/** The character an escape matches. */
function escapedChar(pattern: string, i: number): { char: string; end: number } {
  const next = pattern[i + 1] ?? "";
  switch (next) {
    case "d":
      return { char: "0", end: i + 2 };
    case "w":
      return { char: "a", end: i + 2 };
    case "s":
      return { char: " ", end: i + 2 };
    case "D":
    case "W":
    case "S":
      return { char: "a", end: i + 2 };
    case "b":
    case "B":
      return { char: "", end: i + 2 }; // Zero width.
    case "n":
      return { char: "\n", end: i + 2 };
    case "t":
      return { char: "\t", end: i + 2 };
    case "r":
      return { char: "\r", end: i + 2 };
    default:
      return { char: next, end: i + 2 };
  }
}

/** The character a class matches: one it lists, or one it does not. */
function classChar(pattern: string, i: number, absent: string): { char: string; end: number } {
  const end = pattern.indexOf("]", i);
  if (end < 0) return { char: "", end: i + 1 };
  const body = pattern.slice(i + 1, end);
  if (body.startsWith("^")) {
    const listed = body.slice(1);
    const free = FALLBACK_CHARS.find((c) => !listed.includes(c)) ?? absent;
    return { char: free, end: end + 1 };
  }
  return { char: body[0] ?? "", end: end + 1 };
}

/** Where a group ends, and the character of its first atom. */
function groupChar(pattern: string, i: number, absent: string): { char: string; end: number } {
  let depth = 0;
  let k = i;
  for (; k < pattern.length; k++) {
    if (pattern[k] === "\\") {
      k++;
      continue;
    }
    if (pattern[k] === "(") depth++;
    else if (pattern[k] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  const close = k < pattern.length ? k : pattern.length - 1;
  let inner = pattern.slice(i + 1, close);
  if (inner.startsWith("?")) {
    const prefix = /^\?(?:[:=!]|<[A-Za-z_][A-Za-z0-9_]*>)/.exec(inner);
    inner = inner.slice(prefix ? prefix[0].length : 1);
  }
  if (!inner) return { char: "", end: close + 1 };
  return { char: firstChar(inner, absent), end: close + 1 };
}

/** The first character the fragment can match. */
function firstChar(fragment: string, absent: string): string {
  const ch = fragment[0];
  if (ch === undefined) return "";
  if (ch === "\\") return escapedChar(fragment, 0).char;
  if (ch === "[") return classChar(fragment, 0, absent).char;
  if (ch === "(") return groupChar(fragment, 0, absent).char;
  if (ch === ".") return absent; // A wildcard matches whatever is not there.
  return ch;
}

/** The characters the pattern uses as plain literals. */
function literalLetters(pattern: string): string[] {
  const out: string[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") {
      i++;
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
    if (ch && /[A-Za-z0-9]/.test(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

/** A character the pattern does not use, to break the end of the probe. */
function absentChar(pattern: string): string {
  const used = new Set(literalLetters(pattern));
  for (const c of BREAKER_CHARS) if (!used.has(c)) return c;
  for (const c of FALLBACK_CHARS) if (!used.has(c)) return c;
  return "\u0001";
}

/**
 * The characters the probe is built from.
 *
 * The engine is at its worst when two parts of the pattern compete for the
 * same characters, so the probe starts from the letters the pattern itself
 * uses: a wildcard and a literal that both match `a` leave the engine many
 * ways to split the input. A letter the pattern never uses is the opposite of
 * that, and it is the one that breaks the end of the probe.
 */
function probeChars(pattern: string): string[] {
  const out: string[] = [];
  const push = (c: string) => {
    if (c && !out.includes(c)) out.push(c);
  };
  for (const c of literalLetters(pattern)) push(c);
  for (const c of FALLBACK_CHARS) push(c);
  return out.slice(0, 3);
}

/**
 * The inputs the pattern is tried against: the repeated character, and the
 * repeated character followed by one the pattern cannot use. The second one
 * is what makes the match fail at the end — after the engine has already
 * tried every way of splitting the input, which is when the backtracking
 * explodes.
 */
function probes(pattern: string): string[] {
  const absent = absentChar(pattern);
  const out: string[] = [];
  for (const c of probeChars(pattern)) {
    out.push(c.repeat(PROBE_LENGTH));
    out.push(c.repeat(PROBE_LENGTH) + absent);
  }
  return out;
}

/**
 * Milliseconds the pattern needs against the input, or null when it did not
 * come back inside the timeout.
 */
export function measurePattern(pattern: string, input: string): number | null {
  try {
    const result = runInNewContext(
      "const t = Date.now(); new RegExp(p, 'i').test(s); Date.now() - t;",
      { p: pattern, s: input },
      { timeout: PROBE_TIMEOUT_MS },
    ) as number;
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A pattern that does not compile is not slow: it is invalid, and the
    // caller rejects it for that.
    if (/timed out/i.test(message)) return null;
    return 0;
  }
}

/** Verdicts already given, so a pattern is measured once and not once per message. */
const verdicts = new Map<string, boolean>();

/**
 * Whether the pattern is too slow to run against a message. The verdict is
 * the measurement: the pattern is tried against inputs built to make it
 * work, and one that needs more than the limit is rejected, whatever its
 * shape.
 */
export function isPatternTooSlow(pattern: string): boolean {
  const known = verdicts.get(pattern);
  if (known !== undefined) return known;
  let tooSlow = false;
  for (const input of probes(pattern)) {
    const ms = measurePattern(pattern, input);
    if (ms === null) {
      tooSlow = true; // It did not come back in time.
      break;
    }
    if (ms > PATTERN_COST_LIMIT_MS) {
      tooSlow = true;
      break;
    }
  }
  verdicts.set(pattern, tooSlow);
  return tooSlow;
}

/** The patterns that are safe to run, in the order they came in. */
export function safePatterns(patterns: readonly string[]): string[] {
  return patterns.filter((p) => !isPatternTooSlow(p));
}
