export const DUST_EUR = 0.01;

export interface RebalanceLeg {
  bucketId: string;
  side: 'buy' | 'sell';
  euros: number;
}

export interface RebalancePlan {
  sells: RebalanceLeg[];
  buys: RebalanceLeg[];
}

export function buildRebalancePlan(
  valuesNominal: Record<string, number>,
  targetsNominal: Record<string, number>,
  priorities: Record<string, number>,
): RebalancePlan {
  const sells: RebalanceLeg[] = [];
  const buys: RebalanceLeg[] = [];
  for (const id of Object.keys(targetsNominal)) {
    const value = valuesNominal[id];
    const target = targetsNominal[id];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid value for bucket ${id}`);
    if (typeof target !== 'number' || !Number.isFinite(target) || target < 0) {
      throw new Error(`Invalid target for bucket ${id}`);
    }
    const delta = target - value;
    if (delta < -DUST_EUR) sells.push({ bucketId: id, side: 'sell', euros: -delta });
    else if (delta > DUST_EUR) buys.push({ bucketId: id, side: 'buy', euros: delta });
  }
  sells.sort((a, b) => b.euros - a.euros || (priorities[a.bucketId] ?? 0) - (priorities[b.bucketId] ?? 0));
  buys.sort(
    (a, b) => (priorities[a.bucketId] ?? 0) - (priorities[b.bucketId] ?? 0) || b.euros - a.euros,
  );
  return { sells, buys };
}
