import { describe, it, expect } from 'vitest'
import { percentile, LatencyStats } from './percentile'

describe('LatencyStats (#88)', () => {
  it('tracks avg, max, and count exactly over all samples', () => {
    const s = new LatencyStats()
    for (let i = 0; i < 2500; i++) s.add(10)
    for (let i = 0; i < 500; i++) s.add(1000)
    expect(s.count).toBe(3000)
    expect(s.avg()).toBe(Math.round((2500 * 10 + 500 * 1000) / 3000))
    expect(s.max()).toBe(1000)
  })

  it('matches exact percentiles within 1% on a large spread', () => {
    const values: number[] = []
    for (let i = 1; i <= 10_000; i++) values.push(i)
    const s = new LatencyStats()
    for (const v of values) s.add(v)

    for (const p of [50, 90, 95, 99]) {
      const exact = percentile(values, p)
      const approx = s.percentile(p)
      expect(Math.abs(approx - exact) / exact).toBeLessThan(0.01)
    }
  })

  it('is empty-safe', () => {
    const s = new LatencyStats()
    expect(s.count).toBe(0)
    expect(s.percentile(95)).toBe(0)
    expect(s.avg()).toBe(0)
    expect(s.max()).toBe(0)
  })
})

describe('percentile', () => {
  it('returns 0 for an empty array', () => {
    expect(percentile([], 95)).toBe(0)
  })

  it('computes p95 over a 1..100 sample set', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(arr, 95)).toBe(95)
  })

  it('computes p99 over a 1..100 sample set', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(arr, 99)).toBe(99)
  })

  it('computes p50 on a small (< 20) sample set', () => {
    expect(percentile([10, 20, 30], 50)).toBe(20)
  })

  it('handles a single-element array', () => {
    expect(percentile([42], 95)).toBe(42)
  })

  it('does not mutate the input array', () => {
    const arr = [30, 10, 20]
    percentile(arr, 50)
    expect(arr).toEqual([30, 10, 20])
  })

  it('sorts unordered input before computing the percentile', () => {
    expect(percentile([50, 10, 30, 20, 40], 50)).toBe(30)
  })
})
