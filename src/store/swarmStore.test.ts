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

import { useSwarmStore } from './swarmStore'
import { runSwarmSlice, type SwarmSampleWindow } from '../lib/swarm/swarmEngine'

type OnWindow = (w: SwarmSampleWindow) => void

function sampleWindow(sent: number): SwarmSampleWindow {
  return { windowStartMs: 0, windowEndMs: 100, sent, ok: sent, fail: 0, codes: { 200: sent }, latencies: [50] }
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
