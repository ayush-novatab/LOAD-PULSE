import { describe, it, expect } from 'vitest'
import { requestToCurl } from './postmanParser'
import { parseCurl } from './curlParser'

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
