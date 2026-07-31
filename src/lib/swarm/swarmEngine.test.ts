import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TestConfig } from '../types'

vi.mock('../fetcher', () => ({
  fireRequest: vi.fn(() => Promise.resolve({ ok: true, status: 200, lat: 5 })),
  makeSemaphore: () => ({ acquire: () => Promise.resolve(), release: () => {} }),
}))

import { runSwarmSlice, type SwarmSampleWindow } from './swarmEngine'
import { fireRequest } from '../fetcher'

const okResult = { ok: true, status: 200, lat: 5 }

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
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fireRequest).mockClear()
    vi.mocked(fireRequest).mockImplementation(() => Promise.resolve(okResult) as ReturnType<typeof fireRequest>)
  })
  afterEach(() => vi.useRealTimers())

  it('dispatches exactly rate*duration requests — no pre-seeded extra tick (#60)', async () => {
    const ac = new AbortController()
    const done = runSwarmSlice(cfg, 'constant', { value: 1 }, () => {}, ac.signal)

    await vi.advanceTimersByTimeAsync(1100)
    await done

    // 10 rps for 1s = 10 requests; the old accum pre-seed made this 11
    expect(vi.mocked(fireRequest)).toHaveBeenCalledTimes(10)
  })

  it('counts in-flight requests that complete after the duration elapses (#61)', async () => {
    type FireResult = Awaited<ReturnType<typeof fireRequest>>
    const pending: Array<(r: FireResult) => void> = []
    vi.mocked(fireRequest).mockImplementation(() => new Promise<FireResult>(res => { pending.push(res) }))

    const windows: SwarmSampleWindow[] = []
    const ac = new AbortController()
    const done = runSwarmSlice(cfg, 'constant', { value: 1 }, w => windows.push(w), ac.signal)

    // run to the end of the duration with every dispatched request still in flight
    await vi.advanceTimersByTimeAsync(1100)
    expect(pending.length).toBe(10)

    // slow responses land after the timer fired — they must still be counted
    for (const res of pending) res(okResult as FireResult)
    await done

    const total = windows.reduce((a, w) => a + w.sent, 0)
    expect(total).toBe(10)
  })

  it('drops in-flight results on abort (stop means stop)', async () => {
    type FireResult = Awaited<ReturnType<typeof fireRequest>>
    const pending: Array<(r: FireResult) => void> = []
    vi.mocked(fireRequest).mockImplementation(() => new Promise<FireResult>(res => { pending.push(res) }))

    const windows: SwarmSampleWindow[] = []
    const ac = new AbortController()
    const done = runSwarmSlice(cfg, 'constant', { value: 1 }, w => windows.push(w), ac.signal)

    await vi.advanceTimersByTimeAsync(500)
    ac.abort()
    for (const res of pending) res(okResult as FireResult)
    await done

    expect(windows.reduce((a, w) => a + w.sent, 0)).toBe(0)
  })
})
