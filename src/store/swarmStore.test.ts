import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TestConfig } from '../lib/types'

vi.mock('../lib/swarm/swarmNetwork', () => ({
  hostSwarm: vi.fn(() => ({
    peer: {},
    connections: new Map(),
    broadcast: vi.fn(),
    close: vi.fn(),
  })),
  joinSwarm: vi.fn(),
  randomRoomId: () => 'room01',
}))

const slices: Array<{ resolve: () => void; reject: (e: unknown) => void }> = []
vi.mock('../lib/swarm/swarmEngine', () => ({
  SEQ_BLOCK_WIDTH: 1_000_000,
  runSwarmSlice: vi.fn(() => new Promise<void>((resolve, reject) => { slices.push({ resolve, reject }) })),
}))

import { useSwarmStore, swarmSummary, buildSwarmReport } from './swarmStore'
import { LatencyStats } from '../lib/percentile'
import { runSwarmSlice, type SwarmSampleWindow } from '../lib/swarm/swarmEngine'

type OnWindow = (w: SwarmSampleWindow) => void

function sampleWindow(sent: number): SwarmSampleWindow {
  return { windowStartMs: 0, windowEndMs: 100, sent, ok: sent, fail: 0, skipped: 0, codes: { 200: sent }, latencies: [50] }
}

const cfg = { constDur: 30, constDurUnit: 's' } as TestConfig

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('swarmStore host ui timer (#54)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    useSwarmStore.getState().leave()
    slices.length = 0
    vi.useRealTimers()
  })

  it('clears the progress interval when the host run completes', async () => {
    const s = useSwarmStore.getState()
    s.startHost(cfg, 'constant', 'pw')
    s.startTestOnHost()
    expect(vi.getTimerCount()).toBe(1)

    slices[0].resolve()
    await flushMicrotasks()

    expect(useSwarmStore.getState().status).toBe('done')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not orphan the previous interval when a second run starts', () => {
    const s = useSwarmStore.getState()
    s.startHost(cfg, 'constant', 'pw')
    s.startTestOnHost()
    s.startTestOnHost()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('surfaces a rejected host slice as an error instead of staying running forever (#80)', async () => {
    const s = useSwarmStore.getState()
    s.startHost(cfg, 'constant', 'pw')
    s.startTestOnHost()

    slices[0].reject(new Error('bad config'))
    await flushMicrotasks()

    expect(useSwarmStore.getState().status).toBe('error')
    expect(useSwarmStore.getState().errorMsg).toBe('bad config')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resets throughput trackers and host share on a re-run without leaving (#64)', async () => {
    const s = useSwarmStore.getState()
    s.startHost(cfg, 'constant', 'pw')
    s.startTestOnHost()

    // run 1: host-self reports a sample 5s in, then the run completes
    const onWindow1 = vi.mocked(runSwarmSlice).mock.calls[0][3] as OnWindow
    vi.advanceTimersByTime(5000)
    onWindow1(sampleWindow(10))
    slices[0].resolve()
    await flushMicrotasks()

    // run 2 without leave(): share must be back to 1 (host-self is not a remote
    // node) and the first sample must not emit a point at run 1's timestamp
    s.startTestOnHost()
    const shareRef2 = vi.mocked(runSwarmSlice).mock.calls[1][2] as { value: number }
    expect(shareRef2.value).toBe(1)

    const onWindow2 = vi.mocked(runSwarmSlice).mock.calls[1][3] as OnWindow
    onWindow2(sampleWindow(3))
    expect(useSwarmStore.getState().tputPts).toEqual([])
  })
})

const reportCfg = {
  ...cfg,
  parsed: { url: 'https://api.test/x', method: 'GET', headers: {}, body: null },
} as TestConfig

function makeAgg(latencies: number[]) {
  const stats = new LatencyStats()
  for (const l of latencies) stats.add(l)
  return {
    sent: latencies.length,
    ok: latencies.length - 1,
    fail: 1,
    skipped: 0,
    codes: { 200: latencies.length - 1, 500: 1 },
    latencies: latencies.slice(-5000),
    stats,
  }
}

describe('swarmSummary / buildSwarmReport aggregation (#91)', () => {
  it('summarizes counts, success rate and percentiles', () => {
    const agg = makeAgg([10, 20, 30, 40, 1000])
    const s = swarmSummary(agg)
    expect(s.sent).toBe(5)
    expect(s.successRate).toBe('80.0')
    expect(s.avg).toBe(Math.round((10 + 20 + 30 + 40 + 1000) / 5))
    expect(s.p95).toBe(1000)
  })

  it('computes summary stats over all samples, beyond the 5000-entry display cap (#88)', () => {
    const lats = [...Array(3000).fill(1000), ...Array(3000).fill(10)]
    const s = swarmSummary(makeAgg(lats))
    // capped-array math saw only the last 5000 samples (avg 406); true avg is 505
    expect(s.avg).toBe(505)
  })

  it('buildSwarmReport mirrors the summary into report meta', () => {
    const state = {
      role: 'host', status: 'done', totalMs: 10_000,
      agg: makeAgg([10, 20, 30, 40, 1000]),
      nodes: {
        'host-self': { nodeId: 'host-self', connected: true, sent: 3, ok: 3, fail: 0, lat: [] },
        'node-1': { nodeId: 'node-1', connected: true, sent: 2, ok: 1, fail: 1, lat: [] },
      },
    }
    const report = buildSwarmReport(state as never, reportCfg, 'constant')!
    expect(report.meta.total).toBe(5)
    expect(report.meta.maxLatMs).toBe(1000)
    expect(report.meta.nodeCount).toBe(2)
    expect(report.nodes).toHaveLength(2)
    expect(report.statusCodes[500]).toBe(1)
  })

  it('buildSwarmReport returns null for a node or an idle host', () => {
    const base = { agg: makeAgg([10]), nodes: {}, totalMs: 0 }
    expect(buildSwarmReport({ ...base, role: 'node', status: 'done' } as never, reportCfg, 'constant')).toBeNull()
    expect(buildSwarmReport({ ...base, role: 'host', status: 'idle' } as never, reportCfg, 'constant')).toBeNull()
  })
})
