import type { StepConfig } from '../lib/types'

interface Props {
  steps: StepConfig[]
  onChange: (steps: StepConfig[]) => void
  concur: number
  onConcurChange: (n: number) => void
  timeout: number
  onTimeoutChange: (n: number) => void
}

export default function StepEditor({ steps, onChange, concur, onConcurChange, timeout, onTimeoutChange }: Props) {
  function update(i: number, field: keyof StepConfig, val: number) {
    const next = steps.map((s, idx) => idx === i ? { ...s, [field]: val } : s)
    onChange(next)
  }

  function addStep() {
    onChange([...steps, { rate: 10, dur: 10 }])
  }

  function delStep(i: number) {
    if (steps.length <= 1) return
    onChange(steps.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <div className="step-list">
        {steps.map((s, i) => (
          <div key={i} className="step-row">
            <span className="step-idx">S{i + 1}</span>
            <input type="number" min={1} value={s.rate} onChange={e => update(i, 'rate', Number(e.target.value))} aria-label={`Step ${i + 1} rate (requests per second)`} />
            <span className="text-dimmed text-xs" aria-hidden="true">req/s</span>
            <input type="number" min={1} value={s.dur} onChange={e => update(i, 'dur', Number(e.target.value))} aria-label={`Step ${i + 1} duration (seconds)`} />
            <span className="text-dimmed text-xs" aria-hidden="true">s</span>
            <button className="step-del" onClick={() => delStep(i)} aria-label={`Remove step ${i + 1}`}>x</button>
          </div>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm mb-12" onClick={addStep}>+ Add Step</button>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="step-concur">Concurrency</label>
          <input id="step-concur" type="number" min={1} max={200} value={concur} onChange={e => onConcurChange(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="step-timeout">Timeout (ms)</label>
          <input id="step-timeout" type="number" min={100} value={timeout} onChange={e => onTimeoutChange(Number(e.target.value))} />
        </div>
      </div>
    </div>
  )
}
