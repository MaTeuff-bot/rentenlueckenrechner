import type { AllocationTransition, BucketTarget, LifecycleConfig, Milestone } from './types.js';

export const PERCENT_SUM_TOLERANCE = 1e-12;

export function validateLifecycleConfig(config: LifecycleConfig): string | null {
  if (!config || !Array.isArray(config.buckets) || config.buckets.length === 0) return 'Lifecycle config needs at least one bucket';
  const ids = new Set<string>();
  const priorities = new Set<number>();
  for (const b of config.buckets) {
    if (typeof b.id !== 'string' || !b.id.trim()) return 'Lifecycle bucket id must be non-empty';
    if (ids.has(b.id)) return `Duplicate lifecycle bucket id ${b.id}`;
    ids.add(b.id);
    if (!['equityFund', 'bondFund', 'deposit'].includes(b.kind)) return `Unknown kind for bucket ${b.id}`;
    if (!Number.isInteger(b.priority) || b.priority <= 0) return `Priority for bucket ${b.id} must be a positive integer`;
    if (priorities.has(b.priority)) return `Duplicate priority ${b.priority} (bucket ${b.id})`;
    priorities.add(b.priority);
  }
  const settlement = config.buckets.find((b) => b.id === config.taxCashId);
  if (!settlement) return `Settlement deposit ${config.taxCashId} is not a configured bucket`;
  if (settlement.kind !== 'deposit') return `Settlement bucket ${config.taxCashId} must be a deposit`;
  if (!config.buckets.some((b) => b.kind === 'deposit')) return 'Lifecycle config needs at least one deposit bucket';

  if (!Array.isArray(config.milestones) || config.milestones.length === 0) return 'Lifecycle config needs at least one milestone';
  const names = new Set<string>();
  let prevStart = -Infinity;
  for (const m of config.milestones) {
    if (typeof m.name !== 'string' || !m.name.trim()) return 'Milestone name must be non-empty';
    if (names.has(m.name)) return `Duplicate milestone ${m.name}`;
    names.add(m.name);
    if (!Number.isInteger(m.startAge)) return `Milestone ${m.name} needs an integer startAge`;
    if (m.startAge <= prevStart) return `Milestones must be sorted by strictly increasing startAge (see ${m.name})`;
    prevStart = m.startAge;
    if (!m.targets || typeof m.targets !== 'object' || Array.isArray(m.targets)) {
      return `Milestone ${m.name} targets must be an object`;
    }
    const keys = Object.keys(m.targets);
    for (const id of ids) {
      const t = (m.targets as Record<string, BucketTarget>)[id];
      if (!t) return `Milestone ${m.name} misses target for bucket ${id}`;
      const err = checkTarget(m.name, id, t);
      if (err) return err;
    }
    for (const key of keys) {
      if (!ids.has(key)) return `Milestone ${m.name} references unknown bucket ${key}`;
    }
    const sum = sumPercentShares(m);
    if (sum > 1 + PERCENT_SUM_TOLERANCE) return `Milestone ${m.name} over-allocates percent shares (${sum})`;
  }

  if (!Array.isArray(config.transitions)) return 'Lifecycle transitions must be an array';
  const sorted = [...config.transitions].sort((a, b) => a.startAge - b.startAge);
  for (const t of sorted) {
    if (!names.has(t.fromMilestone)) return `Transition references unknown milestone ${t.fromMilestone}`;
    if (!names.has(t.toMilestone)) return `Transition references unknown milestone ${t.toMilestone}`;
    if (t.fromMilestone === t.toMilestone) return `Transition ${t.fromMilestone} must change milestone`;
    if (!Number.isInteger(t.startAge)) return `Transition ${t.fromMilestone}→${t.toMilestone} needs an integer startAge`;
    if (!Number.isInteger(t.durationYears) || t.durationYears < 0) {
      return `Transition ${t.fromMilestone}→${t.toMilestone} needs durationYears >= 0`;
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.startAge < prev.startAge + prev.durationYears) {
      return `Transitions overlap: ${cur.fromMilestone}→${cur.toMilestone} starts before ${prev.fromMilestone}→${prev.toMilestone} completes`;
    }
    if (cur.fromMilestone !== prev.toMilestone) {
      return `Transitions must chain: ${prev.fromMilestone}→${prev.toMilestone} is followed by ${cur.fromMilestone}→${cur.toMilestone}`;
    }
  }
  if (sorted.length > 0) {
    const referenced = new Set<string>([sorted[0].fromMilestone]);
    for (const t of sorted) referenced.add(t.toMilestone);
    for (const m of config.milestones) {
      if (!referenced.has(m.name) && m.name !== config.milestones[0].name) {
        return `Milestone ${m.name} is not reachable from the transition chain`;
      }
    }
    if (sorted[0].fromMilestone !== config.milestones[0].name) {
      return `First transition must start from initial milestone ${config.milestones[0].name}`;
    }
  }
  return null;
}

