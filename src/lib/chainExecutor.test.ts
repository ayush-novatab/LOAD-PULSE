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
