/**
 * Chart colors resolved from the active theme's CSS custom properties at draw
 * time — canvases can't use var() directly, and hardcoded dark-theme greys are
 * near-invisible in light mode.
 */
export interface ChartTheme {
  grid: string
  text: string
  green: string
  red: string
  accent: string
}

export function readChartTheme(el: HTMLElement): ChartTheme {
  const styles = getComputedStyle(el)
  const v = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
  return {
    grid: v('--bg2', '#21262d'),
    text: v('--text3', '#848d97'),
    green: v('--green', '#2ea043'),
    red: v('--red', '#f85149'),
    accent: v('--accent', '#388bfd'),
  }
}

/** Re-run `draw` when the theme toggles (data-theme flips on <html>). */
export function observeTheme(draw: () => void): () => void {
  const mo = new MutationObserver(draw)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => mo.disconnect()
}
