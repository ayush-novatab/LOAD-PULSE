import { describe, it, expect } from 'vitest'
import { requestToCurl, parsePostmanCollection } from './postmanParser'
import { parseCurl } from './curlParser'

describe('parsePostmanCollection', () => {
  it('flattens nested folders', () => {
    const col = {
      info: { schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [{ name: 'auth', item: [{ name: 'login', request: { method: 'GET', url: 'https://a.test/login' } }] }],
    }
    const reqs = parsePostmanCollection(col)
    expect(reqs).toHaveLength(1)
    expect(reqs[0].folder).toBe('auth')
  })

  it('carries bearer auth into the parsed request headers (#90)', () => {
    const col = {
      info: { schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [{
        name: 'me',
        request: {
          method: 'GET',
          url: 'https://a.test/me',
          auth: { type: 'bearer', bearer: [{ key: 'token', value: 'T' }] },
        },
      }],
    }
    const [req] = parsePostmanCollection(col)
    expect(req.headers['Authorization']).toBe('Bearer T')
  })

  it('does not clobber an explicit Authorization header with auth config', () => {
    const col = {
      info: { schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [{
        name: 'me',
        request: {
          method: 'GET',
          url: 'https://a.test/me',
          header: [{ key: 'Authorization', value: 'Basic abc' }],
          auth: { type: 'bearer', bearer: [{ key: 'token', value: 'T' }] },
        },
      }],
    }
    const [req] = parsePostmanCollection(col)
    expect(req.headers['Authorization']).toBe('Basic abc')
  })

  it('rejects a collection nested deeper than the recursion cap (#73)', () => {
    let item: Record<string, unknown> = { name: 'leaf', request: { method: 'GET', url: 'https://a.test/x' } }
    for (let i = 0; i < 200; i++) item = { name: `f${i}`, item: [item] }
    const col = {
      info: { schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [item],
    }
    expect(() => parsePostmanCollection(col)).toThrow(/nested too deeply/)
  })
})

describe('requestToCurl', () => {
  it('emits an already-encoded urlencoded body with -d, not --data-urlencode', () => {
    const curl = requestToCurl({
      method: 'POST',
      url: 'https://api.example.com/login',
      body: {
        mode: 'urlencoded',
        urlencoded: [
          { key: 'user', value: 'a b' },
          { key: 'pass', value: 'x&y=z' },
        ],
      },
    }, 'Login')

    expect(curl).not.toContain('--data-urlencode')
    expect(curl).toContain("-d 'user=a%20b&pass=x%26y%3Dz'")
  })

  it('round-trips a urlencoded body through parseCurl without re-encoding', () => {
    const curl = requestToCurl({
      method: 'POST',
      url: 'https://api.example.com/login',
      body: { mode: 'urlencoded', urlencoded: [{ key: 'a', value: '1' }, { key: 'b', value: '2' }] },
    }, 'Login')

    const parsed = parseCurl(curl)
    expect(parsed.body).toBe('a=1&b=2')
    expect(parsed.method).toBe('POST')
  })

  it('keeps port and query params when the URL is a structured object without raw', () => {
    const curl = requestToCurl({
      method: 'GET',
      url: {
        protocol: 'https',
        host: ['api', 'test'],
        port: '8443',
        path: ['search'],
        query: [
          { key: 'q', value: 'foo' },
          { key: 'limit', value: '10' },
          { key: 'skip', value: 'x', disabled: true },
        ],
      },
    }, 'Search')

    expect(curl).toContain("'https://api.test:8443/search?q=foo&limit=10'")
  })

  it('escapes single quotes in urlencoded values for shell safety', () => {
    const curl = requestToCurl({
      method: 'POST',
      url: 'https://api.example.com/login',
      body: { mode: 'urlencoded', urlencoded: [{ key: 'name', value: "O'Brien" }] },
    }, 'Login')

    const parsed = parseCurl(curl)
    expect(parsed.body).toBe("name=O'Brien")
  })
})
