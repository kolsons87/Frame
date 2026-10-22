/**
 * Insertion session: picks which titles to compare a newly ranked (or
 * reranked) title against, one question at a time.
 *
 * Strategy: binary search over the user's current order, starting inside the
 * band of titles that share the chosen reaction. Each answer halves the open
 * window, so ~log2(n) questions place a title among n. The session only
 * decides the slot in the user's list (`placementSlot`) and records the
 * comparisons; the score always comes from fitRanking() over the full
 * history, never from interpolating neighbours' scores.
 *
 * Pure and serialisable: the iOS client can run it offline and upload the
 * resulting comparisons later.
 */
import type { Comparison, Placement, Reaction } from "./model.ts";
import { REACTIONS } from "./model.ts";

export type Answer = "new" | "other" | "tie" | "skip";

export interface SessionState {
  newId: string;
  reaction: Reaction;
  /** Existing titles, strongest first (from the last fit), excluding newId. */
  order: string[];
  /** Open window [lo, hi) of positions in `order` the new title could sit above. */
  lo: number;
  hi: number;
  skipped: string[];
  comparisons: Comparison[];
  maxQuestions: number;
  /** Index of the first question (inside the reaction band). */
  firstMid: number | null;
  done: boolean;
}

export function startSession(
  newId: string,
  reaction: Reaction,
  current: Pick<Placement, "id" | "reaction">[],
  maxQuestions?: number,
): SessionState {
  const rest = current.filter((p) => p.id !== newId); // reranks exclude themselves
  const order = rest.map((p) => p.id);
  const n = order.length;
  const s: SessionState = {
    newId,
    reaction,
    order,
    lo: 0,
    hi: n,
    skipped: [],
    comparisons: [],
    maxQuestions: maxQuestions ?? Math.min(8, Math.ceil(Math.log2(n + 1)) + 1),
    firstMid: null,
    done: n === 0,
  };
  // First question: middle of the same-reaction band; else the nearest tier
  // boundary. This is only where we START asking — answers can move the title
  // anywhere in the list.
  const same = rest.map((p, i) => (p.reaction === reaction ? i : -1)).filter((i) => i >= 0);
  s.firstMid = same.length
    ? same[Math.floor(same.length / 2)]
    : boundaryIndex(rest, reaction);
  return s;
}

function boundaryIndex(current: Pick<Placement, "reaction">[], reaction: Reaction): number {
  const t = REACTIONS.indexOf(reaction);
  const i = current.findIndex((p) => REACTIONS.indexOf(p.reaction) < t);
  return Math.max(0, Math.min(current.length - 1, i === -1 ? current.length - 1 : i));
}

/** Title to show next, or null when the session is finished. */
export function nextOpponent(s: SessionState): string | null {
  if (s.done) return null;
  const mid = pickMid(s);
  return mid === null ? null : s.order[mid];
}

function pickMid(s: SessionState): number | null {
  const open: number[] = [];
  for (let i = s.lo; i < s.hi; i++) if (!s.skipped.includes(s.order[i])) open.push(i);
  if (!open.length) return null;
  if (s.comparisons.length === 0 && s.firstMid !== null && open.includes(s.firstMid)) return s.firstMid;
  return open[Math.floor(open.length / 2)];
}

/** Apply an answer; returns a new state (does not mutate). */
export function answer(prev: SessionState, a: Answer): SessionState {
  const s: SessionState = { ...prev, skipped: [...prev.skipped], comparisons: [...prev.comparisons] };
  const mid = pickMid(s);
  if (s.done || mid === null) return { ...s, done: true };
  const other = s.order[mid];
  if (a === "skip") {
    // Recorded for audit, but the title simply leaves the candidate set; the
    // window itself is unchanged, so no already-decided title can re-enter.
    s.skipped.push(other);
    s.comparisons.push({ a: s.newId, b: other, outcome: "skip" });
  } else {
    s.comparisons.push({
      a: s.newId,
      b: other,
      outcome: a === "new" ? "a" : a === "other" ? "b" : "tie",
    });
    // `order` is strongest-first: beating order[mid] means sitting above it.
    if (a === "new") s.hi = mid;
    else if (a === "other") s.lo = mid + 1;
    else s.lo = s.hi = mid + 1; // tie: place directly below it; stop asking
  }
  const asked = s.comparisons.filter((c) => c.outcome !== "skip").length;
  s.done = s.lo >= s.hi || asked >= s.maxQuestions || pickMid(s) === null;
  return s;
}

/** Index in `order` where the new title should be inserted (0 = top). */
export function placementSlot(s: SessionState): number {
  return Math.floor((s.lo + s.hi) / 2);
}
