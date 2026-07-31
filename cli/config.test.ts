import { describe, it, expect } from 'vitest'
import { resolveConfig } from './config'

const CURL = 'curl https://api.test/health'

function argv(...rest: string[]): string[] {
  return ['node', 'loadpulse', 'run', '--curl', CURL, ...rest]
}

describe('resolveConfig numeric args (#52)', () => {
  it('rejects --rate 0 instead of silently using the default', () => {
    expect(() => resolveConfig(argv('--rate', '0'))).toThrow(/--rate/)
  })

  it('rejects a non-numeric --rate instead of silently using the default', () => {
    expect(() => resolveConfig(argv('--rate', 'abc'))).toThrow(/--rate/)
  })

  it('rejects --concurrency 0 and --duration 0', () => {
    expect(() => resolveConfig(argv('--concurrency', '0'))).toThrow(/--concurrency/)
    expect(() => resolveConfig(argv('--duration', '0'))).toThrow(/--duration/)
  })

  it('rejects a negative --timeout', () => {
    expect(() => resolveConfig(argv('--timeout', '-5'))).toThrow(/--timeout/)
  })

  it('applies valid numeric overrides', () => {
    const cfg = resolveConfig(argv('--rate', '25', '--duration', '60', '--concurrency', '5', '--timeout', '3000'))
    expect(cfg.rate).toBe(25)
    expect(cfg.duration).toBe(60)
    expect(cfg.concurrency).toBe(5)
    expect(cfg.timeout).toBe(3000)
  })
})

describe('resolveConfig pattern validation (#53)', () => {
  it('rejects an unknown --pattern instead of running an empty test', () => {
    expect(() => resolveConfig(argv('--pattern', 'constatn'))).toThrow(/pattern/i)
  })

  it('accepts every known pattern', () => {
    for (const p of ['constant', 'ramp', 'step', 'spike', 'soak']) {
      expect(resolveConfig(argv('--pattern', p)).pattern).toBe(p)
    }
  })
})