function checkTarget(milestone: string, id: string, t: BucketTarget): string | null {
  if (!t || typeof t !== 'object' || !('role' in t)) return `Milestone ${milestone} has an invalid target for bucket ${id}`;
  if (t.role === 'fixedReserve') {
    if (typeof t.amountToday !== 'number' || !Number.isFinite(t.amountToday) || t.amountToday < 0) {
      return `Milestone ${milestone} has an invalid reserve for bucket ${id}`;
    }
    if ('share' in t) return `Milestone ${milestone} mixes roles for bucket ${id}`;
    return null;
  }
  if (t.role === 'percent') {
    if (typeof t.share !== 'number' || !Number.isFinite(t.share) || t.share < 0 || t.share > 1) {
      return `Milestone ${milestone} has an invalid share for bucket ${id}`;
    }
    if ('amountToday' in t) return `Milestone ${milestone} mixes roles for bucket ${id}`;
    return null;
  }
  return `Milestone ${milestone} has an unknown role for bucket ${id}`;
}

function sumPercentShares(m: Milestone): number {
  return Object.values(m.targets).reduce((n, t) => (t.role === 'percent' ? n + t.share : n), 0);
}

export function transitionProgress(t: AllocationTransition, age: number): number {
  if (t.durationYears === 0) return age < t.startAge ? 0 : 1;
  return Math.min(1, Math.max(0, (age - t.startAge + 1) / (t.durationYears + 1)));
}

interface ActiveSlice {
  kind: 'single';
  milestone: Milestone;
}

interface BlendSlice {
  kind: 'blend';
  from: Milestone;
  to: Milestone;
  progress: number;
}

interface LifecycleTargetsDerived {
  sortedTransitions: AllocationTransition[];
  milestonesByName: Map<string, Milestone>;
  priorities: Map<string, number>;
}

function derivedOf(config: LifecycleConfig): LifecycleTargetsDerived {
  return {
    sortedTransitions: [...config.transitions].sort((a, b) => a.startAge - b.startAge),
    milestonesByName: new Map(config.milestones.map((m) => [m.name, m])),
    priorities: new Map(config.buckets.map((b) => [b.id, b.priority])),
  };
}

function milestoneByName(config: LifecycleConfig, name: string): Milestone {
  const m = derivedOf(config).milestonesByName.get(name);
  if (!m) throw new Error(`Unknown milestone ${name}`);
  return m;
}

// Later transitions start only after preceding ones complete. A chain of d=0
// transitions sharing one startAge therefore resolves to the LAST transition active
// at that age (each predecessor completes instantly), and a d>0 transition starting
// at the same age supersedes any same-age d=0 switch. Scan in sorted order and let
// the last active transition win instead of returning on the first match.
function activeSlice(config: LifecycleConfig, age: number): ActiveSlice | BlendSlice {
  const sorted = derivedOf(config).sortedTransitions;
  let candidate: ActiveSlice | BlendSlice | null = null;
  for (const t of sorted) {
    if (t.durationYears === 0) {
      if (age === t.startAge) {
        candidate = { kind: 'blend', from: milestoneByName(config, t.fromMilestone), to: milestoneByName(config, t.toMilestone), progress: 1 };
      }
      continue;
    }
    if (age >= t.startAge && age < t.startAge + t.durationYears) {
      candidate = {
        kind: 'blend',
        from: milestoneByName(config, t.fromMilestone),
        to: milestoneByName(config, t.toMilestone),
        progress: transitionProgress(t, age),
      };
    }
  }
  if (candidate) return candidate;
  let base = config.milestones[0];
  for (const t of sorted) {
    if (age >= t.startAge + t.durationYears) base = milestoneByName(config, t.toMilestone);
  }
  return { kind: 'single', milestone: base };
}

function priorityOf(config: LifecycleConfig, id: string): number {
  const priority = derivedOf(config).priorities.get(id);
  if (priority === undefined) throw new Error(`Unknown bucket ${id}`);
  return priority;
}

/**
 * Yearly euro targets against a nominal remainder anchor. `inflationFactor` is the
 * cumulative purchasing-power factor F for this year (finite `> 0`; `F = 1` is today;
 * compounding; deflation/non-monotonic allowed). Fixed claims are `amountToday * F`.
 */
export function resolveYearlyTargetsEuro(
  config: LifecycleConfig,
  age: number,
  remainderAnchorNominal: number,
  inflationFactor: number,
): { targetsNominal: Record<string, number>; shortfall: number } {
  const err = validateLifecycleConfig(config);
  if (err) throw new Error(err);
  return resolveYearlyTargetsEuroUnchecked(config, age, remainderAnchorNominal, inflationFactor);
}

