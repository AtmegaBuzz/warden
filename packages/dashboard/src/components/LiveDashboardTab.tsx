import { useState } from 'react'
import {
  Activity, TrendingUp, AlertTriangle, DollarSign,
  CheckCircle, XCircle, Snowflake, Sun, Zap, Shield,
} from 'lucide-react'
import { USDT_DIVISOR } from '../constants'

function relativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

interface AuditEntry {
  approved: boolean
  reason: string
  ruleTriggered: string | null
  riskScore?: number
  timestamp: number
  agentId: string
  transactionDetails: { to: string; value: string; token?: string; chain: string }
  txHash?: string
}

interface WalletInfo {
  address: string
  ethBalance: string
  usdtBalance: string
}

interface ContractInfo {
  policyDelegateAddress: string
  usdtContractAddress: string
  deployerAddress: string
  network: string
  version: string
}

interface Props {
  stats: { total: number; approved: number; blocked: number; topBlockReasons: { rule: string; count: number }[] } | null
  auditLog: AuditEntry[]
  walletInfo: WalletInfo | null
  contractInfo: ContractInfo | null
  onFreeze: (agentId: string) => Promise<boolean>
  onUnfreeze: (agentId: string) => Promise<boolean>
  onSimulate: (agentId: string, amount: number, recipient: string) => Promise<unknown>
}

const AGENT_PROFILES = [
  { id: 'agent-conservative', name: 'Conservative', maxPerTx: 10, dailyLimit: 50, cooldown: 60 },
  { id: 'agent-moderate', name: 'Moderate', maxPerTx: 50, dailyLimit: 200, cooldown: 30 },
  { id: 'agent-aggressive', name: 'Aggressive', maxPerTx: 200, dailyLimit: 1000, cooldown: 10 },
] as const

const DEFAULT_RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18'

const TRACKED_RULES = ['maxPerTx', 'dailyLimit', 'cooldown', 'requireApproval'] as const

function getSpendingColor(pct: number): string {
  if (pct < 50) return 'bg-emerald-500'
  if (pct < 80) return 'bg-amber-500'
  return 'bg-red-500'
}

function getRiskColor(score: number): string {
  if (score < 30) return 'text-emerald-600'
  if (score < 60) return 'text-amber-600'
  return 'text-red-600'
}

