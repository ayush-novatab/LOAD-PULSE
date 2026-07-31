import type { ReportData, ChartPoint, TputPoint } from './types'

// A shared report is self-contained: the summary plus the per-request series
// the report view needs to redraw its charts, histogram, percentiles and Apdex.
export interface SharePayload {
  report: ReportData
  chartPts: ChartPoint[]
  tputPts: TputPoint[]
}

// ── URL-safe Base64 <-> bytes ──
function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000 // avoid arg-count limits on String.fromCharCode(...)
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ── gzip via the platform CompressionStream (browser + Node 20+) ──
async function gzip(str: string): Promise<Uint8Array> {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// The token comes from an attacker-controllable URL fragment: cap what we'll
// even look at, and cap what gzip may inflate to (decompression bomb).
const MAX_TOKEN_CHARS = 2_000_000
const MAX_DECOMPRESSED_BYTES = 32 * 1024 * 1024

async function gunzip(bytes: Uint8Array, maxBytes = MAX_DECOMPRESSED_BYTES): Promise<string> {
  // `bytes as BlobPart`: a Uint8Array is a valid BlobPart at runtime; the cast
  // sidesteps TS 6's Uint8Array<ArrayBufferLike> vs BlobPart<ArrayBuffer> generic mismatch.
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('Decompressed payload too large')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.byteLength }
  return new TextDecoder().decode(out)
}

export async function encodeReport(payload: SharePayload): Promise<string> {
  const gz = await gzip(JSON.stringify(payload))
  return bytesToBase64Url(gz)
}

export async function decodeReport(token: string): Promise<SharePayload | null> {
  if (token.length > MAX_TOKEN_CHARS) return null

  // Current format: URL-safe Base64 of a gzipped SharePayload.
  try {
    const json = await gunzip(base64UrlToBytes(token))
    const obj = JSON.parse(json)
    if (obj && typeof obj === 'object' && 'report' in obj) {
      return {
        report: obj.report as ReportData,
        chartPts: Array.isArray(obj.chartPts) ? obj.chartPts : [],
        tputPts: Array.isArray(obj.tputPts) ? obj.tputPts : [],
      }
    }
  } catch {
    // fall through to the legacy decoder
  }

  // Legacy format: standard Base64 of a bare ReportData (pre-compression links).
  // Kept so old shared URLs still open — they render as summary-only (no series).
  try {
    const report = JSON.parse(decodeURIComponent(escape(atob(token)))) as ReportData
    if (report && report.meta) return { report, chartPts: [], tputPts: [] }
  } catch {
    // not decodable
  }

  return null
}

export async function buildShareUrl(payload: SharePayload): Promise<string> {
  return window.location.origin + '/report#data=' + (await encodeReport(payload))
}
