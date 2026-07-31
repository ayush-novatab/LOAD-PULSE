import { describe, it, expect } from 'vitest'
import { buildExportConfig } from './exportConfig'
import { parseCurl } from './curlParser'
import type { ParsedCurl, StepConfig } from './types'

const form = {
  constRate: 10, constRateUnit: 's' as const,
  constDur: 30, constDurUnit: 's' as const,
  rampStart: 1, rampEnd: 10, rampDur: 30, rampDurUnit: 's' as const, rampConcur: 10,
  steps: [] as StepConfig[], stepConcur: 10, stepTimeout: 10000,
  spikeBase: 1, spikeRate: 10, spikeDur: 30, spikeBurst: 5,
  soakRate: 10, soakDur: 30, soakDurUnit: 's' as const, soakConcur: 10,
  timeout: 10000, concur: 50, scMin: 200, scMax: 399,
}

describe('buildExportConfig', () => {
  it('exports a runnable curl for bodies containing a single quote (#51)', () => {
    const parsed: ParsedCurl = {
      url: 'https://api.test/notes',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"note":"O\'Brien"}',
    }

    const cfg = buildExportConfig(parsed, 'constant', form)
    expect(cfg.curl).toContain(`-d '{"note":"O'\\''Brien"}'`)

    const roundTripped = parseCurl(cfg.curl)
    expect(roundTripped.body).toBe('{"note":"O\'Brien"}')
    expect(roundTripped.url).toBe('https://api.test/notes')
  })
})