/**
 * @internal Target resolution without the config-structure validation. The caller must have
 * validated `config` via `validateLifecycleConfig` already; the config is treated as
 * immutable afterwards. Value checks on the anchor and inflation factor are kept, so
 * invalid yearly inputs still throw exactly as with `resolveYearlyTargetsEuro`.
 * Used by the per-path solver loops, which resolve the same validated config dozens
 * of times per path and would otherwise re-run the structural validation every time.
 */
export function resolveYearlyTargetsEuroUnchecked(
  config: LifecycleConfig,
  age: number,
  remainderAnchorNominal: number,
  inflationFactor: number,
): { targetsNominal: Record<string, number>; shortfall: number } {
  if (!Number.isFinite(remainderAnchorNominal) || remainderAnchorNominal < 0) {
    throw new Error(`Invalid wealth anchor ${remainderAnchorNominal} at age ${age}`);
  }
  if (!Number.isFinite(inflationFactor) || inflationFactor <= 0) {
    throw new Error(`Invalid cumulative inflation factor ${inflationFactor} at age ${age}`);
  }
  const anchor = remainderAnchorNominal;
  const slice = activeSlice(config, age);
  if (slice.kind === 'single') return solveMilestone(config, slice.milestone, anchor, inflationFactor);
  return solveBlend(config, slice.from, slice.to, slice.progress, anchor, inflationFactor);
}

function solveMilestone(
  config: LifecycleConfig,
  milestone: Milestone,
  anchor: number,
  inflationFactor: number,
): { targetsNominal: Record<string, number>; shortfall: number } {
  const fixedClaims = config.buckets
    .filter((b) => milestone.targets[b.id].role === 'fixedReserve')
    .sort((a, b) => a.priority - b.priority)
    .map((b) => ({
      id: b.id,
      claim: (milestone.targets[b.id] as { role: 'fixedReserve'; amountToday: number }).amountToday * inflationFactor,
    }));
  const targets: Record<string, number> = {};
  let remaining = anchor;
  let shortfall = 0;
  for (const { id, claim } of fixedClaims) {
    const filled = Math.min(claim, remaining);
    targets[id] = filled;
    shortfall += claim - filled;
    remaining -= filled;
  }
  const remainder = remaining;
  for (const b of config.buckets) {
    const t = milestone.targets[b.id];
    if (t.role === 'percent') targets[b.id] = t.share * remainder;
  }
  return { targetsNominal: targets, shortfall };
}

function solveBlend(
  config: LifecycleConfig,
  from: Milestone,
  to: Milestone,
  p: number,
  anchor: number,
  inflationFactor: number,
): { targetsNominal: Record<string, number>; shortfall: number } {
  const fixedParts: Array<{ id: string; claim: number }> = [];
  const coefficients = new Map<string, number>();
  for (const b of config.buckets) {
    const a = from.targets[b.id];
    const c = to.targets[b.id];
    if (a.role === 'fixedReserve' && c.role === 'fixedReserve') {
      fixedParts.push({ id: b.id, claim: (a.amountToday * (1 - p) + c.amountToday * p) * inflationFactor });
    } else if (a.role === 'percent' && c.role === 'percent') {
      coefficients.set(b.id, a.share * (1 - p) + c.share * p);
    } else if (a.role === 'percent' && c.role === 'fixedReserve') {
      fixedParts.push({ id: b.id, claim: p * c.amountToday * inflationFactor });
      coefficients.set(b.id, (1 - p) * a.share);
    } else if (a.role === 'fixedReserve' && c.role === 'percent') {
      fixedParts.push({ id: b.id, claim: (1 - p) * a.amountToday * inflationFactor });
      coefficients.set(b.id, p * c.share);
    } else {
      throw new Error(`Milestone blend has an unknown role for bucket ${b.id}`);
    }
  }
  fixedParts.sort((x, y) => priorityOf(config, x.id) - priorityOf(config, y.id));
  const targets: Record<string, number> = {};
  const filledFixed = new Map<string, number>();
  let remaining = anchor;
  let shortfall = 0;
  for (const { id, claim } of fixedParts) {
    const filled = Math.min(claim, remaining);
    filledFixed.set(id, filled);
    shortfall += claim - filled;
    remaining -= filled;
  }
  const remainder = remaining;
  for (const b of config.buckets) {
    if (coefficients.has(b.id)) {
      targets[b.id] = (filledFixed.get(b.id) ?? 0) + (coefficients.get(b.id) ?? 0) * remainder;
    } else {
      targets[b.id] = filledFixed.get(b.id) ?? 0;
    }
  }
  return { targetsNominal: targets, shortfall };
}
