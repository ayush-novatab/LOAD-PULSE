import { describe, it, expect } from 'vitest'
import { evaluateGates } from './printer'
import type { ReportData } from '../src/lib/types'

function report(over: Partial<ReportData['meta']> = {}): ReportData {
  return {
    meta: {
      url: 'https://api.test/x', method: 'GET', pattern: 'constant',
      elapsed: '30.00', rps: '10.00', total: 300, ok: 297, fail: 3,
      successRate: '99.0', avgLatMs: 120, p95Ms: 300, p99Ms: 800, maxLatMs: 1200,
      ...over,
    },
    failures: {},
  }
}

describe('evaluateGates (#89)', () => {
  it('returns no results when no gates are configured', () => {
    expect(evaluateGates(report(), {})).toEqual([])
  })

  it('success-rate gate is inclusive: actual == threshold passes', () => {
    const [g] = evaluateGates(report({ successRate: '99.0' }), { failUnder: 99 })
    expect(g.passed).toBe(true)
    expect(g.direction).toBe('gte')
  })

  it('success-rate gate fails just under the threshold', () => {
    const [g] = evaluateGates(report({ successRate: '98.9' }), { failUnder: 99 })
    expect(g.passed).toBe(false)
  })

  it('latency gates are inclusive: actual == threshold passes', () => {
    const results = evaluateGates(report({ p95Ms: 300, p99Ms: 800, avgLatMs: 120 }), {
      p95Under: 300, p99Under: 800, avgUnder: 120,
    })
    expect(results).toHaveLength(3)
    for (const g of results) {
      expect(g.passed).toBe(true)
      expect(g.direction).toBe('lte')
    }
  })

  it('latency gates fail just over the threshold', () => {
    const results = evaluateGates(report({ p95Ms: 301, p99Ms: 801, avgLatMs: 121 }), {
      p95Under: 300, p99Under: 800, avgUnder: 120,
    })
    expect(results.map(g => g.passed)).toEqual([false, false, false])
  })

  it('a gate threshold of 0 is still evaluated (not dropped as falsy)', () => {
    const [g] = evaluateGates(report({ avgLatMs: 5 }), { avgUnder: 0 })
    expect(g.passed).toBe(false)
    expect(g.threshold).toBe(0)
  })

  it('mixed pass/fail reports each gate independently', () => {
    const results = evaluateGates(report({ successRate: '99.5', p95Ms: 999 }), {
      failUnder: 99, p95Under: 300,
    })
    expect(results.map(g => g.passed)).toEqual([true, false])
  })
})
