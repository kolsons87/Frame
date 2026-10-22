/**
 * End-to-end calibration check. A simulated user with a hidden "true taste"
 * ranks 150 titles one at a time: picks a reaction from their true quantile,
 * answers each insertion question with realistic noise, and the model refits.
 * We check that the result recovers their taste and keeps scores honest.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answer, fitRanking, insertAt, nextOpponent, placementSlot, startSession,
  type Comparison, type Reaction, type RankedTitle,
} from "../src/index.ts";

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function simulate(seed: number, n = 150) {
  const rand = rng(seed);
  const truth = Array.from({ length: n }, () => {
    // Box-Muller normal
    return Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  });
  const sorted = [...truth].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.floor(p * (n - 1))];
  const reactionOf = (v: number): Reaction =>
    v > q(0.8) ? "Great" : v > q(0.55) ? "Good" : v > q(0.3) ? "Fine" : v > q(0.12) ? "Meh" : "Bad";

  let titles: RankedTitle[] = []; // the user's ordered list, strongest first
  const history: Comparison[] = [];
  let questions = 0;
  for (let i = 0; i < n; i++) {
    const id = `t${i}`;
    const reaction = reactionOf(truth[i] + (rand() - 0.5) * 0.3); // reactions are a bit fuzzy too
    const current = fitRanking(titles, history).placements;
    let s = startSession(id, reaction, current);
    while (!s.done) {
      const opp = nextOpponent(s)!;
      const j = Number(opp.slice(1));
      const pNew = 1 / (1 + Math.exp(-3 * (truth[i] - truth[j]))); // noisy preference
      const r = rand();
      s = answer(s, r < 0.03 ? "skip" : r < pNew ? "new" : "other");
      questions++;
    }
    titles = insertAt(titles, { id, reaction }, placementSlot(s));
    history.push(...s.comparisons);
  }
  const fit = fitRanking(titles, history);
  return { truth, titles, fit, questions };
}

function kendallTau(a: number[], b: number[]) {
  let c = 0, d = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++) {
      const s = Math.sign(a[i] - a[j]) * Math.sign(b[i] - b[j]);
      if (s > 0) c++; else if (s < 0) d++;
    }
  return (c - d) / (c + d);
}

for (const seed of [1, 2, 3]) {
  test(`simulated user (seed ${seed}): recovers taste, keeps scores honest`, () => {
    const { truth, fit, questions } = simulate(seed);
    const score = new Map(fit.placements.map((p) => [p.id, p]));
    const fitted = truth.map((_, i) => -score.get(`t${i}`)!.position);
    const tau = kendallTau(truth, fitted);
    // The simulated user answers ~19–24% of questions against their own hidden
    // taste (close calls are hard). Measured tau at that noise: 0.726–0.775;
    // with a steadier user (~17% wrong) 0.807–0.851. 0.70 guards regressions.
    assert.ok(tau > 0.7, `order agreement tau=${tau.toFixed(3)}`);

    const greats = fit.placements.filter((p) => p.reaction === "Great").map((p) => p.score);
    assert.ok(greats.some((s) => s < 9.0), "some Great titles should score below 9.0");
    const high = fit.placements.filter((p) => p.score >= 9.5).length / fit.placements.length;
    assert.ok(high < 0.1, `${(high * 100).toFixed(1)}% of titles at 9.5+ is too generous`);
    assert.ok(fit.placements.every((p) => p.score < 10), "no 10.0 without an explicit favorite");
    assert.ok(questions / truth.length <= 8, `${(questions / truth.length).toFixed(1)} questions per title`);
  });
}
