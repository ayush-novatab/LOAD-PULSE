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

const sliceResolvers: Array<() => void> = []
vi.mock('../lib/swarm/swarmEngine', () => ({
  SEQ_BLOCK_WIDTH: 1_000_000,
  runSwarmSlice: vi.fn(() => new Promise<void>(res => { sliceResolvers.push(res) })),
}))

import { useSwarmStore } from './swarmStore'

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
    sliceResolvers.length = 0
    vi.useRealTimers()
  })

  it('clears the progress interval when the host run completes', async () => {
    const s = useSwarmStore.getState()
    s.startHost(cfg, 'constant', 'pw')
    s.startTestOnHost()
    expect(vi.getTimerCount()).toBe(1)

    sliceResolvers[0]()
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
})
