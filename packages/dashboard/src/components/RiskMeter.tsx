interface Props {
  score: number
  compact?: boolean
}

function getRiskColor(score: number): string {
  if (score < 30) return '#059669'
  if (score < 60) return '#d97706'
  return '#dc2626'
}

function getRiskLabel(score: number): string {
  if (score < 30) return 'Low'
  if (score < 60) return 'Medium'
  return 'High'
}

export function RiskMeter({ score, compact = false }: Props) {
  const color = getRiskColor(score)
  const label = getRiskLabel(score)
  const clampedScore = Math.min(Math.max(score, 0), 100)

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-fill-bar"
            style={{ width: `${clampedScore}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-xs font-mono" style={{ color }}>{score}</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">Risk Score</span>
        <span className="text-sm font-mono font-bold" style={{ color }}>
          {score} / 100 — {label}
        </span>
      </div>
      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full animate-fill-bar transition-all duration-500"
          style={{ width: `${clampedScore}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
