import type { BucketTarget, LifecycleBucketKind } from './types.js';

export function prefillTargetsFromHoldings(
  valuesNominal: Record<string, number>,
  kinds: Record<string, LifecycleBucketKind>,
): Record<string, BucketTarget> {
  const ids = Object.keys(valuesNominal);
  if (ids.length === 0) throw new Error('Prefill needs at least one holding value');
  for (const id of ids) {
    const v = valuesNominal[id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error(`Prefill needs a finite nonneg value for bucket ${id}`);
    }
    if (!kinds[id]) throw new Error(`Prefill misses kind for bucket ${id}`);
  }
  const total = ids.reduce((n, id) => n + valuesNominal[id], 0);
  if (!(total > 0)) throw new Error('Prefill needs positive total wealth; supply explicit targets at zero wealth');
  const targets: Record<string, BucketTarget> = {};
  for (const id of ids) targets[id] = { role: 'percent', share: valuesNominal[id] / total };
  return targets;
}
