export type {
  AllocationTransition,
  BucketTarget,
  LifecycleBucketDef,
  LifecycleBucketKind,
  LifecycleConfig,
  LifecycleResult,
  LifecycleTrade,
  LifecycleYearInput,
  LifecycleYearReport,
  Milestone,
} from './types.js';
export { resolveYearlyTargetsEuro, resolveYearlyTargetsEuroUnchecked, validateLifecycleConfig } from './targets.js';
export { buildRebalancePlan } from './rebalance.js';
export { prefillTargetsFromHoldings } from './prefill.js';
export { createLifecycleState, simulateLifecycle, simulateLifecycleYear } from './engine.js';
export { liquidateLifecycle } from './terminal.js';
