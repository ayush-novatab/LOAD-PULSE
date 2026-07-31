import { useState, useCallback, useEffect } from 'react'
import { useTestStore } from '../store/testStore'
import { describeTest } from '../lib/loadPatterns'
import type { ParsedCurl, PatternType, StepConfig, TestConfig } from '../lib/types'

import CurlInput from '../components/CurlInput'
import PostmanImport from '../components/PostmanImport'
import PatternPicker from '../components/PatternPicker'
import StepEditor from '../components/StepEditor'
import SuccessCriteria from '../components/SuccessCriteria'
import Presets from '../components/Presets'
import ChainBuilder from '../components/ChainBuilder'
import LiveStats from '../components/LiveStats'
import ProgressBar from '../components/ProgressBar'
import StatusDist from '../components/StatusDist'
import LogFeed from '../components/LogFeed'
import ReportView from '../components/ReportView'
import LatencyChart from '../components/LatencyChart'
import ThroughputChart from '../components/ThroughputChart'
import ExportConfigButton from '../components/ExportConfigButton'
import { parseCurl } from '../lib/curlParser'
import { runChain, applyChainVarsToString } from '../lib/chainExecutor'
import type { ChainStep } from '../lib/chainExecutor'

interface FormState {
  constRate: number; constRateUnit: 's' | 'm'; constDur: number; constDurUnit: 's' | 'm'
  rampStart: number; rampEnd: number; rampDur: number; rampDurUnit: 's' | 'm'; rampConcur: number
  steps: StepConfig[]; stepConcur: number; stepTimeout: number
  spikeBase: number; spikeRate: number; spikeDur: number; spikeBurst: number
  soakRate: number; soakDur: number; soakDurUnit: 's' | 'm'; soakConcur: number
  timeout: number; concur: number
  scMin: number; scMax: number
  latThreshOn: boolean; latThresh: number
  bodyCheckOn: boolean; bodyCheck: string
  errStopOn: boolean; errStopPct: number
  captureBody: boolean
}

const DEFAULT_FORM: FormState = {
  constRate: 10, constRateUnit: 's', constDur: 30, constDurUnit: 's',
  rampStart: 1, rampEnd: 20, rampDur: 30, rampDurUnit: 's', rampConcur: 20,
  steps: [{ rate: 5, dur: 10 }, { rate: 15, dur: 10 }, { rate: 30, dur: 10 }],
  stepConcur: 30, stepTimeout: 5000,
  spikeBase: 5, spikeRate: 100, spikeDur: 60, spikeBurst: 10,
  soakRate: 5, soakDur: 5, soakDurUnit: 'm', soakConcur: 10,
  timeout: 10000, concur: 20,
  scMin: 200, scMax: 299,
  latThreshOn: false, latThresh: 2000,
  bodyCheckOn: false, bodyCheck: '',
  errStopOn: false, errStopPct: 50,
  captureBody: true,
}

function buildConfig(parsed: ParsedCurl, pattern: PatternType, form: FormState): TestConfig {
  return { parsed, pattern, ...form }
}

