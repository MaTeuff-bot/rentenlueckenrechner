# Quota-aware test workers: verification

Base: `b78936c` (PR #76). Task: `t_b57b1361`. Measured 2026-10-01.

## Scope and result

Only Vitest worker selection, its tests, Node TypeScript config, and documentation change. Existing 702 application tests, fixtures, assertions, statistical samples, production code, dependencies, Playwright config, and all timeout budgets are unchanged. The global Vitest timeout remains 10 seconds; existing individual allowances remain as-is. Added 28 worker/config tests bring the suite to 730 tests / 39 files.

The demonstrated benefit is timeout reliability on this one-CPU container. No sustained wall-clock speedup is established. No safe fixture reduction was identified: the heavy calculator/hook fixtures already use a minimal horizon; input edits must recompute, reloads must render again, and determinism must compare separate real runs. Splitting/caching/reducing samples would not be an acceptable shortcut.

## Environment and method

- Same isolated worktree, dependencies, and container for baseline and candidate; suites run serially without concurrent coding or test processes.
- Node v20.20.2, Vitest 4.1.10; `availableParallelism()` and CPU count both report 8.
- Cgroup v2 `/proc/self/cgroup`: `0::/`; `cpu.max`: `100000 100000` (one CPU); effective cpuset: `0-7`. No resource changes.
- Baseline fixed `maxWorkers: 2`; candidate resolves **1**. Pure fixtures independently check two-CPU quota => **2**, affinity tighter than quota, fractional quota, v1/v2 hierarchy, unlimited/malformed/missing reads, and actual config integration. Independent reviewer also exercised actual resolver => 1.
- Wall time measured around `subprocess.run` using Python `time.monotonic`, including npm startup. Baseline and candidate profiling used `npm test -- --run --reporter=default --reporter=json --outputFile=<path>`; final repeatability runs used exactly `npm test -- --run`. No worker overrides, retries, or altered assertions.
- Raw JSON includes all per-test durations; full per-test/per-file CSVs and logs are retained with the task evidence. Summed test durations are not wall time.

## Local measurements

| Run | Workers | Wall seconds | Result |
|---|---:|---:|---|
| Baseline, profiling reporters | 2 | 223.46 | 698/702; four timeouts; 38 files |
| Candidate, same profiling reporters | 1 | 215.70 | 730/730; 39 files |
| Final ordinary command, run 1 | 1 | 233.14 | 730/730; 39 files |
| Final ordinary command, run 2 (consecutive) | 1 | 221.25 | 730/730; 39 files |
| Baseline maintained Playwright | 1 | 298.02 | 9/9 |
| Final maintained Playwright | 1 | 297.36 | 9/9 |

The one comparable profiling pair is about 3.5% shorter wall time, but final ordinary runs straddle the baseline. This is not evidence for a general performance target or 30–40% speedup. Summed test execution fell from 332.05s to 165.23s under lower contention, while removing concurrency means that improvement does not translate directly to suite wall time. Three candidate full runs passed; this does not guarantee flake elimination under all loads.

Selected per-test profiling durations (seconds):

| Test | Baseline / 2 workers | Candidate / 1 worker |
|---|---:|---:|
| Calculator: edits/adds/removes income streams | 23.97 (20s timeout) | 11.35 |
| Legacy insurance persistence reload | 22.21 (20s timeout) | 9.46 |
| Guided insurance persistence incomplete/completed transition | 18.91 | 8.28 |
| Hook: updates output and adds/removes income streams | 17.80 (10s timeout) | 9.16 |
| Results-to-inputs required-capital/spending navigation | 14.58 | 7.45 |
| Stochastic identical-settings determinism | 11.60 (10s timeout) | 5.44 |

Synchronous work can overrun the nominal timeout before Vitest reports failure. The hook test still has limited margin under its unchanged 10s budget. No new allowances were necessary for the three green candidate runs.

## Review and gates

- Independent fresh-context review: no blocking findings. Specifically audited byte-unchanged application tests, actual cgroup selection, two-CPU fixtures, tight ancestors, and portable host tests. One README fallback wording error was corrected: failed affinity lookup conservatively selects 1, not `cpus().length`.
- Coordinator verified lint, `npx tsc -b`, production build, two consecutive ordinary full Vitest runs, and maintained Playwright suite. Playwright desktop Chromium plus narrow smoke is not Safari/mobile-browser equivalence.
- Planning and implementation used the configured Codex Meta `muse-spark-1.3-contributor` / `xhigh` lane. Coordinator preserved the diff when a lane revision repeated completed checks, then independently verified it. Coordinator made documentation/evidence edits only.
- Baseline and profiled candidate emitted the existing React suspended-resource `act(...)` warning; no assertion failure resulted. It is not hidden by a config change.
- Clean install reported 4 existing dependency vulnerabilities (2 moderate, 2 high); dependencies were intentionally not changed in this scope.

## Limits and tradeoffs

Worker discovery supports conventional `/sys/fs/cgroup` v2 and `cpu` / `cpu,cpuacct` v1 mounts and walks the process cgroup's ancestors. Custom mount points and non-root mount-root remapping are not handled; quota detection may fall back to capped affinity there. This is not universal cgroup discovery. The two-worker cap intentionally underuses larger runners; floor division conservatively uses one worker for a 1.5-CPU quota. Host integration only independently checks a readable finite root-unified v2 quota; portable fixtures cover other supported layouts.

No hosted PR preview: this repository deploys production Pages, and this tooling-only change does not introduce preview infrastructure. No production deployment or merge is authorized by this verification.
