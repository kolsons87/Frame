import { test } from "node:test";
import assert from "node:assert/strict";
import { fitRanking, isotonicNonIncreasing, thetaToScore, type Comparison, type RankedTitle } from "../src/index.ts";

const byId = (r: ReturnType<typeof fitRanking>) => Object.fromEntries(r.placements.map((p) => [p.id, p]));
const wins = (a: string, b: string, times = 1): Comparison[] =>
  Array.from({ length: times }, () => ({ a, b, outcome: "a" as const }));

test("cold start: a first Great sits near 8.3, provisional, never 10.0", () => {
  const r = fitRanking([{ id: "x", reaction: "Great", favorite: true }], []);
  const x = r.placements[0];
  assert.equal(x.score, 8.3);
  assert.equal(x.provisional, true);
});

test("acceptance #4: a Great that loses to stronger titles lands below 9.0 and stays Great", () => {
  const titles: RankedTitle[] = [
    { id: "a", reaction: "Great" }, { id: "b", reaction: "Great" }, { id: "c", reaction: "Great" },
    { id: "new", reaction: "Great" },
  ];
  const comps = [
    ...wins("a", "b"), ...wins("b", "c"), ...wins("a", "c"),
    ...wins("a", "new"), ...wins("b", "new"), ...wins("c", "new"),
  ];
  const p = byId(fitRanking(titles, comps));
  assert.ok(p.new.score < 9.0, `score ${p.new.score}`);
  assert.equal(p.new.reaction, "Great");
  assert.equal(p.new.position, 4);
});

test("list order is authoritative: a Good placed above a Great keeps its place and never shows a lower score", () => {
  const p = byId(fitRanking([{ id: "good", reaction: "Good" }, { id: "great", reaction: "Great" }], wins("good", "great")));
  assert.equal(p.good.position, 1);
  assert.ok(p.good.score >= p.great.score, `${p.good.score} vs ${p.great.score}`);
  assert.equal(p.great.reaction, "Great"); // color stays user-selected
});

test("a Bad title placed above everything keeps its place and is flagged for review", () => {
  const t: RankedTitle[] = [{ id: "bad", reaction: "Bad" }, { id: "g1", reaction: "Great" }, { id: "g2", reaction: "Great" }];
  const r = fitRanking(t, [...wins("bad", "g1"), ...wins("bad", "g2"), ...wins("g1", "g2")]);
  assert.equal(r.placements[0].id, "bad");
  assert.equal(r.conflicts.length, 2);
  assert.ok(r.placements[0].score < 9.0, "contradictory evidence shouldn't earn a top-tier number");
});

test("a two-tier contradiction is surfaced as a conflict, not silently resolved", () => {
  const r = fitRanking([{ id: "great", reaction: "Great" }, { id: "fine", reaction: "Fine" }], wins("fine", "great"));
  assert.deepEqual(r.conflicts, [{ winner: "fine", loser: "great", tierGap: 2 }]);
  assert.equal(byId(r).fine.reaction, "Fine"); // color stays user-selected
});

test("cycles are absorbed without errors or runaway scores", () => {
  const t: RankedTitle[] = ["a", "b", "c"].map((id) => ({ id, reaction: "Good" }));
  const r = fitRanking(t, [...wins("a", "b"), ...wins("b", "c"), ...wins("c", "a")]);
  const scores = r.placements.map((p) => p.score);
  assert.ok(Math.max(...scores) - Math.min(...scores) <= 0.1, String(scores));
});

test("ties pull two titles together", () => {
  const t: RankedTitle[] = [{ id: "a", reaction: "Great" }, { id: "b", reaction: "Fine" }];
  const tied = fitRanking(t, Array.from({ length: 6 }, () => ({ a: "a", b: "b", outcome: "tie" as const })));
  const none = fitRanking(t, []);
  const gap = (r: typeof none) => Math.abs(r.placements[0].theta - r.placements[1].theta);
  assert.ok(gap(tied) < gap(none) / 2);
});

