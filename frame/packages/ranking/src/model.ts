/**
 * Frame ranking model.
 *
 * Inputs are the user's raw history for ONE pool (movies or full shows):
 *   - the user's ordered list (strongest first). Order is authoritative: each
 *     title was inserted exactly where its comparison answers put it, so the
 *     list never contradicts a direct answer the user gave.
 *   - each title's chosen reaction (Great…Bad)
 *   - every pairwise comparison they have answered
 *
 * Output: the same order with a 0.0–10.0 score per title.
 *
 * Scores (Bradley–Terry with reaction priors, MAP estimate):
 *   Each title i has a latent strength θ_i. The chance the user prefers i over j
 *   is σ(θ_i − θ_j). The reaction sets a Gaussian prior θ_i ~ N(μ_reaction, τ²).
 *   We maximise  Σ log-likelihood(comparisons) + Σ log-prior.
 *
 *   Why this shape:
 *   - Comparisons decide order (via insertion); the model only decides how
 *     far apart neighbours are. Fitted strengths are then made non-increasing
 *     down the list (weighted isotonic regression), so a higher-placed title
 *     never shows a lower number.
 *   - Sparse history stays near the reaction instead of jumping to extremes,
 *     so a first-ever Great lands ≈8.3, not 10.0.
 *   - Contradictions ("A>B, B>C, C>A") are absorbed, never crash or loop.
 *   - Scores are recomputed from raw history, so the model can be retuned
 *     later without losing data (bump MODEL_VERSION).
 *
 * The score mapping is a fixed logistic curve on θ, not rank percentiles, so a
 * user's 8.3 means the same thing whether they have 5 or 500 titles ranked.
 */

export const MODEL_VERSION = "bt-prior-1";

export type Reaction = "Great" | "Good" | "Fine" | "Meh" | "Bad";
export const REACTIONS: readonly Reaction[] = ["Bad", "Meh", "Fine", "Good", "Great"];

/** Outcome from the perspective of `a`. "skip" = "don't remember"; carries no evidence. */
export type Outcome = "a" | "b" | "tie" | "skip";

export interface Comparison {
  a: string;
  b: string;
  outcome: Outcome;
}

export interface RankedTitle {
  id: string;
  reaction: Reaction;
  /** Explicit "all-time favorite" signal. Shows 10.0 only while placed #1. */
  favorite?: boolean;
}

export interface Placement {
  id: string;
  reaction: Reaction;
  /** 1-based position in the pool. */
  position: number;
  /** Display score, one decimal, 0.0–10.0. */
  score: number;
  /** Latent strength and its approximate standard deviation. */
  theta: number;
  sd: number;
  /** Count of non-skip comparisons involving this title. */
  comparisons: number;
  /** True when evidence is too thin to trust the decimal. */
  provisional: boolean;
}

export interface Conflict {
  /** Title the user preferred… */
  winner: string;
  /** …over a title they had given a clearly better reaction. */
  loser: string;
  tierGap: number;
}

export interface FitResult {
  modelVersion: string;
  placements: Placement[];
  conflicts: Conflict[];
}

export interface FitOptions {
  /** Prior mean of θ for each reaction. */
  priorMean?: Record<Reaction, number>;
  /** Prior standard deviation. Smaller = reactions matter more. */
  priorSd?: number;
  /**
   * Flag provisional below this many answered comparisons. (Not sd-based: a
   * title that wins every comparison carries little Fisher information, so its
   * sd stays high exactly when the user has been most decisive. `sd` is still
   * returned for an optional confidence display.)
   */
  minComparisons?: number;
  maxIterations?: number;
  tolerance?: number;
}