export function LiveDashboardTab({
  stats,
  auditLog,
  walletInfo: _walletInfo,
  contractInfo: _contractInfo,
  onFreeze,
  onUnfreeze,
  onSimulate,
}: Props) {
  const [frozenAgents, setFrozenAgents] = useState<Set<string>>(new Set())
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const agentEntries = (agentId: string) => auditLog.filter(e => e.agentId === agentId)

  const todayStart = new Date().setHours(0, 0, 0, 0)

  const agentSpending = (agentId: string): number =>
    agentEntries(agentId)
      .filter(e => e.approved && e.timestamp >= todayStart)
      .reduce((sum, e) => sum + Number(e.transactionDetails.value) / USDT_DIVISOR, 0)

  const agentApproved = (agentId: string): number =>
    agentEntries(agentId).filter(e => e.approved).length

  const agentBlocked = (agentId: string): number =>
    agentEntries(agentId).filter(e => !e.approved).length

  const agentAvgRisk = (agentId: string): number => {
    const entries = agentEntries(agentId)
    if (entries.length === 0) return 0
    return entries.reduce((sum, e) => sum + (e.riskScore ?? 0), 0) / entries.length
  }

  const agentLastAction = (agentId: string): number | null => {
    const entries = agentEntries(agentId)
    if (entries.length === 0) return null
    return Math.max(...entries.map(e => e.timestamp))
  }

  const handleFreeze = async (agentId: string) => {
    setActionInProgress(agentId)
    const ok = await onFreeze(agentId)
    if (ok) setFrozenAgents(prev => new Set(prev).add(agentId))
    setActionInProgress(null)
  }

  const handleUnfreeze = async (agentId: string) => {
    setActionInProgress(agentId)
    const ok = await onUnfreeze(agentId)
    if (ok) {
      setFrozenAgents(prev => {
        const next = new Set(prev)
        next.delete(agentId)
        return next
      })
    }
    setActionInProgress(null)
  }

  const handleSimulateQuick = async (agentId: string) => {
    setActionInProgress(agentId)
    await onSimulate(agentId, 5, DEFAULT_RECIPIENT)
    setActionInProgress(null)
  }

  const handleFreezeAll = async () => {
    setActionInProgress('all')
    for (const profile of AGENT_PROFILES) {
      await onFreeze(profile.id)
    }
    setFrozenAgents(new Set(AGENT_PROFILES.map(p => p.id)))
    setActionInProgress(null)
  }

  const ruleHeatmap = (): Map<string, Map<string, number>> => {
    const map = new Map<string, Map<string, number>>()
    for (const rule of TRACKED_RULES) {
      map.set(rule, new Map<string, number>())
    }
    for (const entry of auditLog) {
      if (entry.ruleTriggered && map.has(entry.ruleTriggered)) {
        const ruleMap = map.get(entry.ruleTriggered)!
        ruleMap.set(entry.agentId, (ruleMap.get(entry.agentId) ?? 0) + 1)
      }
    }
    return map
  }

  const heatmap = ruleHeatmap()

  const heatmapMax = (() => {
    let max = 1
    for (const ruleMap of heatmap.values()) {
      for (const count of ruleMap.values()) {
        if (count > max) max = count
      }
    }
    return max
  })()

  const approvalRate = stats && stats.total > 0
    ? ((stats.approved / stats.total) * 100).toFixed(1)
    : '0'

  const avgRisk = auditLog.length > 0
    ? (auditLog.reduce((sum, e) => sum + (e.riskScore ?? 0), 0) / auditLog.length).toFixed(0)
    : '0'

  const totalVolume = auditLog
    .filter(e => e.approved)
    .reduce((sum, e) => sum + Number(e.transactionDetails.value) / USDT_DIVISOR, 0)

  const agentChartData = AGENT_PROFILES.map(p => {
    const entries = agentEntries(p.id)
    const approved = entries.filter(e => e.approved).reduce((s, e) => s + Number(e.transactionDetails.value) / USDT_DIVISOR, 0)
    const blocked = entries.filter(e => !e.approved).reduce((s, e) => s + Number(e.transactionDetails.value) / USDT_DIVISOR, 0)
    return { name: p.name, approved, blocked }
  })

  const maxChartValue = Math.max(1, ...agentChartData.map(d => d.approved + d.blocked))

  return (
    <div className="space-y-6">
      {/* Section A: Agent Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {AGENT_PROFILES.map(profile => {
          const isFrozen = frozenAgents.has(profile.id)
          const spent = agentSpending(profile.id)
          const spendPct = Math.min((spent / profile.dailyLimit) * 100, 100)
          const approved = agentApproved(profile.id)
          const blocked = agentBlocked(profile.id)
          const avgRiskVal = agentAvgRisk(profile.id)
          const lastTs = agentLastAction(profile.id)
          const busy = actionInProgress === profile.id

          return (
            <div key={profile.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {isFrozen ? (
                    <Snowflake className="w-4 h-4 text-blue-500" />
                  ) : (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                  )}
                  <span className={`text-xs font-mono font-bold ${isFrozen ? 'text-blue-600' : 'text-emerald-600'}`}>
                    {isFrozen ? 'FROZEN' : 'ACTIVE'}
                  </span>
                </div>
                <Shield className="w-4 h-4 text-slate-300" />
              </div>

              <h3 className="text-sm font-semibold text-slate-900">{profile.name}</h3>
              <p className="text-xs text-slate-400 font-mono mb-4">{profile.id}</p>

              {/* Daily Spending Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Daily Spending</span>
                  <span className="text-xs font-mono text-slate-700">
                    {spent.toFixed(1)} / {profile.dailyLimit} USDT
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${getSpendingColor(spendPct)}${spendPct >= 80 ? ' animate-pulse' : ''}`}
                    style={{ width: `${spendPct}%` }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <div className="bg-slate-50 rounded-lg p-2">
                  <span className="text-slate-400">Today</span>
                  <p className="font-mono text-slate-700">
                    <span className="text-emerald-600">{approved}</span>
                    {' / '}
                    <span className="text-red-600">{blocked}</span>
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <span className="text-slate-400">Avg Risk</span>
                  <p className={`font-mono font-semibold ${getRiskColor(avgRiskVal)}`}>
                    {avgRiskVal.toFixed(0)}
                  </p>
                </div>
              </div>

              {/* Last Action */}
              <p className="text-xs text-slate-400 mb-3 font-mono">
                {lastTs ? `Last action: ${relativeTime(lastTs)}` : 'No activity yet'}
              </p>

              {/* Policy Summary */}
              <div className="bg-slate-50 rounded-lg p-2 mb-4">
                <p className="text-xs text-slate-500 font-mono">
                  {profile.maxPerTx} USDT/tx | {profile.dailyLimit} USDT/day | {profile.cooldown}s cooldown
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {isFrozen ? (
                  <button
                    onClick={() => void handleUnfreeze(profile.id)}
                    disabled={busy}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Sun className="w-3 h-3" />
                    Unfreeze
                  </button>
                ) : (
                  <button
                    onClick={() => void handleFreeze(profile.id)}
                    disabled={busy}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Snowflake className="w-3 h-3" />
                    Freeze
                  </button>
                )}
                <button
                  onClick={() => void handleSimulateQuick(profile.id)}
                  disabled={busy}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Simulate Tx
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Section B: Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="flex-shrink-0 rounded-lg p-2.5 bg-blue-50">
            <Activity className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
              {stats?.total ?? 0}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Total Transactions</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="flex-shrink-0 rounded-lg p-2.5 bg-emerald-50">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
              {approvalRate}%
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Approval Rate</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="flex-shrink-0 rounded-lg p-2.5 bg-amber-50">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
              {avgRisk}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Avg Risk Score</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="flex-shrink-0 rounded-lg p-2.5 bg-orange-50">
            <DollarSign className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
              {totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Volume (USDT)</p>
          </div>
        </div>
      </div>

      {/* Section C: Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Transaction Feed */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-900 uppercase mb-4 tracking-wider">
            Live Transaction Feed
          </h2>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {[...auditLog].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30).map((entry, i) => {
              const agentName = AGENT_PROFILES.find(p => p.id === entry.agentId)?.name ?? entry.agentId
              return (
                <div
                  key={`${entry.timestamp}-${i}`}
                  className={`p-3 rounded-lg border transition-colors ${
                    entry.approved
                      ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                      : 'border-red-200 bg-red-50/50 hover:bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {entry.approved ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                      )}
                      <span className="text-xs font-semibold font-mono text-slate-700">{agentName}</span>
                      <span className="text-xs font-mono text-slate-800 font-semibold">
                        {(Number(entry.transactionDetails.value) / USDT_DIVISOR).toFixed(2)} USDT
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {entry.transactionDetails.to.slice(0, 8)}...
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.riskScore !== undefined && (
                        <span className={`text-xs font-mono font-semibold ${getRiskColor(entry.riskScore)}`}>
                          R:{entry.riskScore}
                        </span>
                      )}
                      {entry.ruleTriggered && (
                        <span className="bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-xs font-mono">
                          {entry.ruleTriggered}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-mono">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            {auditLog.length === 0 && (
              <div className="text-center text-slate-400 py-8 text-sm">
                No transactions yet. Use the Live Testnet tab or click Simulate Tx above.
              </div>
            )}
          </div>
        </div>

        {/* Right: Heatmap + Emergency Controls */}
        <div className="lg:col-span-4 space-y-6">
          {/* Policy Rule Heatmap */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-900 uppercase mb-4 tracking-wider">
              Rule Trigger Heatmap
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-2 text-slate-500 font-medium">Rule</th>
                    {AGENT_PROFILES.map(p => (
                      <th key={p.id} className="text-center py-2 px-1 text-slate-500 font-medium">
                        {p.name.slice(0, 4)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TRACKED_RULES.map(rule => {
                    const ruleMap = heatmap.get(rule)
                    return (
                      <tr key={rule} className="border-b border-slate-50">
                        <td className="py-2 pr-2 font-mono text-slate-700">{rule}</td>
                        {AGENT_PROFILES.map(p => {
                          const count = ruleMap?.get(p.id) ?? 0
                          const intensity = count > 0 ? Math.max(0.15, count / heatmapMax) : 0
                          return (
                            <td key={p.id} className="text-center py-2 px-1">
                              <span
                                className={`inline-flex items-center justify-center w-8 h-6 rounded font-mono text-xs font-bold ${
                                  count > 0 ? 'text-red-800' : 'text-slate-300'
                                }`}
                                style={count > 0 ? { backgroundColor: `rgba(239, 68, 68, ${intensity})` } : undefined}
                              >
                                {count > 0 ? count : '\u25CB'}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Emergency Controls */}
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-red-700 uppercase mb-4 tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Emergency Controls
            </h2>

            <button
              onClick={() => void handleFreezeAll()}
              disabled={actionInProgress === 'all'}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors mb-4 ring-2 ring-red-300 ring-offset-1 shadow-lg shadow-red-100"
            >
              <Snowflake className="w-5 h-5" />
              {actionInProgress === 'all' ? 'Freezing All Agents...' : 'FREEZE ALL AGENTS'}
            </button>

            <div className="space-y-2">
              {AGENT_PROFILES.map(profile => {
                const isFrozen = frozenAgents.has(profile.id)
                return (
                  <div key={profile.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {isFrozen ? (
                        <Snowflake className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      )}
                      <span className="text-xs font-mono text-slate-700">{profile.name}</span>
                    </div>
                    <button
                      onClick={() => void (isFrozen ? handleUnfreeze(profile.id) : handleFreeze(profile.id))}
                      disabled={actionInProgress !== null}
                      className={`text-xs font-medium px-3 py-1 rounded transition-colors ${
                        isFrozen
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      } disabled:opacity-50`}
                    >
                      {isFrozen ? 'Unfreeze' : 'Freeze'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section D: Spending Chart (CSS-only) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-900 uppercase mb-4 tracking-wider">
          Spending by Agent (USDT)
        </h2>
        {auditLog.length > 0 ? (
          <div className="space-y-4">
            {agentChartData.map(agent => (
              <div key={agent.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-slate-700">{agent.name}</span>
                  <span className="text-xs font-mono text-slate-500">
                    <span className="text-emerald-600">{agent.approved.toFixed(1)}</span>
                    {' / '}
                    <span className="text-red-600">{agent.blocked.toFixed(1)}</span>
                    {' USDT'}
                  </span>
                </div>
                <div className="flex h-5 w-full bg-slate-100 rounded overflow-hidden">
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(agent.approved / maxChartValue) * 100}%` }}
                  />
                  <div
                    className="bg-red-400 transition-all duration-500"
                    style={{ width: `${(agent.blocked / maxChartValue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-emerald-500 rounded" />
                <span className="text-xs text-slate-500">Approved</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-red-400 rounded" />
                <span className="text-xs text-slate-500">Blocked</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[120px] text-slate-400 text-sm">
            No chart data yet. Use the Live Testnet tab to generate transactions.
          </div>
        )}
      </div>
    </div>
  )
}