test("'don't remember' (skip) carries no evidence", () => {
  const t: RankedTitle[] = [{ id: "a", reaction: "Good" }, { id: "b", reaction: "Good" }];
  const skipped = fitRanking(t, [{ a: "a", b: "b", outcome: "skip" }]);
  const none = fitRanking(t, []);
  assert.deepEqual(skipped.placements.map((p) => p.theta), none.placements.map((p) => p.theta));
  assert.equal(skipped.placements[0].comparisons, 0);
});

test("10.0 requires favorite flag AND #1 placement AND enough evidence", () => {
  const t: RankedTitle[] = [
    { id: "top", reaction: "Great", favorite: true }, { id: "fav2", reaction: "Great", favorite: true },
    { id: "c", reaction: "Good" },
  ];
  const comps = [...wins("top", "fav2", 2), ...wins("top", "c", 2), ...wins("fav2", "c", 2)];
  const p = byId(fitRanking(t, comps));
  assert.equal(p.top.score, 10);
  assert.ok(p.fav2.score < 10); // a favorite that isn't #1 shows its real score
  const noFav = byId(fitRanking(t.map((x) => ({ ...x, favorite: false })), comps));
  assert.ok(noFav.top.score <= 9.9);
});

test("display scores never increase down the list", () => {
  const t: RankedTitle[] = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, reaction: (["Bad", "Meh", "Fine", "Good", "Great"] as const)[i % 5] }));
  const comps: Comparison[] = [];
  for (let i = 0; i < 39; i++) comps.push(...wins(`t${i}`, `t${i + 1}`));
  const s = fitRanking(t, comps).placements.map((p) => p.score);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] <= s[i - 1], `${s[i - 1]} then ${s[i]}`);
  for (const v of s) assert.ok(v >= 0 && v <= 10 && Math.round(v * 10) === v * 10);
});

test("deterministic regardless of comparison order", () => {
  const t: RankedTitle[] = ["a", "b", "c", "d"].map((id) => ({ id, reaction: "Good" }));
  const comps = [...wins("a", "b"), ...wins("c", "d"), ...wins("b", "c")];
  const one = fitRanking(t, comps).placements.map((p) => [p.id, p.score]);
  const two = fitRanking(t, [...comps].reverse()).placements.map((p) => [p.id, p.score]);
  assert.deepEqual(one, two);
});

test("unknown titles and self-comparisons are ignored; duplicates rejected", () => {
  const r = fitRanking([{ id: "a", reaction: "Good" }], [...wins("a", "ghost"), ...wins("a", "a")]);
  assert.equal(r.placements[0].comparisons, 0);
  assert.throws(() => fitRanking([{ id: "a", reaction: "Good" }, { id: "a", reaction: "Bad" }], []));
});

test("score curve: reaction priors map to sensible starting scores", () => {
  assert.deepEqual([1.6, 0.8, 0, -0.8, -1.6].map(thetaToScore), [8.3, 6.9, 5, 3.1, 1.7]);
});

test("performance: 1,000 titles and 6,000 comparisons fit in well under a second", () => {
  const t: RankedTitle[] = Array.from({ length: 1000 }, (_, i) => ({ id: `t${i}`, reaction: "Good" }));
  const comps: Comparison[] = Array.from({ length: 6000 }, (_, k) => {
    const i = (k * 7919) % 1000, j = (k * 104729 + 1) % 1000;
    return { a: `t${Math.min(i, j)}`, b: `t${Math.max(i, j)}`, outcome: "a" as const };
  });
  const start = performance.now();
  fitRanking(t, comps);
  const ms = performance.now() - start;
  assert.ok(ms < 1000, `${ms.toFixed(0)}ms`);
});

test("isotonic smoothing pools only the violating neighbours", () => {
  assert.deepEqual(isotonicNonIncreasing([3, 1, 2, 0], [1, 1, 1, 1]), [3, 1.5, 1.5, 0]);
  assert.deepEqual(isotonicNonIncreasing([1, 2, 3], [1, 1, 1]), [2, 2, 2]);
});
