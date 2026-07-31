export function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}

/**
 * Streaming latency statistics over an unbounded number of samples.
 *
 * Report percentiles used to be computed from capped raw arrays (last
 * 2000/5000/10000 samples), so long or high-rate runs reported only the tail
 * of the distribution. This keeps HDR-style buckets (~0.5% relative error,
 * 3 significant digits) with exact count/avg/max, in O(distinct buckets)
 * memory regardless of run length.
 */
export class LatencyStats {
  private counts = new Map<number, number>()
  private total = 0
  private sum = 0
  private maxV = 0

  add(ms: number): void {
    const v = Math.max(0, ms)
    const mag = v >= 1000 ? Math.pow(10, Math.floor(Math.log10(v)) - 2) : 1
    const bucket = Math.round(v / mag) * mag
    this.counts.set(bucket, (this.counts.get(bucket) ?? 0) + 1)
    this.total++
    this.sum += v
    if (v > this.maxV) this.maxV = v
  }

  get count(): number {
    return this.total
  }

  percentile(p: number): number {
    if (this.total === 0) return 0
    const target = Math.max(1, Math.ceil((p / 100) * this.total))
    const buckets = [...this.counts.entries()].sort((a, b) => a[0] - b[0])
    let seen = 0
    for (const [value, n] of buckets) {
      seen += n
      if (seen >= target) return value
    }
    return buckets[buckets.length - 1][0]
  }

  avg(): number {
    return this.total ? Math.round(this.sum / this.total) : 0
  }

  max(): number {
    return this.maxV
  }
}
