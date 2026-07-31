import type { ParsedCurl } from './types'

function tokenize(s: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++
    if (i >= s.length) break
    // A word runs until unquoted whitespace; adjacent quoted and unquoted
    // segments concatenate ('name=O'\''Brien' is one word), as in a shell.
    let buf = ''
    while (i < s.length && !/\s/.test(s[i])) {
      if (s[i] === "'") {
        i++
        while (i < s.length && s[i] !== "'") buf += s[i++]
        i++
      } else if (s[i] === '"') {
        i++
        while (i < s.length && s[i] !== '"') {
          if (s[i] === '\\' && i + 1 < s.length) { i++; buf += s[i] }
          else buf += s[i]
          i++
        }
        i++
      } else if (s[i] === '\\' && i + 1 < s.length) {
        i++
        buf += s[i++]
      } else {
        buf += s[i++]
      }
    }
    tokens.push(buf)
  }
  return tokens
}

export function parseCurl(raw: string): ParsedCurl {
  const s = raw.replace(/\\\r?\n/g, ' ').replace(/^curl\s+/, '').trim()
  const tokens = tokenize(s)

  let url = ''
  let method = ''
  const headers: Record<string, string> = {}
  let body: string | null = null

  for (let ti = 0; ti < tokens.length; ti++) {
    const t = tokens[ti]
    if (t === '-X' || t === '--request') {
      method = tokens[++ti] || 'GET'
    } else if (t === '-H' || t === '--header') {
      const h = tokens[++ti] || ''
      const c = h.indexOf(':')
      if (c > -1) headers[h.slice(0, c).trim()] = h.slice(c + 1).trim()
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii'].includes(t)) {
      body = tokens[++ti] || ''
    } else if (t === '--json') {
      body = tokens[++ti] || ''
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
      headers['Accept'] = headers['Accept'] || 'application/json'
      method = method || 'POST'
    } else if (t === '-u' || t === '--user') {
      headers['Authorization'] = 'Basic ' + btoa(tokens[++ti] || '')
    } else if (t === '--url') {
      url = tokens[++ti] || ''
    } else if (!t.startsWith('-')) {
      url = t
    }
  }

  if (!url) throw new Error('No URL found in curl command')
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url
  method = (method || (body !== null ? 'POST' : 'GET')).toUpperCase()

  return { url, method, headers, body }
}
