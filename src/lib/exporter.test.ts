import { describe, it, expect } from 'vitest'
import { toCsv } from './exporter'

describe('toCsv', () => {
  it('starts with a UTF-8 BOM so Excel decodes non-ASCII correctly (#63)', () => {
    const csv = toCsv([{ name: 'Zoë', city: 'München' }])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Zoë')
  })

  it('escapes commas, quotes, and newlines per RFC 4180', () => {
    const csv = toCsv([{ a: 'x,y', b: 'he said "hi"', c: 'line1\nline2' }])
    const body = csv.slice(1).split('\n').slice(1).join('\n')
    expect(body).toBe('"x,y","he said ""hi""","line1\nline2"')
  })
})
