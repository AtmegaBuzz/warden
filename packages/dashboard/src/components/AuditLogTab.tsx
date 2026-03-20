import { useState, useMemo } from 'react'
import { CheckCircle, XCircle, Download, AlertTriangle, Shield, ExternalLink } from 'lucide-react'
import { USDT_DIVISOR } from '../constants'

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

interface Props {
  auditLog: AuditEntry[]
}

type AgentFilter = 'all' | 'agent-conservative' | 'agent-moderate' | 'agent-aggressive'
type ResultFilter = 'all' | 'approved' | 'blocked'
type RiskFilter = 'all' | 'low' | 'medium' | 'high'

const AGENT_LABELS: Record<string, string> = {
  'agent-conservative': 'Conservative',
  'agent-moderate': 'Moderate',
  'agent-aggressive': 'Aggressive',
}

function getRiskColor(score: number): string {
  if (score < 30) return 'text-emerald-600'
  if (score < 60) return 'text-amber-600'
  return 'text-red-600'
}

function getRiskBg(score: number): string {
  if (score < 30) return 'bg-emerald-50'
  if (score < 60) return 'bg-amber-50'
  return 'bg-red-50'
}

export function AuditLogTab({ auditLog }: Props) {
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')

  const filteredEntries = useMemo(() => {
    let entries = [...auditLog]

    if (agentFilter !== 'all') {
      entries = entries.filter(e => e.agentId === agentFilter)
    }
    if (resultFilter === 'approved') {
      entries = entries.filter(e => e.approved)
    } else if (resultFilter === 'blocked') {
      entries = entries.filter(e => !e.approved)
    }
    if (riskFilter === 'low') {
      entries = entries.filter(e => (e.riskScore ?? 0) < 30)
    } else if (riskFilter === 'medium') {
      entries = entries.filter(e => (e.riskScore ?? 0) >= 30 && (e.riskScore ?? 0) < 60)
    } else if (riskFilter === 'high') {
      entries = entries.filter(e => (e.riskScore ?? 0) >= 60)
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp)
  }, [auditLog, agentFilter, resultFilter, riskFilter])

  const approvedCount = filteredEntries.filter(e => e.approved).length
  const blockedCount = filteredEntries.filter(e => !e.approved).length

  const topBlockedRules = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of filteredEntries) {
      if (!entry.approved && entry.ruleTriggered) {
        counts.set(entry.ruleTriggered, (counts.get(entry.ruleTriggered) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
  }, [filteredEntries])

  const riskDistribution = useMemo(() => {
    let low = 0
    let medium = 0
    let high = 0
    for (const entry of filteredEntries) {
      const score = entry.riskScore ?? 0
      if (score < 30) low++
      else if (score < 60) medium++
      else high++
    }
    return { low, medium, high }
  }, [filteredEntries])

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(filteredEntries, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clawvault-audit-log.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Agent', 'Amount (USDT)', 'To', 'Risk Score', 'Rule Triggered', 'Result', 'Reason']
    const rows = filteredEntries.map(e => [
      new Date(e.timestamp).toISOString(),
      e.agentId,
      (Number(e.transactionDetails.value) / USDT_DIVISOR).toFixed(2),
      e.transactionDetails.to,
      String(e.riskScore ?? ''),
      e.ruleTriggered ?? '',
      e.approved ? 'Approved' : 'Blocked',
      e.reason,
    ])
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clawvault-audit-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectClass = 'bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500'

  return (
    <div className="space-y-6">
      {/* Section A: Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Agent</label>
            <select
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value as AgentFilter)}
              className={selectClass}
            >
              <option value="all">All Agents</option>
              <option value="agent-conservative">Conservative</option>
              <option value="agent-moderate">Moderate</option>
              <option value="agent-aggressive">Aggressive</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Result</label>
            <select
              value={resultFilter}
              onChange={e => setResultFilter(e.target.value as ResultFilter)}
              className={selectClass}
            >
              <option value="all">All Results</option>
              <option value="approved">Approved</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Risk Level</label>
            <select
              value={riskFilter}
              onChange={e => setRiskFilter(e.target.value as RiskFilter)}
              className={selectClass}
            >
              <option value="all">All Risk</option>
              <option value="low">Low (0-30)</option>
              <option value="medium">Medium (30-60)</option>
              <option value="high">High (60-100)</option>
            </select>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <span className="text-xs text-slate-400 font-mono self-center">
              {filteredEntries.length} entries
            </span>
          </div>
        </div>
      </div>

      {/* Section B: Full Audit Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">#</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Agent</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">To</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Risk</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rule</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Result</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tx</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry, i) => (
                <tr
                  key={`${entry.timestamp}-${i}`}
                  className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                >
                  <td className="py-2.5 px-4 text-xs font-mono text-slate-400">{i + 1}</td>
                  <td className="py-2.5 px-4 text-xs font-mono text-slate-600">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5 px-4 text-xs font-mono text-slate-700">
                    {AGENT_LABELS[entry.agentId] ?? entry.agentId}
                  </td>
                  <td className="py-2.5 px-4 text-xs font-mono text-slate-800 text-right font-semibold">
                    {(Number(entry.transactionDetails.value) / USDT_DIVISOR).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-xs font-mono text-slate-500">
                    {entry.transactionDetails.to.slice(0, 10)}...
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {entry.riskScore !== undefined ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold ${getRiskColor(entry.riskScore)} ${getRiskBg(entry.riskScore)}`}>
                        {entry.riskScore}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-xs">
                    {entry.ruleTriggered ? (
                      <span className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded font-mono">
                        {entry.ruleTriggered}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {entry.approved ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
                        <XCircle className="w-3 h-3" />
                        Blocked
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {entry.txHash ? (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${entry.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-800 text-xs font-mono transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {entry.txHash.slice(0, 8)}...
                      </a>
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-slate-400 py-12 text-sm">
                    No transactions match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section C: Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Approved vs Blocked */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-900 uppercase mb-4 tracking-wider">
            Approved vs Blocked
          </h3>
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-slate-500">Approved</span>
              </div>
              <p className="text-3xl font-bold font-mono text-emerald-600">{approvedCount}</p>
            </div>
            <div className="h-12 w-px bg-slate-200" />
            <div className="text-center">
              <div className="flex items-center gap-1.5 mb-1">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-xs text-slate-500">Blocked</span>
              </div>
              <p className="text-3xl font-bold font-mono text-red-600">{blockedCount}</p>
            </div>
          </div>
        </div>

        {/* Top Blocked Rules */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-900 uppercase mb-4 tracking-wider">
            Top Blocked Rules
          </h3>
          {topBlockedRules.length > 0 ? (
            <div className="space-y-3">
              {topBlockedRules.map(([rule, count]) => (
                <div key={rule} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-xs font-mono text-slate-700">{rule}</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-red-600">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-16 text-sm text-slate-400">
              No blocked transactions.
            </div>
          )}
        </div>

        {/* Risk Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-900 uppercase mb-4 tracking-wider">
            Risk Distribution
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs text-slate-600">Low (0-30)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: filteredEntries.length > 0 ? `${(riskDistribution.low / filteredEntries.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-600 w-6 text-right">{riskDistribution.low}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs text-slate-600">Medium (30-60)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: filteredEntries.length > 0 ? `${(riskDistribution.medium / filteredEntries.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-xs font-mono font-semibold text-amber-600 w-6 text-right">{riskDistribution.medium}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 text-red-600" />
                <span className="text-xs text-slate-600">High (60-100)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full"
                    style={{ width: filteredEntries.length > 0 ? `${(riskDistribution.high / filteredEntries.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-xs font-mono font-semibold text-red-600 w-6 text-right">{riskDistribution.high}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section D: Export Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleExportJSON}
          disabled={filteredEntries.length === 0}
          className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export as JSON
        </button>
        <button
          onClick={handleExportCSV}
          disabled={filteredEntries.length === 0}
          className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export as CSV
        </button>
      </div>
    </div>
  )
}
