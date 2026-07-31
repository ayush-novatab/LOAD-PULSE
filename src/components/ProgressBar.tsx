interface Props { pct: number }

export default function ProgressBar({ pct }: Props) {
  return (
    <div
      className="progress-wrap"
      role="progressbar"
      aria-label="Test progress"
      aria-valuenow={Math.round(Math.min(100, pct))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}
