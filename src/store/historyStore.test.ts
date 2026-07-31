import { describe, it, expect, beforeEach } from 'vitest'
import { useHistoryStore } from './historyStore'
import type { ReportData } from '../lib/types'

function report(url: string): ReportData {
  return {
    meta: {
      url, method: 'GET', pattern: 'constant',
      elapsed: '10.00', rps: '5.00', total: 50, ok: 50, fail: 0,
      successRate: '100.0', avgLatMs: 50, p95Ms: 80, p99Ms: 90, maxLatMs: 100,
    },
    failures: {},
  }
}

describe('historyStore (#91)', () => {
  beforeEach(() => useHistoryStore.getState().clearAll())

  it('caps history at 10 runs, evicting the oldest', () => {
    for (let i = 1; i <= 12; i++) {
      useHistoryStore.getState().addRun(report(`https://api.test/run-${i}`), 'constant')
    }
    const { runs } = useHistoryStore.getState()
    expect(runs).toHaveLength(10)
    expect(runs[0].url).toBe('https://api.test/run-12') // newest first
    expect(runs[9].url).toBe('https://api.test/run-3')  // 1 and 2 evicted
  })

  it('records the report summary fields', () => {
    useHistoryStore.getState().addRun(report('https://api.test/x'), 'ramp')
    const [run] = useHistoryStore.getState().runs
    expect(run.pattern).toBe('ramp')
    expect(run.total).toBe(50)
    expect(run.p95).toBe(80)
  })
})
