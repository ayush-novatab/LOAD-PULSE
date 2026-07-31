import { useRef, useEffect, useCallback } from 'react'
import { readChartTheme, observeTheme } from '../lib/chartTheme'
import type { ChartPoint } from '../lib/types'

interface Props { points: ChartPoint[] }

const BINS = 20

export default function Histogram({ points }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const theme = readChartTheme(canvas)

    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width = W
    canvas.height = H
    ctx.clearRect(0, 0, W, H)

    if (points.length === 0) {
      ctx.fillStyle = theme.text
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('No data', W / 2, H / 2)
      return
    }

    const lats = points.map(p => p.lat)
    const maxL = Math.max(...lats)
    const binSize = Math.ceil(maxL / BINS) || 1
    const bins = new Array(BINS).fill(0)
    for (const l of lats) {
      const idx = Math.min(BINS - 1, Math.floor(l / binSize))
      bins[idx]++
    }
    const maxBin = Math.max(...bins, 1)

    const padL = 10, padR = 10, padT = 8, padB = 20
    const bw = (W - padL - padR) / BINS

    for (let i = 0; i < BINS; i++) {
      const bh = (bins[i] / maxBin) * (H - padT - padB)
      const x = padL + i * bw
      const y = H - padB - bh
      ctx.globalAlpha = 0.55
      ctx.fillStyle = theme.accent
      ctx.fillRect(x + 1, y, bw - 2, bh)
      ctx.globalAlpha = 1
    }

    ctx.fillStyle = theme.text
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('0ms', padL, H - 2)
    ctx.textAlign = 'right'
    ctx.fillText(maxL + 'ms', W - padR, H - 2)
  }, [points])

  useEffect(() => { draw() }, [draw])

  useEffect(() => observeTheme(draw), [draw])

  let label = 'Latency distribution histogram: no data'
  if (points.length > 0) {
    const lats = points.map(p => p.lat)
    const maxL = Math.max(...lats)
    const binSize = Math.ceil(maxL / BINS) || 1
    const bins = new Array(BINS).fill(0)
    for (const l of lats) bins[Math.min(BINS - 1, Math.floor(l / binSize))]++
    const top = bins.indexOf(Math.max(...bins))
    label = `Latency distribution histogram: ${points.length} requests from 0 to ${maxL}ms, most between ${top * binSize} and ${(top + 1) * binSize}ms`
  }

  return (
    <div className="chart-wrap" style={{ height: 150 }}>
      <canvas ref={ref} role="img" aria-label={label} />
    </div>
  )
}
