// Quota-aware Vitest maxWorkers: max(1, min(2, affinity, floor(quota/period)))
// for a finite positive cgroup CPU quota, else max(1, min(2, affinity)).
// Affinity is Node availableParallelism (fallback 1). Order: v2 cpu.max,
// then v1 cpu.cfs_quota_us + cpu.cfs_period_us, then affinity. v2 unlimited
// is `max`; v1 unlimited is a non-positive quota (usually -1). Malformed or
// missing values fall back to capped affinity. Conventional mounts only
// (v2 at /sys/fs/cgroup; v1 at .../cpu and .../cpu,cpuacct); the current
// path from /proc/self/cgroup plus every ancestor is checked, tightest wins.
import { availableParallelism as nodeAvailableParallelism } from 'node:os'
import { readFileSync } from 'node:fs'

export type WorkersFileReader = (path: string) => string | null

export interface ResolveMaxWorkersOptions {
  readFile?: WorkersFileReader
  availableParallelism?: number
}

const MAX_WORKERS_CAP = 2
const V2_MOUNT = '/sys/fs/cgroup'
const SELF_CGROUP = '/proc/self/cgroup'
const V1_MOUNTS = ['/sys/fs/cgroup/cpu', '/sys/fs/cgroup/cpu,cpuacct']

function defaultParallelism(): number {
  try {
    const value = Math.floor(nodeAvailableParallelism())
    if (Number.isFinite(value) && value >= 1) return value
  } catch {
    // fall through to 1
  }
  return 1
}

function normalizeAffinity(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1
}

function parseCpuMax(text: string): number | null {
  const parts = text.trim().split(/\s+/)
  if (parts.length !== 2 || parts[0] === 'max') return null
  const quota = Number(parts[0])
  const period = Number(parts[1])
  if (!Number.isFinite(quota) || !Number.isFinite(period)) return null
  if (quota <= 0 || period <= 0) return null
  return Math.floor(quota / period)
}

function parseQuotaPair(quotaText: string, periodText: string): number | null {
  const quota = Number(quotaText.trim())
  const period = Number(periodText.trim())
  if (!Number.isFinite(quota) || !Number.isFinite(period)) return null
  if (quota <= 0 || period <= 0) return null
  return Math.floor(quota / period)
}

function parseSelfCgroup(text: string): { v2: string; v1: string } {
  let v2 = '/'
  let v1 = '/'
  let seenV1 = false
  for (const line of text.split('\n')) {
    if (!line) continue
    const parts = line.split(':')
    if (parts.length < 3) continue
    const path = parts.slice(2).join(':') || '/'
    if (parts[1] === '') v2 = path
    else if (!seenV1 && parts[1].split(',').includes('cpu')) {
      v1 = path
      seenV1 = true
    }
  }
  return { v2, v1 }
}

function ancestors(cgroupPath: string): string[] {
  const segments: string[] = []
  for (const part of cgroupPath.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') return []
    segments.push(part)
  }
  const dirs: string[] = []
  for (let i = segments.length; i >= 0; i--) {
    dirs.push(i === 0 ? '/' : `/${segments.slice(0, i).join('/')}`)
  }
  return dirs
}

function read(reader: WorkersFileReader, path: string): string | null {
  try {
    const value = reader(path)
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

export function resolveMaxWorkers(options?: ResolveMaxWorkersOptions): number {
  const reader: WorkersFileReader =
    options?.readFile ?? ((path: string) => readFileSync(path, 'utf8'))
  const affinity = normalizeAffinity(
    typeof options?.availableParallelism === 'number'
      ? options.availableParallelism
      : defaultParallelism(),
  )
  const capped = Math.min(MAX_WORKERS_CAP, affinity)
  const cgroupText = read(reader, SELF_CGROUP)
  const { v2, v1 } = cgroupText === null ? { v2: '/', v1: '/' } : parseSelfCgroup(cgroupText)
  let best: number | null = null
  for (const dir of ancestors(v2)) {
    const file = dir === '/' ? `${V2_MOUNT}/cpu.max` : `${V2_MOUNT}${dir}/cpu.max`
    const text = read(reader, file)
    if (text === null) continue
    const quota = parseCpuMax(text)
    if (quota === null) continue
    if (best === null || quota < best) best = quota
  }
  if (best !== null) return Math.max(1, Math.min(capped, best))
  for (const mount of V1_MOUNTS) {
    for (const dir of ancestors(v1)) {
      const base = dir === '/' ? mount : `${mount}${dir}`
      const quotaText = read(reader, `${base}/cpu.cfs_quota_us`)
      if (quotaText === null) continue
      const periodText = read(reader, `${base}/cpu.cfs_period_us`)
      if (periodText === null) continue
      const quota = parseQuotaPair(quotaText, periodText)
      if (quota === null) continue
      if (best === null || quota < best) best = quota
    }
  }
  if (best !== null) return Math.max(1, Math.min(capped, best))
  return Math.max(1, capped)
}
