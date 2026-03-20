import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { RiskMeter } from './RiskMeter'
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

const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || 'https://sepolia.etherscan.io'

export function TransactionLog({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-slate-900 uppercase mb-4 tracking-wider">
        Transaction Log
      </h2>
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {entries.map((entry, i) => (
          <div
            key={`${entry.timestamp}-${i}`}
            className={`p-3 rounded-lg border transition-colors ${
              entry.approved
                ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                : 'border-red-200 bg-red-50/50 hover:bg-red-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                {entry.approved ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                )}
                <span className="text-sm font-semibold font-mono">
                  {entry.approved ? (
                    <span className="text-emerald-700">APPROVED</span>
                  ) : (
                    <span className="text-red-700">BLOCKED</span>
                  )}
                </span>
                <span className="text-xs text-slate-400 font-mono">{entry.agentId}</span>
                {entry.riskScore !== undefined && entry.riskScore > 60 && (
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                )}
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-slate-500 font-mono">
                <span className="text-slate-400">To:</span> {entry.transactionDetails.to.slice(0, 10)}...
                {' | '}
                <span className="text-slate-800 font-semibold">
                  {(Number(entry.transactionDetails.value) / USDT_DIVISOR).toFixed(2)}
                </span>
                {' USDT'}
              </div>
              {entry.riskScore !== undefined && (
                <RiskMeter score={entry.riskScore} compact />
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              {entry.ruleTriggered && (
                <span className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded font-mono">
                  {entry.ruleTriggered}
                </span>
              )}
              <span className="text-slate-500">{entry.reason}</span>
            </div>

            {entry.txHash && (
              <a
                href={`${EXPLORER_URL}/tx/${entry.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-orange-600 hover:text-orange-700 hover:underline mt-1.5 block font-mono"
              >
                View on Etherscan
              </a>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-center text-slate-400 py-8">
            No transactions yet. Use the Live Testnet tab to test policy enforcement.
          </div>
        )}
      </div>
    </div>
  )
}
