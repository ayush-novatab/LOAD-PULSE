import { memo, useRef, useEffect, useCallback } from 'react'
import { readChartTheme, observeTheme } from '../lib/chartTheme'
import type { TputPoint } from '../lib/types'

interface Props { points: TputPoint[] }

function ThroughputChart({ points }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const theme = readChartTheme(canvas)

    const W = canvas.parentElement?.clientWidth || canvas.offsetWidth || 400
    const H = 180
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    if (points.length < 2) {
      ctx.fillStyle = theme.text
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for data…', W / 2, H / 2)
      return
    }

    const maxR = Math.max(...points.map(p => p.rps), 1) * 1.1
    const minT = points[0].t
    const maxT = Math.max(points[points.length - 1].t, 1)
    const padL = 44, padR = 12, padT = 12, padB = 24
    const cW = W - padL - padR, cH = H - padT - padB

    ctx.strokeStyle = theme.grid
    ctx.lineWidth = 1
    for (let i = 0; i <= 3; i++) {
      const y = padT + cH * (i / 3)
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke()
      ctx.fillStyle = theme.text
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(Math.round(maxR * (1 - i / 3)) + '/s', padL - 4, y + 3)
    }

    // all points can share one timestamp (minT === maxT) — avoid a NaN blank plot
    const span = Math.max(1, maxT - minT)
    const px = (t: number) => padL + ((t - minT) / span) * cW
    const py = (r: number) => padT + (1 - r / maxR) * cH

    // fill
    const grad = ctx.createLinearGradient(0, padT, 0, H - padB)
    grad.addColorStop(0, theme.green)
    grad.addColorStop(1, theme.green)
    ctx.fillStyle = grad
    ctx.globalAlpha = 0.15
    ctx.beginPath()
    ctx.moveTo(px(points[0].t), H - padB)
    for (const p of points) ctx.lineTo(px(p.t), py(p.rps))
    ctx.lineTo(px(points[points.length - 1].t), H - padB)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // line
    ctx.beginPath()
    ctx.strokeStyle = theme.green
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    let first = true
    for (const p of points) {
      if (first) { ctx.moveTo(px(p.t), py(p.rps)); first = false }
      else ctx.lineTo(px(p.t), py(p.rps))
    }
    ctx.stroke()
  }, [points])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas?.parentElement) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(canvas.parentElement)
    const unobserveTheme = observeTheme(draw)
    return () => { ro.disconnect(); unobserveTheme() }
  }, [draw])

  const current = points.length ? points[points.length - 1].rps : 0
  const peak = points.length ? Math.max(...points.map(p => p.rps)) : 0
  const label = points.length < 2
    ? 'Throughput over time chart: waiting for data'
    : `Throughput over time chart: currently ${current} requests per second, peak ${peak}`

  return (
    <div style={{ width: '100%' }}>
      <canvas ref={ref} style={{ display: 'block' }} role="img" aria-label={label} />
    </div>
  )
}

// Memoized so it only redraws when `points` changes by reference — the store
// hands it a fresh array only when a new per-second point is added (~1/sec).
export default memo(ThroughputChart)
