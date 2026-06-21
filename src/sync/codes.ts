import { customAlphabet } from "nanoid";

// Human-friendly join codes: uppercase letters only. Codes are usually shared
// by link, so legibility for the occasional retype matters more than length.
// Letter-only means there are no digits to confuse with I/O, so the full A-Z
// is fine. 5 chars -> 26^5 = ~11.9M combinations; paired with the uniqueness
// check in createNewGame, that stays collision-free well past any realistic
// number of games (we never reclaim codes).
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Length of a join code. Exported so the UI input stays in sync. */
export const CODE_LENGTH = 5;
const makeCode = customAlphabet(ALPHABET, CODE_LENGTH);

export function newGameCode(): string {
  return makeCode();
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}
