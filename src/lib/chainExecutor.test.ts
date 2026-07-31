import { describe, it, expect, afterEach } from 'vitest'
import { runChain, type ChainStep } from './chainExecutor'

const origFetch = globalThis.fetch

function step(extractors: ChainStep['extractors'], curl = 'curl https://api.test/login'): ChainStep {
  return { id: 's1', curl, extractors }
}

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<unknown>) {
  globalThis.fetch = impl as typeof fetch
}

function jsonResponse(body: string) {
  return Promise.resolve({
    headers: new Headers(),
    text: () => Promise.resolve(body),
  })
}

afterEach(() => {
  globalThis.fetch = origFetch
})

describe('runChain', () => {
  it('extracts a value from a JSON body', async () => {
    mockFetch(() => jsonResponse('{"token":"abc123"}'))
    const vars = await runChain([step([{ varName: 'token', source: 'body', path: 'token' }])])
    expect(vars).toEqual({ token: 'abc123' })
  })

  it('traverses arrays via bracket syntax like data.items[0].id (#50)', async () => {
    mockFetch(() => jsonResponse('{"data":{"items":[{"id":"first"},{"id":"second"}]}}'))
    const vars = await runChain([step([{ varName: 'id', source: 'body', path: 'data.items[0].id' }])])
    expect(vars).toEqual({ id: 'first' })
  })

  it('accepts JSONPath-style paths with a leading $. (#50)', async () => {
    mockFetch(() => jsonResponse('{"data":{"token":"tok"}}'))
    const vars = await runChain([step([{ varName: 't', source: 'body', path: '$.data.token' }])])
    expect(vars).toEqual({ t: 'tok' })
  })

  it('injects a variable extracted in step 1 into step 2 headers (#90)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    mockFetch((url, init) => {
      calls.push({ url, init })
      return jsonResponse(calls.length === 1 ? '{"token":"abc"}' : '{}')
    })

    await runChain([
      { id: 's1', curl: 'curl https://api.test/login', extractors: [{ varName: 'token', source: 'body', path: 'token' }] },
      { id: 's2', curl: `curl https://api.test/{{chain.token}}/me -H 'Authorization: Bearer {{chain.token}}'`, extractors: [] },
    ])

    expect(calls).toHaveLength(2)
    expect(calls[1].url).toBe('https://api.test/abc/me')
    const headers = (calls[1].init?.headers ?? {}) as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer abc')
  })

  it('rejects on an unparseable chain step instead of silently skipping it (#81)', async () => {
    mockFetch(() => jsonResponse('{}'))
    await expect(
      runChain([step([{ varName: 't', source: 'body', path: 'token' }], 'curl -X POST')]),
    ).rejects.toThrow(/step 1/i)
  })

  it('extracts from a falsy-but-valid JSON body (#67)', async () => {
    mockFetch(() => jsonResponse('0'))
    const vars = await runChain([step([{ varName: 'n', source: 'body', path: '$' }])])
    expect(vars).toEqual({ n: '0' })
  })

  it('aborts a stalled body read via the step timeout instead of hanging (#49)', async () => {
    mockFetch((_url, init) => Promise.resolve({
      headers: new Headers(),
      text: () => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    }))
    const vars = await runChain([step([{ varName: 'token', source: 'body', path: 'token' }])], 50)
    expect(vars).toEqual({})
  }, 2000)
})
