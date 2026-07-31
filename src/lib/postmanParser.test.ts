import { describe, it, expect } from 'vitest'
import { requestToCurl, parsePostmanCollection } from './postmanParser'
import { parseCurl } from './curlParser'

const collection = (item: unknown) => ({
  info: { schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: Array.isArray(item) ? item : [item],
})

describe('parsePostmanCollection', () => {
  it('flattens nested folders', () => {
    const reqs = parsePostmanCollection(
      collection({ name: 'auth', item: [{ name: 'login', request: { method: 'GET', url: 'https://a.test/login' } }] }),
    )
    expect(reqs).toHaveLength(1)
    expect(reqs[0].folder).toBe('auth')
  })

  it('rejects a collection nested deeper than the recursion cap (#73)', () => {
    let item: Record<string, unknown> = { name: 'leaf', request: { method: 'GET', url: 'https://a.test/x' } }
    for (let i = 0; i < 200; i++) item = { name: `f${i}`, item: [item] }
    expect(() => parsePostmanCollection(collection(item))).toThrow(/nested too deeply/)
  })

  it('imports request-level bearer auth as an Authorization header', () => {
    const [req] = parsePostmanCollection(
      collection({
        name: 'Get user',
        request: {
          method: 'GET',
          url: 'https://api.example.com/me',
          auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc123' }] },
        },
      }),
    )
    expect(req.headers['Authorization']).toBe('Bearer abc123')
  })

  it('keeps existing headers alongside bearer auth', () => {
    const [req] = parsePostmanCollection(
      collection({
        name: 'Get user',
        request: {
          method: 'GET',
          url: 'https://api.example.com/me',
          header: [{ key: 'Accept', value: 'application/json' }],
          auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc123' }] },
        },
      }),
    )
    expect(req.headers['Accept']).toBe('application/json')
    expect(req.headers['Authorization']).toBe('Bearer abc123')
  })

  it('does not clobber an explicit Authorization header with auth config', () => {
    const [req] = parsePostmanCollection(
      collection({
        name: 'me',
        request: {
          method: 'GET',
          url: 'https://a.test/me',
          header: [{ key: 'Authorization', value: 'Basic abc' }],
          auth: { type: 'bearer', bearer: [{ key: 'token', value: 'T' }] },
        },
      }),
    )
    expect(req.headers['Authorization']).toBe('Basic abc')
  })

  it('leaves headers untouched when there is no auth', () => {
    const [req] = parsePostmanCollection(
      collection({
        name: 'Get user',
        request: {
          method: 'GET',
          url: 'https://api.example.com/me',
          header: [{ key: 'Accept', value: 'application/json' }],
        },
      }),
    )
    expect(req.headers).toEqual({ Accept: 'application/json' })
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

describe('requestToCurl round-trip', () => {
  it('round-trips a urlencoded body through parseCurl without losing the URL or double-encoding', () => {
    const curl = requestToCurl(
      {
        method: 'POST',
        url: 'https://api.example.com/form',
        body: {
          mode: 'urlencoded',
          urlencoded: [
            { key: 'name', value: 'John Doe' },
            { key: 'city', value: 'New York' },
          ],
        },
      },
      'Submit form',
    )

    const parsed = parseCurl(curl)
    expect(parsed.url).toBe('https://api.example.com/form')
    expect(parsed.method).toBe('POST')
    // The body is already form-encoded once by resolveBody; the round-trip must
    // not encode it a second time and must not leak into the URL.
    expect(parsed.body).toBe('name=John%20Doe&city=New%20York')
  })

  it('round-trips a raw body containing a single quote without mangling it', () => {
    const curl = requestToCurl(
      {
        method: 'POST',
        url: 'https://api.example.com/users',
        body: { mode: 'raw', raw: '{"name":"O\'Brien"}' },
      },
      'Create user',
    )

    const parsed = parseCurl(curl)
    expect(parsed.url).toBe('https://api.example.com/users')
    expect(parsed.method).toBe('POST')
    expect(parsed.body).toBe('{"name":"O\'Brien"}')
  })
})
