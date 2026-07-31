import { memo, useRef, useEffect, useCallback } from 'react'
import { readChartTheme, observeTheme } from '../lib/chartTheme'
import type { ChartPoint } from '../lib/types'

interface Props { points: ChartPoint[] }

function LatencyChart({ points }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const theme = readChartTheme(canvas)

    const W = canvas.parentElement?.clientWidth || canvas.offsetWidth || 400
    const H = 180
    canvas.width = W * (window.devicePixelRatio || 1)
    canvas.height = H * (window.devicePixelRatio || 1)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1)

    ctx.clearRect(0, 0, W, H)

    if (points.length < 2) {
      ctx.fillStyle = theme.text
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for data…', W / 2, H / 2)
      return
    }

    const lats = points.map(p => p.lat)
    const maxL = Math.max(...lats, 1)
    const minT = points[0].t
    const maxT = Math.max(points[points.length - 1].t, 1)
    const padL = 48, padR = 12, padT = 12, padB = 24
    const cW = W - padL - padR, cH = H - padT - padB

    // grid
    ctx.strokeStyle = theme.grid
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padT + cH * (i / 4)
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke()
      ctx.fillStyle = theme.text
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      const v = maxL * (1 - i / 4)
      ctx.fillText(v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) + 'ms', padL - 4, y + 3)
    }

    // all points can share one timestamp (minT === maxT) — avoid a NaN blank plot
    const span = Math.max(1, maxT - minT)
    const px = (t: number) => padL + ((t - minT) / span) * cW
    const py = (l: number) => padT + (1 - l / maxL) * cH

    // ok = green dot; fail = red cross (shape, not just color, marks failures)
    const step = points.length > 600 ? Math.ceil(points.length / 600) : 1
    for (let i = 0; i < points.length; i += step) {
      const p = points[i]
      const x = px(p.t), y = py(p.lat)
      if (p.ok) {
        ctx.globalAlpha = 0.7
        ctx.fillStyle = theme.green
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      } else {
        ctx.strokeStyle = theme.red
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3)
        ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3)
        ctx.stroke()
      }
    }
  }, [points])

  // redraw when points change
  useEffect(() => { draw() }, [draw])

  // redraw on resize and on theme change
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !canvas.parentElement) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(canvas.parentElement)
    const unobserveTheme = observeTheme(draw)
    return () => { ro.disconnect(); unobserveTheme() }
  }, [draw])

  const fails = points.reduce((n, p) => n + (p.ok ? 0 : 1), 0)
  const maxLat = points.length ? Math.max(...points.map(p => p.lat)) : 0
  const label = points.length < 2
    ? 'Latency over time chart: waiting for data'
    : `Latency over time chart: ${points.length} requests, max ${maxLat}ms, ${fails} failure${fails === 1 ? '' : 's'} (failures drawn as crosses)`

  return (
    <div style={{ width: '100%' }}>
      <canvas ref={ref} style={{ display: 'block' }} role="img" aria-label={label} />
    </div>
  )
}

// Memoized so it only redraws when `points` changes by reference — the store
// hands it a fresh array only on the ~4/sec flush, not when Run re-renders for
// unrelated reasons (form edits, progress ticks).
export default memo(LatencyChart)