export const DEFAULTS: Required<FitOptions> = {
  priorMean: { Great: 1.6, Good: 0.8, Fine: 0, Meh: -0.8, Bad: -1.6 },
  priorSd: 1.0,
  minComparisons: 2,
  maxIterations: 500,
  tolerance: 1e-9,
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const tier = (r: Reaction) => REACTIONS.indexOf(r);

/** Map latent strength to the 0.0–9.9 display scale (10.0 is reserved). */
export function thetaToScore(theta: number): number {
  return Math.min(9.9, Math.round(100 * sigmoid(theta)) / 10);
}

export function fitRanking(
  titles: RankedTitle[],
  comparisons: Comparison[],
  options: FitOptions = {},
): FitResult {
  const o = { ...DEFAULTS, ...options, priorMean: { ...DEFAULTS.priorMean, ...options.priorMean } };
  const index = new Map<string, number>();
  titles.forEach((t, i) => {
    if (index.has(t.id)) throw new Error(`Duplicate title ${t.id}`);
    if (!REACTIONS.includes(t.reaction)) throw new Error(`Unknown reaction for ${t.id}`);
    index.set(t.id, i);
  });

  // Keep only usable evidence: both titles present, not self, not skipped.
  const evidence: { i: number; j: number; y: number }[] = [];
  const counts = new Array(titles.length).fill(0);
  for (const c of comparisons) {
    if (c.outcome === "skip") continue;
    const i = index.get(c.a), j = index.get(c.b);
    if (i === undefined || j === undefined || i === j) continue;
    const y = c.outcome === "a" ? 1 : c.outcome === "b" ? 0 : 0.5;
    evidence.push({ i, j, y });
    counts[i]++;
    counts[j]++;
  }

  const n = titles.length;
  const mu = titles.map((t) => o.priorMean[t.reaction]);
  const precision = 1 / (o.priorSd * o.priorSd);
  const theta = mu.slice();
  const grad = new Array(n).fill(0);
  const hess = new Array(n).fill(0);

  // Damped diagonal Newton. The objective is strictly concave (Gaussian prior),
  // so this converges to the unique maximum.
  for (let iter = 0; iter < o.maxIterations; iter++) {
    for (let k = 0; k < n; k++) {
      grad[k] = -(theta[k] - mu[k]) * precision;
      hess[k] = precision;
    }
    for (const { i, j, y } of evidence) {
      const p = sigmoid(theta[i] - theta[j]);
      const g = y - p, w = p * (1 - p);
      grad[i] += g; grad[j] -= g;
      hess[i] += w; hess[j] += w;
    }
    let maxStep = 0;
    for (let k = 0; k < n; k++) {
      // Half-step damping keeps the Jacobi update stable on dense graphs.
      const step = Math.max(-1, Math.min(1, (0.5 * grad[k]) / hess[k]));
      theta[k] += step;
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    if (maxStep < o.tolerance) break;
  }

  // Order is the user's list. Smooth strengths so they never increase down it.
  const smoothed = isotonicNonIncreasing(theta, hess);
  const order = titles.map((t, k) => ({ t, k }));

  const placements: Placement[] = order.map(({ t, k }, pos) => {
    const sd = 1 / Math.sqrt(hess[k]);
    const provisional = counts[k] < o.minComparisons;
    // 10.0 needs BOTH the explicit favorite flag and the #1 placement.
    const score = pos === 0 && t.favorite && !provisional ? 10 : thetaToScore(smoothed[k]);
    return {
      id: t.id,
      reaction: t.reaction,
      position: pos + 1,
      score,
      theta: smoothed[k],
      sd,
      comparisons: counts[k],
      provisional,
    };
  });

  // Surface (never silently resolve) answers that contradict the user's own
  // reactions by two or more tiers, e.g. preferring a "Fine" over a "Great".
  const conflicts: Conflict[] = [];
  for (const { i, j, y } of evidence) {
    if (y === 0.5) continue;
    const [w, l] = y === 1 ? [i, j] : [j, i];
    const gap = tier(titles[l].reaction) - tier(titles[w].reaction);
    if (gap >= 2) conflicts.push({ winner: titles[w].id, loser: titles[l].id, tierGap: gap });
  }

  return { modelVersion: MODEL_VERSION, placements, conflicts };
}

/**
 * Pool-adjacent-violators: closest non-increasing sequence to `values`
 * (weighted least squares). Titles the data can't separate share a score.
 */
export function isotonicNonIncreasing(values: number[], weights: number[]): number[] {
  const blocks: { sum: number; w: number; len: number }[] = [];
  values.forEach((v, i) => {
    blocks.push({ sum: v * weights[i], w: weights[i], len: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
      if (b.sum / b.w <= a.sum / a.w) break; // already non-increasing
      a.sum += b.sum; a.w += b.w; a.len += b.len;
      blocks.pop();
    }
  });
  return blocks.flatMap((b) => Array(b.len).fill(b.sum / b.w));
}

/** Insert a title into the ordered list at the slot an insertion session chose. */
export function insertAt<T>(list: T[], item: T, slot: number): T[] {
  const i = Math.max(0, Math.min(list.length, slot));
  return [...list.slice(0, i), item, ...list.slice(i)];
}
