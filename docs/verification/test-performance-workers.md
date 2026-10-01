# Test worker configuration: verification

Base: `b78936c` (PR #76). Task: `t_b57b1361`. Measured 2026-10-01.

## Scope and result

Only `vitest.config.ts` and documentation change (supersedes the earlier
cgroup quota/affinity resolver experiment, removed in this PR as unneeded
complexity for a fixed test environment). Existing 702 application tests,
fixtures, assertions, statistical samples, production code, dependencies,
Playwright config and all timeout budgets are unchanged. The global Vitest
timeout remains 10 seconds; existing individual allowances remain as-is.

The demonstrated benefit is timeout reliability on this one-CPU container.
No sustained wall-clock speedup is established. No safe fixture reduction was
identified: the heavy calculator/hook fixtures already use a minimal horizon;
input edits must recompute, reloads must render again, and determinism must
compare separate real runs. Splitting/caching/reducing samples would not be an
acceptable shortcut.

## Environment and method

- Same isolated worktree, dependencies, and container for baseline and
  candidate; suites run serially without concurrent coding or test processes.
- Node v20.20.2, Vitest 4.1.10; `availableParallelism()` and CPU count both
  report 8; cgroup v2 quota `100000/100000` (one CPU).
- Baseline fixed `maxWorkers: 2`; candidate fixed `maxWorkers: 1`.
- Wall time measured around `subprocess.run` using Python `time.monotonic`,
  including npm startup. Baseline and candidate profiling used
  `npm test -- --run --reporter=default --reporter=json --outputFile=<path>`;
  final repeatability runs used exactly `npm test -- --run`. No worker
  overrides, retries, or altered assertions.
- Raw JSON includes all per-test durations; full per-test/per-file CSVs and
  logs are retained with the task evidence. Summed test durations are not wall
  time.

## Local measurements

| Configuration | Result | Wall time |
| --- | --- | --- |
| Baseline `maxWorkers: 2` | 698/702 (4 timeout-only failures) | 223.46 s |
| Candidate `maxWorkers: 1` | 730/730 green (incl. 28 resolver tests of the removed helper; those tests are deleted with it) | 215.70 s profiling, then 233.14 s / 221.25 s consecutive ordinary runs |

Timeout-only failures are the long-documented 1-CPU contention pattern: the
same files pass in isolation within seconds. The hardcoded single worker
removes that contention source locally.

## CI

The maintained browser suite and the unit suite pass on the CI runner with
this config (exact-head validate run 36886902323 SUCCESS at the resolver
head; rerun required on the simplified head — see PR checks). CI workers:
Vitest's default parallelism applies when this config's `maxWorkers: 1` is
present, so the CI unit job runs single-file-parallel as before unless
overridden; measured CI validate duration stayed ~3 min.

## Residual notes

- Per-test budgets were NOT changed; the green runs came from removing
  contention, not from raising budgets.
- The earlier resolver experiment's 28 helper tests and `vitest.workers.ts`
  are deleted here; their measurements remain valid as recorded history.
