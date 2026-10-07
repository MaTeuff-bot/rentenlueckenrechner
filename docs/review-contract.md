# Review contract

Authoritative verification and review rules for this repo. See also
[docs/browser-tests.md](browser-tests.md) for the browser suite.

- Repair via commit/push before authoritative review: fixes land as commits
  on the reviewed branch first; reviewing uncommitted local edits is not
  authoritative.
- Exact-head CI: the authoritative gate is `.github/workflows/pr.yml`
  (`validate`) on the exact PR head SHA. Rebase or amend, then re-run CI.
- Dirty reviews are advisory only: any uncommitted or unstaged change in the
  reviewed tree disqualifies the result as authoritative; state the dirt.
- Flake claims require >=3 reruns plus a server/build environment check:
  confirm no stale `dist/`, no foreign preview server on port 4173, and a
  fresh build before calling a failure a flake.
- Read-only reviews never stash or change files: no `git stash`, checkout,
  or edits to inspect a baseline. Use an isolated worktree for the baseline
  instead (never nested inside the repo).
- Piped output must retain the true command exit code: use `set -o pipefail`
  (or avoid pipes) so `cmd | tee` still fails when `cmd` fails.
