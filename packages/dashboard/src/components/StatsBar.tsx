import { Activity, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react'
import { USDT_DIVISOR } from '../constants'

interface AuditEntry {
  approved: boolean
  riskScore?: number
  transactionDetails: { value: string }
}

interface Props {
  stats: { total: number; approved: number; blocked: number; topBlockReasons: { rule: string; count: number }[] }
  auditLog: AuditEntry[]
}

interface MetricCardProps {
  icon: React.ReactNode
  value: string
  label: string
  iconBg: string
}

function MetricCard({ icon, value, label, iconBg }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`flex-shrink-0 rounded-lg p-2.5 ${iconBg}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold font-mono text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export function StatsBar({ stats, auditLog }: Props) {
  const approvalRate = stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(1) : '0'
  const avgRisk = auditLog.length > 0
    ? (auditLog.reduce((sum, e) => sum + (e.riskScore ?? 0), 0) / auditLog.length).toFixed(0)
    : '0'

  const totalVolume = auditLog
    .filter(e => e.approved)
    .reduce((sum, e) => sum + Number(e.transactionDetails.value) / USDT_DIVISOR, 0)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <MetricCard
        icon={<Activity className="w-5 h-5 text-blue-600" />}
        value={String(stats.total)}
        label="Total Transactions"
        iconBg="bg-blue-50"
      />
      <MetricCard
        icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
        value={`${approvalRate}%`}
        label="Approval Rate"
        iconBg="bg-emerald-50"
      />
      <MetricCard
        icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
        value={avgRisk}
        label="Avg Risk Score"
        iconBg="bg-amber-50"
      />
      <MetricCard
        icon={<DollarSign className="w-5 h-5 text-orange-600" />}
        value={totalVolume.toFixed(0)}
        label="Volume (USDT)"
        iconBg="bg-orange-50"
      />
    </div>
  )
}