export default function Run() {
  const [parsed, setParsed] = useState<ParsedCurl | null>(null)
  const [pattern, setPattern] = useState<PatternType>('constant')
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [showCriteria, setShowCriteria] = useState(false)
  const [chainSteps, setChainSteps] = useState<ChainStep[]>([])
  const [chainStatus, setChainStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [chainError, setChainError] = useState('')
  const [chainVars, setChainVars] = useState<Record<string, string>>({})
  const [showChain, setShowChain] = useState(false)
  const [showPostman, setShowPostman] = useState(false)

  const { running, status, stats, chartPts, tputPts, logBuf, progressPct, report, thresholdMsg } = useTestStore()
  const { startTest, stopTest, reset } = useTestStore()

  const patch = useCallback((p: Partial<FormState>) => setForm(f => ({ ...f, ...p })), [])

  const isDone = status === 'done' || status === 'stopped' || status === 'threshold'
  const isActive = running || isDone

  const handleStart = useCallback(async () => {
    if (!parsed) return
    reset()

    let vars: Record<string, string> = {}
    const stepsToRun = chainSteps.filter(s => s.curl.trim())
    if (stepsToRun.length > 0) {
      setChainStatus('running')
      setChainError('')
      try {
        vars = await runChain(stepsToRun)
        setChainVars(vars)
        setChainStatus('done')
      } catch (e) {
        setChainStatus('error')
        setChainError(e instanceof Error ? e.message : 'Chain step failed')
        return
      }
    }

    const patchedParsed: ParsedCurl = {
      ...parsed,
      url: applyChainVarsToString(parsed.url, vars),
      headers: Object.fromEntries(
        Object.entries(parsed.headers).map(([k, v]) => [k, applyChainVarsToString(v, vars)])
      ),
      body: parsed.body ? applyChainVarsToString(parsed.body, vars) : null,
    }

    startTest(buildConfig(patchedParsed, pattern, form), pattern)
  }, [parsed, chainSteps, pattern, form, reset, startTest])

  // Keyboard shortcuts — handleStart is a dep so the shortcut never runs a stale config
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!running && parsed) void handleStart()
      }
      if (e.key === 'Escape' && running) {
        stopTest('manual')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, parsed, handleStart, stopTest])

  // Stop the load generator when the page unmounts — otherwise navigating away
  // mid-run keeps hitting the target with no visible progress or stop control
  useEffect(() => () => {
    const s = useTestStore.getState()
    if (s.running) s.stopTest('manual')
  }, [])

  const desc = parsed ? describeTest(pattern, buildConfig(parsed, pattern, form), form.steps) : ''

  function handlePreset(curl: string) {
    // keep CurlInput's textarea in sync — same event the Postman import uses
    window.dispatchEvent(new CustomEvent('loadpulse:setcurl', { detail: curl }))
    try { setParsed(parseCurl(curl)) } catch { /* ignore */ }
  }

  const ni = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    patch({ [field]: Number(e.target.value) } as Partial<FormState>)
  const ns = (field: keyof FormState) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    patch({ [field]: e.target.value } as Partial<FormState>)

  return (
    <div className="run-page">
      <h1 className="sr-only">Run a load test</h1>

      {/* ── cURL ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div />
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPostman(true)} title="Import from Postman">
            <span aria-hidden="true">📦</span> Import from Postman
          </button>
        </div>
        <CurlInput onParsed={setParsed} />
      </div>

      {showPostman && (
        <PostmanImport
          onSelect={curl => {
            window.dispatchEvent(new CustomEvent('loadpulse:setcurl', { detail: curl }))
            try { setParsed(parseCurl(curl)) } catch { /* ignore */ }
          }}
          onClose={() => setShowPostman(false)}
        />
      )}

      {/* ── Config row: pattern + criteria ── */}
      <div className="config-row">
        <div className="card config-pattern">
          <PatternPicker value={pattern} onChange={setPattern} />

          {pattern === 'constant' && (
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="const-rate">Rate</label>
                <div className="input-unit">
                  <input id="const-rate" type="number" min={1} value={form.constRate} onChange={ni('constRate')} />
                  <select aria-label="Rate unit" value={form.constRateUnit} onChange={ns('constRateUnit')}><option value="s">/ s</option><option value="m">/ min</option></select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="const-dur">Duration</label>
                <div className="input-unit">
                  <input id="const-dur" type="number" min={1} value={form.constDur} onChange={ni('constDur')} />
                  <select aria-label="Duration unit" value={form.constDurUnit} onChange={ns('constDurUnit')}><option value="s">s</option><option value="m">min</option></select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="const-concur">Concurrency</label>
                <input id="const-concur" type="number" min={1} max={500} value={form.concur} onChange={ni('concur')} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="const-timeout">Timeout (ms)</label>
                <input id="const-timeout" type="number" min={100} value={form.timeout} onChange={ni('timeout')} />
              </div>
            </div>
          )}

          {pattern === 'ramp' && (
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label" htmlFor="ramp-start">Start (req/s)</label><input id="ramp-start" type="number" min={0} value={form.rampStart} onChange={ni('rampStart')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="ramp-end">End (req/s)</label><input id="ramp-end" type="number" min={1} value={form.rampEnd} onChange={ni('rampEnd')} /></div>
              <div className="form-group">
                <label className="form-label" htmlFor="ramp-dur">Duration</label>
                <div className="input-unit">
                  <input id="ramp-dur" type="number" min={1} value={form.rampDur} onChange={ni('rampDur')} />
                  <select aria-label="Duration unit" value={form.rampDurUnit} onChange={ns('rampDurUnit')}><option value="s">s</option><option value="m">min</option></select>
                </div>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="ramp-concur">Concurrency</label><input id="ramp-concur" type="number" min={1} value={form.rampConcur} onChange={ni('rampConcur')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="ramp-timeout">Timeout (ms)</label><input id="ramp-timeout" type="number" min={100} value={form.timeout} onChange={ni('timeout')} /></div>
            </div>
          )}

          {pattern === 'step' && (
            <StepEditor
              steps={form.steps} onChange={steps => patch({ steps })}
              concur={form.stepConcur} onConcurChange={n => patch({ stepConcur: n })}
              timeout={form.stepTimeout} onTimeoutChange={n => patch({ stepTimeout: n })}
            />
          )}

          {pattern === 'spike' && (
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label" htmlFor="spike-base">Base (req/s)</label><input id="spike-base" type="number" min={0} value={form.spikeBase} onChange={ni('spikeBase')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="spike-rate">Spike (req/s)</label><input id="spike-rate" type="number" min={1} value={form.spikeRate} onChange={ni('spikeRate')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="spike-dur">Total dur (s)</label><input id="spike-dur" type="number" min={10} value={form.spikeDur} onChange={ni('spikeDur')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="spike-burst">Burst dur (s)</label><input id="spike-burst" type="number" min={1} value={form.spikeBurst} onChange={ni('spikeBurst')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="spike-timeout">Timeout (ms)</label><input id="spike-timeout" type="number" min={100} value={form.timeout} onChange={ni('timeout')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="spike-concur">Concurrency</label><input id="spike-concur" type="number" min={1} value={form.concur} onChange={ni('concur')} /></div>
            </div>
          )}

          {pattern === 'soak' && (
            <div className="form-grid-2">
              <div className="form-group"><label className="form-label" htmlFor="soak-rate">Rate (req/s)</label><input id="soak-rate" type="number" min={1} value={form.soakRate} onChange={ni('soakRate')} /></div>
              <div className="form-group">
                <label className="form-label" htmlFor="soak-dur">Duration</label>
                <div className="input-unit">
                  <input id="soak-dur" type="number" min={1} value={form.soakDur} onChange={ni('soakDur')} />
                  <select aria-label="Duration unit" value={form.soakDurUnit} onChange={ns('soakDurUnit')}><option value="s">s</option><option value="m">min</option></select>
                </div>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="soak-concur">Concurrency</label><input id="soak-concur" type="number" min={1} value={form.soakConcur} onChange={ni('soakConcur')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="soak-timeout">Timeout (ms)</label><input id="soak-timeout" type="number" min={100} value={form.timeout} onChange={ni('timeout')} /></div>
            </div>
          )}

          {desc && <div className="desc-bar">{desc}</div>}
        </div>

        <div className="card config-criteria">
          <h2 style={{ margin: 0 }}>
            <button
              className="card-title criteria-toggle"
              onClick={() => setShowCriteria(s => !s)}
              aria-expanded={showCriteria}
              aria-controls="criteria-panel"
            >
              Success Criteria <span className="criteria-chevron" aria-hidden="true">{showCriteria ? '▲' : '▼'}</span>
            </button>
          </h2>
          {showCriteria && (
            <div id="criteria-panel" style={{ marginTop: 12 }}>
              <SuccessCriteria cfg={form} set={p => patch(p as Partial<FormState>)} />
            </div>
          )}
          {!showCriteria && (
            <div className="criteria-summary">
              <span>Status {form.scMin}–{form.scMax}</span>
              {form.latThreshOn && <span>· Lat ≤ {form.latThresh}ms</span>}
              {form.errStopOn && <span>· Stop @ {form.errStopPct}% err</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Presets ── */}
      <div className="card">
        <Presets onSelect={handlePreset} />
      </div>

      {/* ── Request Chaining ── */}
      <div className="card">
        <h2 style={{ margin: 0 }}>
          <button
            className="card-title criteria-toggle"
            onClick={() => setShowChain(s => !s)}
            aria-expanded={showChain}
            aria-controls="chain-panel"
          >
            Request Chaining <span className="criteria-chevron" aria-hidden="true">{showChain ? '▲' : '▼'}</span>
          </button>
        </h2>
        {!showChain && chainSteps.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
            {chainSteps.filter(s => s.curl.trim()).length} setup step(s) configured
            {Object.keys(chainVars).length > 0 && ` · ${Object.keys(chainVars).length} var(s) extracted`}
          </div>
        )}
        {showChain && (
          <div id="chain-panel" style={{ marginTop: 12 }}>
            <ChainBuilder steps={chainSteps} onChange={setChainSteps} />
            {chainStatus === 'running' && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)' }} role="status">⏳ Running chain steps…</div>
            )}
            {chainStatus === 'done' && Object.keys(chainVars).length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#2ea043', fontFamily: 'var(--font-mono)' }}>
                ✓ Extracted: {Object.entries(chainVars).map(([k, v]) => `chain.${k}=${v.slice(0, 20)}`).join('  ·  ')}
              </div>
            )}
            {chainStatus === 'error' && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#f85149' }} role="alert">✗ {chainError || 'Chain step failed — check the cURL commands'}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Action bar ── */}
      <div className="action-bar">
        {!running ? (
          <button className="btn btn-primary btn-run" disabled={!parsed} onClick={handleStart}>
            ▶ Run Test
          </button>
        ) : (
          <button className="btn btn-danger btn-run" onClick={() => stopTest('manual')}>
            ■ Stop
          </button>
        )}
        {(isDone || (status === 'idle' && stats.sent > 0)) && (
          <button className="btn btn-ghost" onClick={reset}>Reset</button>
        )}
        {!parsed && <span className="action-hint">Paste a cURL command above to start</span>}
        {parsed && <ExportConfigButton parsed={parsed} pattern={pattern} form={form} />}
        <span className="action-hint" style={{ fontSize: 11, marginLeft: 'auto' }}>⌘↵ run · Esc stop</span>
        {thresholdMsg && <span className="threshold-msg">{thresholdMsg}</span>}
      </div>

      {/* ── Live output (only when active) ── */}
      {isActive && (
        <>
          <ProgressBar pct={progressPct} />

          <LiveStats />

          {running && (
            <div className="charts-grid">
              <div className="card">
                <h2 className="card-title">Latency over time</h2>
                <LatencyChart points={chartPts} />
              </div>
              <div className="card">
                <h2 className="card-title">Throughput (req/s)</h2>
                <ThroughputChart points={tputPts} />
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="card-title">Status distribution</h2>
            <StatusDist codes={stats.codes} total={stats.sent} />
          </div>

          <div className="card">
            <h2 className="card-title">Request log</h2>
            <LogFeed entries={logBuf} />
          </div>
        </>
      )}

      {/* ── Final report ── */}
      {isDone && report && <ReportView report={report} log={logBuf} latencies={chartPts.map(p => p.lat)} />}
    </div>
  )
}
