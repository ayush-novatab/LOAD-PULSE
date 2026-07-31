import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TestConfig } from '../lib/types'

vi.mock('../lib/fetcher', () => ({
  fireRequest: vi.fn(() => Promise.resolve({
    ok: true, status: 200, lat: 5, msg: 'OK', bodyText: null, reason: 'OK', badgeType: 'ok',
  })),
  makeSemaphore: () => ({ acquire: () => Promise.resolve(), release: () => {} }),
}))

const addRun = vi.hoisted(() => vi.fn())
vi.mock('./historyStore', () => ({
  useHistoryStore: { getState: () => ({ addRun }) },
}))

import { useTestStore } from './testStore'

const cfg = {
  parsed: { url: 'https://api.test/x', method: 'GET', headers: {}, body: null },
  constRate: 10, constRateUnit: 's',
  constDur: 1, constDurUnit: 's',
  concur: 5, timeout: 1000,
  scMin: 200, scMax: 299,
  latThreshOn: false, latThresh: 2000,
  bodyCheckOn: false, bodyCheck: '',
  errStopOn: false, errStopPct: 50,
  captureBody: false,
} as unknown as TestConfig

describe('testStore history save (#55)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    addRun.mockClear()
  })

  afterEach(() => {
    useTestStore.getState().reset()
    vi.useRealTimers()
  })

  it('saves a completed run to history exactly once, even if stop is signalled again', async () => {
    useTestStore.getState().startTest(cfg, 'constant')
    await vi.advanceTimersByTimeAsync(1100)

    expect(useTestStore.getState().status).toBe('done')
    expect(addRun).toHaveBeenCalledTimes(1)
    expect(addRun.mock.calls[0][0].meta.total).toBeGreaterThan(0)
    expect(addRun.mock.calls[0][1]).toBe('constant')

    // a second stop (e.g. a component effect re-firing) must not duplicate
    useTestStore.getState().stopTest('done')
    expect(addRun).toHaveBeenCalledTimes(1)
  })

  it('does not save an empty run to history', async () => {
    useTestStore.getState().startTest(cfg, 'constant')
    useTestStore.getState().stopTest('manual')
    await vi.advanceTimersByTimeAsync(50)
    expect(addRun).not.toHaveBeenCalled()
  })

  it('reports latency stats over all samples, not the 2000-point chart cap (#88)', async () => {
    const { fireRequest } = await import('../lib/fetcher')
    let call = 0
    vi.mocked(fireRequest).mockImplementation(() => {
      // the first 500 requests are slow — beyond the tail the chart cap keeps
      const lat = ++call <= 500 ? 1000 : 10
      return Promise.resolve({ ok: true, status: 200, lat, msg: 'OK', bodyText: null, reason: 'OK', badgeType: 'ok' } as Awaited<ReturnType<typeof fireRequest>>)
    })

    const fastCfg = { ...cfg, constRate: 3000 } as typeof cfg
    useTestStore.getState().startTest(fastCfg, 'constant')
    await vi.advanceTimersByTimeAsync(1200)

    const report = useTestStore.getState().report!
    expect(report.meta.total).toBeGreaterThan(2500)
    // before the streaming stats, these reflected only the last 2000 samples (all lat=10)
    expect(report.meta.maxLatMs).toBe(1000)
    expect(report.meta.avgLatMs).toBeGreaterThan(100)
  })
})
