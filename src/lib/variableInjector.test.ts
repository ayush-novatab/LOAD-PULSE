import { describe, it, expect } from 'vitest'
import { applyVars, createVarSpace, resetUniqueVars } from './variableInjector'
import type { ParsedCurl } from './types'

function req(over: Partial<ParsedCurl> = {}): ParsedCurl {
  return { url: 'https://api.test/x', method: 'POST', headers: {}, body: null, ...over }
}

describe('applyVars (#90)', () => {
  it('resolves {{seq}}, {{phone}} and {{email}} to the SAME number within one request', () => {
    const space = createVarSpace()
    const out = applyVars(req({
      url: 'https://api.test/u/{{seq}}',
      headers: { 'X-Idempotency': '{{seq}}' },
      body: '{"phone":"{{phone}}","email":"{{email}}"}',
    }), space)

    const seq = out.url.split('/').pop()!
    expect(out.headers['X-Idempotency']).toBe(seq)
    expect(out.body).toContain(`"phone":"9${seq.padStart(9, '0')}"`)
    expect(out.body).toContain(`"email":"user${seq}@loadtest.dev"`)
  })

  it('advances the sequence between requests — no collisions in a run', () => {
    const space = createVarSpace()
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const out = applyVars(req({ body: '{{seq}}' }), space)
      expect(seen.has(out.body!)).toBe(false)
      seen.add(out.body!)
    }
    expect(seen.size).toBe(100)
  })

  it('disjoint VarSpaces never overlap (swarm seqBase blocks)', () => {
    const a = createVarSpace(0)
    const b = createVarSpace(1_000_000)
    const seqs = new Set<string>()
    for (let i = 0; i < 50; i++) {
      seqs.add(applyVars(req({ body: '{{seq}}' }), a).body!)
      seqs.add(applyVars(req({ body: '{{seq}}' }), b).body!)
    }
    expect(seqs.size).toBe(100)
  })

  it('{{repeat_uuid:n}} repeats the same uuid for n requests, then rotates', () => {
    const space = createVarSpace()
    const uuids: string[] = []
    for (let i = 0; i < 6; i++) {
      uuids.push(applyVars(req({ body: '{{repeat_uuid:3}}' }), space).body!)
    }
    expect(uuids[0]).toBe(uuids[1])
    expect(uuids[1]).toBe(uuids[2])
    expect(uuids[3]).toBe(uuids[4])
    expect(uuids[4]).toBe(uuids[5])
    expect(uuids[0]).not.toBe(uuids[3])
  })

  it('resetUniqueVars rewinds the default space', () => {
    resetUniqueVars()
    const first = applyVars(req({ body: '{{seq}}' })).body
    resetUniqueVars()
    expect(applyVars(req({ body: '{{seq}}' })).body).toBe(first)
  })

  it('substitutes {{uuid}}, {{random_int}} and {{random_str:n}} with plausible values', () => {
    const out = applyVars(req({ body: '{{uuid}}|{{random_int:1:6}}|{{random_str:8}}' }))
    const [uuid, rint, rstr] = out.body!.split('|')
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(Number(rint)).toBeGreaterThanOrEqual(1)
    expect(Number(rint)).toBeLessThanOrEqual(6)
    expect(rstr).toMatch(/^[A-Za-z0-9]{8}$/)
  })
})
