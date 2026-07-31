import { useState, useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Run from './pages/Run'

const History = lazy(() => import('./pages/History'))
const Compare = lazy(() => import('./pages/Compare'))
const Docs = lazy(() => import('./pages/Docs'))
const SharedReport = lazy(() => import('./pages/SharedReport'))
const Swarm = lazy(() => import('./pages/Swarm'))

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
  }
}

function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt || dismissed) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 999,
      background: 'var(--bg1)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 16px', display: 'flex',
      alignItems: 'center', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      fontSize: 13,
    }}>
      <span>⚡ Install LoadPulse as an app</span>
      <button className="btn btn-primary btn-sm" onClick={() => { prompt.prompt(); setDismissed(true) }}>Install</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setDismissed(true)} aria-label="Dismiss install banner">✕</button>
    </div>
  )
}

const NAV_LINKS = [
  { to: '/', label: 'Run', end: true },
  { to: '/history', label: 'History' },
  { to: '/compare', label: 'Compare' },
  { to: '/swarm', label: '🐝 Swarm' },
  { to: '/docs', label: 'Docs' },
]

// Raw localStorage access can throw during render (Safari Lockdown, partitioned
// iframes, cookie-blocked private modes) — never let the theme white-screen the app.
function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* storage blocked or full */ }
}

function Layout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (safeGetItem('_lp_theme') as 'dark' | 'light') || 'dark'
  })
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    safeSetItem('_lp_theme', theme)
  }, [theme])

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <div className="nav-brand">
          ⚡ <span>LoadPulse</span>
        </div>
        <div className={'nav-links' + (menuOpen ? ' open' : '')}>
          {NAV_LINKS.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </NavLink>
          ))}
        </div>
        <div className="nav-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            className="btn btn-ghost btn-sm nav-toggle"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>
      <main className="page-content" onClick={() => menuOpen && setMenuOpen(false)}>{children}</main>
    </div>
  )
}

function PageLoader() {
  return <div className="page-loader">Loading…</div>
}

// Boundary inside Layout so the nav shell survives a page crash; keyed by
// pathname so navigating away from a crashed page clears the error state.
function Page({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return (
    <Layout>
      <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Page><Run /></Page>} />
          <Route path="/history" element={<Page><History /></Page>} />
          <Route path="/compare" element={<Page><Compare /></Page>} />
          <Route path="/swarm" element={<Page><Swarm /></Page>} />
          <Route path="/docs" element={<Page><Docs /></Page>} />
          {/* /report renders outside Layout, so it needs its own boundary */}
          <Route path="/report" element={<ErrorBoundary><SharedReport /></ErrorBoundary>} />
        </Routes>
      </Suspense>
      <InstallBanner />
    </BrowserRouter>
  )
}
