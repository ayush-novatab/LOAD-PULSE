import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TestConfig } from '../types'

vi.mock('../fetcher', () => ({
  fireRequest: vi.fn(() => Promise.resolve({ ok: true, status: 200, lat: 5 })),
  makeSemaphore: () => ({ acquire: () => Promise.resolve(), release: () => {} }),
}))

import { runSwarmSlice } from './swarmEngine'
import { fireRequest } from '../fetcher'

const cfg = {
  parsed: { url: 'https://api.test/x', method: 'GET', headers: {}, body: null },
  constRate: 10, constRateUnit: 's',
  constDur: 1, constDurUnit: 's',
  concur: 5, timeout: 1000,
  scMin: 200, scMax: 299,
  latThreshOn: false, latThresh: 2000,
  bodyCheckOn: false, bodyCheck: '',
} as unknown as TestConfig

describe('runSwarmSlice pacing', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(fireRequest).mockClear()
  })

  it('dispatches exactly rate*duration requests — no pre-seeded extra tick (#60)', async () => {
    const ac = new AbortController()
    const done = runSwarmSlice(cfg, 'constant', { value: 1 }, () => {}, ac.signal)

    await vi.advanceTimersByTimeAsync(1100)
    await done

    // 10 rps for 1s = 10 requests; the old accum pre-seed made this 11
    expect(vi.mocked(fireRequest)).toHaveBeenCalledTimes(10)
  })
})
