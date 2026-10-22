import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answer, fitRanking, insertAt, nextOpponent, placementSlot, startSession,
  type Comparison, type Reaction, type RankedTitle, type SessionState,
} from "../src/index.ts";

const pool = (ids: string[], reaction: Reaction = "Good") => ids.map((id) => ({ id, reaction }));

test("empty pool: nothing to ask", () => {
  const s = startSession("new", "Great", []);
  assert.equal(s.done, true);
  assert.equal(nextOpponent(s), null);
});

test("first question comes from the same-reaction band", () => {
  const current = [
    { id: "g1", reaction: "Great" as const }, { id: "g2", reaction: "Great" as const },
    { id: "f1", reaction: "Fine" as const }, { id: "f2", reaction: "Fine" as const }, { id: "f3", reaction: "Fine" as const },
  ];
  assert.equal(nextOpponent(startSession("new", "Fine", current)), "f2");
  assert.equal(nextOpponent(startSession("new", "Great", current)), "g2");
});

test("regression: skipping never re-opens a comparison the user already answered", () => {
  // Strongest first. User says new < c (loses), skips the next pick, then wins the rest.
  let s = startSession("new", "Good", pool(["a", "b", "c", "d", "e"]));
  const asked: string[] = [];
  const first = nextOpponent(s)!; asked.push(first);
  s = answer(s, "other");                       // lost to `first`
  s = answer(s, "skip");                        // don't remember
  while (!s.done) { asked.push(nextOpponent(s)!); s = answer(s, "new"); }
  assert.equal(asked.filter((x) => x === first).length, 1);
  const lostTo = s.order.indexOf(first);
  assert.ok(s.lo > lostTo, "placement must stay below the title the user preferred");
});

test("question count stays logarithmic", () => {
  const ids = Array.from({ length: 200 }, (_, i) => `t${i}`);
  let s = startSession("new", "Good", pool(ids));
  let n = 0;
  while (!s.done) { s = answer(s, n % 2 ? "new" : "other"); n++; }
  assert.ok(n <= 8, `${n} questions`);
});

test("rerank excludes the title being reranked", () => {
  const s = startSession("b", "Good", pool(["a", "b", "c"]));
  assert.deepEqual(s.order, ["a", "c"]);
});

test("tie ends the session and records a tie", () => {
  let s = startSession("new", "Good", pool(["a", "b", "c"]));
  s = answer(s, "tie");
  assert.equal(s.done, true);
  assert.equal(s.comparisons.at(-1)!.outcome, "tie");
});

test("session places a title exactly where a consistent user would put it", () => {
  // Existing pool already ordered by evidence; new title truly belongs at index k.
  for (const k of [0, 3, 7, 12, 19]) {
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const titles: RankedTitle[] = pool(ids);
    const history: Comparison[] = ids.slice(1).map((id, i) => ({ a: ids[i], b: id, outcome: "a" }));
    const current = fitRanking(titles, history).placements;
    let s: SessionState = startSession("new", "Good", current);
    while (!s.done) {
      const opp = nextOpponent(s)!;
      s = answer(s, ids.indexOf(opp) >= k ? "new" : "other");
    }
    const ordered = insertAt(titles, { id: "new", reaction: "Good" as const }, placementSlot(s));
    const after = fitRanking(ordered, [...history, ...s.comparisons]);
    const pos = after.placements.find((p) => p.id === "new")!.position - 1;
    assert.equal(pos, k);
    for (const c of s.comparisons) {
      // Every direct answer is honoured by the final order.
      const pa = after.placements.find((p) => p.id === c.a)!.position, pb = after.placements.find((p) => p.id === c.b)!.position;
      if (c.outcome === "a") assert.ok(pa < pb);
      if (c.outcome === "b") assert.ok(pb < pa);
    }
  }
});
